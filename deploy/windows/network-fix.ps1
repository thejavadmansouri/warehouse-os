<#
    Repair LAN access to an already-installed Warehouse OS server.

    ASCII ONLY -- see the note at the top of build.ps1. Windows PowerShell 5.1
    reads .ps1 using the system ANSI codepage, so a non-ASCII byte here breaks
    the parser on the customer's machine.

    Why this exists as its own script: first-run.ps1 exits immediately when
    config\.env is present, so on a live install it can never be re-run to
    rebuild the firewall rules. update.ps1 and services.ps1 do not touch the
    firewall at all. That left no way to repair the single most common field
    failure -- "the panel opens on the server but not on the till".

    The usual cause is the network profile flipping back to Public (a reboot
    where NLA starts before the network is identified, or a new router giving
    the connection a new signature). The old rules were scoped to
    profile=private,domain, so a Public classification silently closed the
    ports. This script rebuilds them as profile=any, which makes the profile
    irrelevant and stops the problem from coming back.

    Safe to run as many times as you like: every step is idempotent.

    Run in an ADMINISTRATOR PowerShell:
        C:\WarehouseOS\scripts\network-fix.ps1
#>
param(
    [string]$Root = 'C:\WarehouseOS',
    [int]$ApiPort = 3000,
    [int]$WebPort = 3001
)

$ErrorActionPreference = 'Stop'

function Say($m)  { Write-Host "`n=== $m" -ForegroundColor Cyan }
function OK($m)   { Write-Host "    OK   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    WARN $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "    FAIL $m" -ForegroundColor Red }

$problems = @()

# ------------------------------------------------------------------- admin
# Every repair below needs elevation. Checking up front beats failing halfway
# with a permissions error the customer cannot interpret.
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Bad 'This script must run as Administrator.'
    Write-Host ''
    Write-Host '  Right-click PowerShell -> Run as administrator, then run it again.'
    exit 1
}

Write-Host ''
Write-Host '  Warehouse OS - network repair' -ForegroundColor White
Write-Host "  root=$Root  api=$ApiPort  web=$WebPort"

# --------------------------------------------------------------- 1 services
# A stopped service looks exactly like a firewall problem from the till, so
# rule this out first. Best-effort: if the install layout is unexpected we
# still want the firewall repair below to run.
Say '1/5  Services'
# Log is spelled out rather than derived from Label: services.ps1 writes
# db.log / api.log / web.log, which is not what lowercasing the label gives.
$services = @(
    @{ Name = 'WarehouseOS-DB';  Label = 'Database'; Log = 'db.log' },
    @{ Name = 'WarehouseOS-API'; Label = 'API';      Log = 'api.log' },
    @{ Name = 'WarehouseOS-Web'; Label = 'Panel';    Log = 'web.log' }
)
foreach ($svc in $services) {
    $s = Get-Service $svc.Name -ErrorAction SilentlyContinue
    if (-not $s) {
        Bad "$($svc.Label) service is not installed ($($svc.Name))"
        $problems += "$($svc.Label) service missing -- run services.ps1"
        continue
    }
    if ($s.Status -ne 'Running') {
        Warn "$($svc.Label) is $($s.Status) -- starting it"
        try {
            Start-Service $svc.Name -ErrorAction Stop
            # Services start in dependency order and the database needs a
            # moment before the API can connect; do not race it.
            Start-Sleep -Seconds 5
            $s = Get-Service $svc.Name
        } catch {
            Bad "$($svc.Label) would not start: $($_.Exception.Message)"
        }
    }
    if ($s.Status -eq 'Running') {
        OK "$($svc.Label) is running"
    } else {
        Bad "$($svc.Label) is $($s.Status) -- see $Root\data\$($svc.Log)"
        $problems += "$($svc.Label) service is not running"
    }
    # Auto-start, or the whole thing is down again after the next power cut.
    try {
        if ($s -and $s.StartType -ne 'Automatic') {
            Set-Service $svc.Name -StartupType Automatic
            OK "$($svc.Label) set to start automatically"
        }
    } catch {
        Warn "$($svc.Label) -- could not check the startup type: $($_.Exception.Message)"
    }
}

# -------------------------------------------------------- 2 network profile
# Not strictly required once the rules are profile=any, but a Private network
# is what the customer expects (discovery, sharing) and costs nothing to fix.
# Domain-joined connections are left alone: Set-NetConnectionProfile refuses
# them, and profile=domain already covers that case.
Say '2/5  Network profile'
try {
    $profiles = Get-NetConnectionProfile -ErrorAction Stop
    foreach ($p in $profiles) {
        if ($p.NetworkCategory -eq 'Public') {
            try {
                Set-NetConnectionProfile -InterfaceIndex $p.InterfaceIndex -NetworkCategory Private -ErrorAction Stop
                OK "$($p.Name) -- switched Public to Private"
            } catch {
                Warn "$($p.Name) -- could not switch to Private: $($_.Exception.Message)"
            }
        } else {
            OK "$($p.Name) -- $($p.NetworkCategory)"
        }
    }
} catch {
    Warn "Could not read the network profiles: $($_.Exception.Message)"
}

# -------------------------------------------------------------- 3 firewall
# The actual fix. delete-then-add rather than `set rule`, so it repairs a
# missing rule and a wrongly-scoped rule with one code path.
#
# profile=any is deliberate. The old profile=private,domain meant one Public
# reclassification took the till offline with no visible cause. This machine
# sits behind the warehouse router, and a port that closes itself after a
# reboot is the bigger risk. The database port is still never opened.
Say '3/5  Firewall rules'
foreach ($port in @($ApiPort, $WebPort)) {
    $name = "WarehouseOS $port"
    netsh advfirewall firewall delete rule name="$name" 2>&1 | Out-Null
    netsh advfirewall firewall add rule name="$name" `
        dir=in action=allow protocol=TCP localport=$port profile=any 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        OK "$name -- inbound TCP $port allowed on every profile"
    } else {
        Bad "$name -- could not create the rule"
        $problems += "firewall rule for port $port"
    }
}

# --------------------------------------------------------------- 4 listener
# A rule that opens a port nothing listens on is still a dead port. More to the
# point: if a listener is bound to 127.0.0.1 only, the firewall is irrelevant
# and no amount of rule editing will ever help.
Say '4/5  Listeners'
foreach ($item in @(@{ Port = $ApiPort; Label = 'API' }, @{ Port = $WebPort; Label = 'Panel' })) {
    $listeners = Get-NetTCPConnection -State Listen -LocalPort $item.Port -ErrorAction SilentlyContinue
    if (-not $listeners) {
        Bad "$($item.Label) -- nothing is listening on $($item.Port)"
        $problems += "no listener on port $($item.Port)"
        continue
    }
    $addresses = @($listeners | ForEach-Object { $_.LocalAddress } | Sort-Object -Unique)
    $onAll = @($addresses | Where-Object { $_ -eq '0.0.0.0' -or $_ -eq '::' }).Count -gt 0
    if ($onAll) {
        OK "$($item.Label) -- listening on all interfaces ($($addresses -join ', '))"
    } else {
        Bad "$($item.Label) -- bound to $($addresses -join ', ') only, not reachable from the network"
        $problems += "$($item.Label) is bound to loopback -- re-run services.ps1"
    }
}

# ----------------------------------------------------------------- 5 report
# The address the till has to use. Getting this wrong (no port, https, or a
# stale IP after DHCP moved the server) looks identical to a firewall problem.
Say '5/5  Address for the till'
$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
         Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
         Select-Object -ExpandProperty IPAddress | Sort-Object -Unique)

if (-not $ips) {
    Bad 'This server has no network address. Check the cable / Wi-Fi.'
    $problems += 'no IPv4 address'
} else {
    foreach ($ip in $ips) {
        Write-Host ''
        Write-Host "    http://${ip}:$WebPort" -ForegroundColor White
    }
    Write-Host ''
    Write-Host '    Type it with the port, and with http -- not https.'
    if ($ips.Count -gt 1) {
        Write-Host '    More than one address here: use the one on the same range as the till.'
    }
    # A DHCP lease that moves is the other half of "it worked yesterday".
    $dynamic = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                 Where-Object { $_.IPAddress -in $ips -and $_.PrefixOrigin -eq 'Dhcp' })
    if ($dynamic) {
        Write-Host ''
        Warn 'This address comes from DHCP and can change after a reboot.'
        Write-Host '         Reserve it for this server in the router, or set it static,'
        Write-Host '         otherwise the till will lose the server again later.'
    }
}

# ------------------------------------------------------------------ summary
Write-Host ''
if ($problems.Count -eq 0) {
    Write-Host '  Everything on this server checks out.' -ForegroundColor Green
} else {
    Write-Host '  Still wrong on this server:' -ForegroundColor Red
    foreach ($p in $problems) { Write-Host "    - $p" -ForegroundColor Red }
}

<#
    Why there is no "it works" test here.

    A request from this server to its own LAN address never crosses the
    firewall -- Windows short-circuits it. So a green result from here would
    prove nothing about the till, and a script that says OK while the till is
    dead is worse than one that says nothing.
#>
Write-Host ''
Write-Host '  Now test from the till itself, not from here:' -ForegroundColor White
if ($ips) {
    Write-Host "      Test-NetConnection $($ips[0]) -Port $WebPort"
    Write-Host '  TcpTestSucceeded : True means this server is now open.'
}
Write-Host ''
