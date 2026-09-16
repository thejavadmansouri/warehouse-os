<#
    Warehouse OS - server status tray (Persian). Very small: pure PowerShell
    + Windows Forms, nothing to install, a few KB.

    What it does for the shop operator:
      - a green/red icon in the notification area: green = server up
      - hovering shows the state and the server IP
      - right-click -> a status window with every service and the addresses
      - if the server is down it brings it up by itself (starts stopped
        services, restarts the API if it stopped answering)
      - "Exit" hides it; the scheduled task installed by the installer brings
        it back at the next login, already elevated, without any UAC prompt.

    Modes:
        (none)     tray UI
        -TestOnce  print one status snapshot and exit (for checks)
        -Fix       one-shot repair: start stopped services, restart the API
                   if it does not answer, wait for /health, print the result

    Saved as UTF-8 WITH BOM on purpose: PowerShell 5.1 reads a BOM'd file as
    Unicode, so the Persian UI text is exact on any Windows.
#>
param(
    [string]$Root = 'C:\WarehouseOS',
    [switch]$TestOnce,
    [switch]$Fix
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Continue'
$ApiPort = 3000
$WebPort = 3001
$LogPath = Join-Path $Root 'data\status-tray.log'
$nssm    = Join-Path $Root 'nssm.exe'

$Services = 'WarehouseOS-DB', 'WarehouseOS-API', 'WarehouseOS-Web'

# ------------------------------------------------------------- helpers
function Test-Admin {
    $i = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($i)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-LanIp {
    # Same rule as first-run.ps1: the address on the interface that owns the
    # default route, not "first non-loopback IPv4" (virtual adapters lie).
    try {
        $best = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
                Sort-Object RouteMetric | Select-Object -First 1
        if ($best) {
            $a = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $best.InterfaceIndex -ErrorAction SilentlyContinue |
                 Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } | Select-Object -First 1
            if ($a) { return $a.IPAddress }
        }
    } catch { }
    return (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
            Sort-Object -Property InterfaceMetric | Select-Object -First 1).IPAddress
}

function Probe([string]$url) {
    try {
        Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4 | Out-Null
        return $true
    } catch {
        $r = $_.Exception.Response
        if ($null -ne $r -and $null -ne $r.StatusCode) { return $true }
        return $false
    }
}

function Write-Log([string]$line) {
    try {
        Add-Content -Path $LogPath -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $line) -ErrorAction SilentlyContinue
    } catch { }
}

# One snapshot of everything the UI needs.
function Get-Status {
    $s = [ordered]@{}
    foreach ($name in $Services) {
        $s[$name] = (Get-Service $name -ErrorAction SilentlyContinue).Status
    }
    $s['ApiOk']   = Probe "http://localhost:$ApiPort/health"
    $s['WebOk']   = Probe "http://localhost:$WebPort/"
    $s['Ip']      = Get-LanIp
    $dbOk   = ($s['WarehouseOS-DB']  -eq 'Running')
    $apiOk  = ($s['WarehouseOS-API'] -eq 'Running') -and $s['ApiOk']
    $webOk  = ($s['WarehouseOS-Web'] -eq 'Running') -and $s['WebOk']
    $s['AllGood'] = ($dbOk -and $apiOk -and $webOk)
    return $s
}

# ------------------------------------------------------------ repair path
if ($Fix) {
    Write-Host '=== Warehouse OS - repairing the server ===' -ForegroundColor Cyan
    foreach ($name in $Services) {
        $svc = Get-Service $name -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -ne 'Running') {
            Write-Host "  starting $name..." -ForegroundColor Yellow
            & $nssm start $name 2>&1 | Out-Null
            Start-Sleep -Seconds 5
        }
    }
    # A running API that does not answer is a hung process: restart it.
    Start-Sleep -Seconds 3
    $st = Get-Status
    if (-not $st['ApiOk'] -and $st['WarehouseOS-API'] -eq 'Running') {
        Write-Host '  API is running but not answering - restarting it...' -ForegroundColor Yellow
        & $nssm restart 'WarehouseOS-API' 2>&1 | Out-Null
        Start-Sleep -Seconds 8
    }
    $deadline = (Get-Date).AddSeconds(60)
    do {
        $st = Get-Status
        if ($st['AllGood']) { break }
        Start-Sleep -Seconds 4
    } while ((Get-Date) -lt $deadline)

    if ($st['AllGood']) {
        Write-Host '  Server is UP.' -ForegroundColor Green
        Write-Host ("  Panel:  http://{0}:{1}" -f $st['Ip'], $WebPort)
        Write-Log 'FIX: server is up'
        exit 0
    }
    Write-Host '  Server is still not fully up. See C:\WarehouseOS\data\ (api.log / web.log / db.log)' -ForegroundColor Red
    Write-Log 'FIX: failed'
    exit 1
}

# ------------------------------------------------------------ one-shot mode
if ($TestOnce) {
    $st = Get-Status
    foreach ($name in $Services) {
        Write-Host ("{0,-18} {1}" -f $name, $st[$name])
    }
    Write-Host ("API health         {0}" -f $(if ($st['ApiOk']) { 'answering' } else { 'NOT answering' }))
    Write-Host ("Panel              {0}" -f $(if ($st['WebOk']) { 'answering' } else { 'NOT answering' }))
    Write-Host ("Server IP          {0}" -f $st['Ip'])
    Write-Host ("Overall            {0}" -f $(if ($st['AllGood']) { 'UP' } else { 'DOWN' }))
    exit $(if ($st['AllGood']) { 0 } else { 1 })
}

# ------------------------------------------------------------ tray UI
$elevated = Test-Admin

function New-DotIcon([System.Drawing.Color]$color) {
    $bmp = New-Object System.Drawing.Bitmap 16, 16
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::Transparent)
    $brush = New-Object System.Drawing.SolidBrush $color
    $g.FillEllipse($brush, 2, 2, 12, 12)
    $g.Dispose()
    $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
    $bmp.Dispose()
    return $icon
}
$iconGreen = New-DotIcon ([System.Drawing.Color]::FromArgb(22, 163, 74))
$iconRed   = New-DotIcon ([System.Drawing.Color]::FromArgb(220, 38, 38))

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = $iconRed
$notify.Visible = $true
$notify.Text = 'Warehouse OS ...'

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$itemStatus = $menu.Items.Add('نمایش وضعیت')
$itemFix    = $menu.Items.Add('تعمیر سرور (بالا آوردن سرویس‌ها)')
$menu.Items.Add('-') | Out-Null
$itemExit   = $menu.Items.Add('خروج')
$notify.ContextMenuStrip = $menu

# --- status window (built fresh each time it opens) ---
$script:form = $null
function Show-StatusForm {
    $st = Get-Status
    if ($script:form -and -not $script:form.IsDisposed) { $script:form.Close() }

    $f = New-Object System.Windows.Forms.Form
    $f.Text = 'وضعیت سرور Warehouse OS'
    $f.Size = New-Object System.Drawing.Size(420, 380)
    $f.StartPosition = 'CenterScreen'
    $f.FormBorderStyle = 'FixedDialog'
    $f.MaximizeBox = $false
    $f.TopMost = $true

    $y = 16
    function Add-Row([string]$text, [System.Drawing.Color]$color) {
        $lbl = New-Object System.Windows.Forms.Label
        $lbl.Text = $text
        $lbl.ForeColor = $color
        $lbl.Font = New-Object System.Drawing.Font('Tahoma', 10)
        $lbl.SetBounds(20, $script:y, 370, 26)
        $f.Controls.Add($lbl)
        $script:y += 30
    }
    foreach ($name in $Services) {
        $running = ($st[$name] -eq 'Running')
        $txt = "{0}  :  {1}" -f $(if ($running) { 'کار می‌کند' } else { 'خاموش است' }), $name
        Add-Row $txt $(if ($running) { [System.Drawing.Color]::FromArgb(22,163,74) } else { [System.Drawing.Color]::FromArgb(220,38,38) })
    }
    Add-Row ("API : {0}" -f $(if ($st['ApiOk']) { 'پاسخ می‌دهد' } else { 'پاسخ نمی‌دهد' })) `
        $(if ($st['ApiOk']) { [System.Drawing.Color]::FromArgb(22,163,74) } else { [System.Drawing.Color]::FromArgb(220,38,38) })
    Add-Row ("پنل فروش : {0}" -f $(if ($st['WebOk']) { 'پاسخ می‌دهد' } else { 'پاسخ نمی‌دهد' })) `
        $(if ($st['WebOk']) { [System.Drawing.Color]::FromArgb(22,163,74) } else { [System.Drawing.Color]::FromArgb(220,38,38) })
    Add-Row ("آدرس پنل و صندوق‌ها:  http://$($st['Ip']):$WebPort") ([System.Drawing.Color]::FromArgb(29,78,216))
    Add-Row ("آدرس API (موبایل‌ها):  http://$($st['Ip']):$ApiPort") ([System.Drawing.Color]::FromArgb(29,78,216))

    $btnCopy = New-Object System.Windows.Forms.Button
    $btnCopy.Text = 'کپی آدرس پنل'
    $btnCopy.SetBounds(20, $script:y, 150, 34)
    $btnCopy.Add_Click({ [System.Windows.Forms.Clipboard]::SetText("http://$($st['Ip']):$WebPort") })
    $f.Controls.Add($btnCopy)

    $btnFix = New-Object System.Windows.Forms.Button
    $btnFix.Text = 'تعمیر سرور'
    $btnFix.SetBounds(180, $script:y, 150, 34)
    $btnFix.Add_Click({ Invoke-Fix })
    $f.Controls.Add($btnFix)
    $script:y += 50

    $script:form = $f
    $f.ShowDialog() | Out-Null
}

function Invoke-Fix {
    if ($elevated) {
        # Already elevated (scheduled-task launch): run in a hidden child so
        # the UI stays responsive; the timer turns the icon green when done.
        Start-Process powershell.exe -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Fix"
        $notify.ShowBalloonTip(4000, 'Warehouse OS', 'در حال تعمیر سرور... چند لحظه صبر کن.', [System.Windows.Forms.ToolTipIcon]::Info)
    } else {
        Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Fix"
    }
}

$itemStatus.Add_Click({ Show-StatusForm })
$itemFix.Add_Click({ Invoke-Fix })
$itemExit.Add_Click({
    $notify.Visible = $false
    $timer.Stop()
    [System.Windows.Forms.Application]::Exit()
})

# --- polling timer ---
$lastGood = $null
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 15000
$timer.Add_Tick({
    $st = Get-Status
    if ($st['AllGood']) {
        $notify.Icon = $iconGreen
        $notify.Text = ("سرور فعال  |  پنل: http://{0}:{1}" -f $st['Ip'], $WebPort)
        if ($script:lastGood -eq $false) {
            $notify.ShowBalloonTip(3000, 'Warehouse OS', 'سرور بالای آمد ✔', [System.Windows.Forms.ToolTipIcon]::Info)
        }
        $script:lastGood = $true
    } else {
        $notify.Icon = $iconRed
        $notify.Text = 'سرور قطع است! راست‌کلیک -> تعمیر سرور'
        if ($script:lastGood -ne $false) {
            $notify.ShowBalloonTip(5000, 'Warehouse OS', 'سرور قطع است! راست‌کلیک کن و «تعمیر سرور» را بزن.', [System.Windows.Forms.ToolTipIcon]::Error)
            Write-Log 'DOWN detected'
        }
        $script:lastGood = $false
        # Self-heal: a service that simply stopped is started again, silently.
        if ($elevated) {
            foreach ($name in $Services) {
                if ($st[$name] -ne 'Running') {
                    & $nssm start $name 2>&1 | Out-Null
                    Write-Log "auto-start $name"
                }
            }
        }
    }
})

$timer.Start()
# first tick right away so the icon is correct immediately
& { $st = Get-Status
    if ($st['AllGood']) { $notify.Icon = $iconGreen; $notify.Text = ("سرور فعال  |  پنل: http://{0}:{1}" -f $st['Ip'], $WebPort); $script:lastGood = $true }
    else { $notify.Icon = $iconRed; $notify.Text = 'سرور قطع است!'; $script:lastGood = $false } }

[System.Windows.Forms.Application]::Run()
$notify.Visible = $false
