<#
    ساخت بسته‌ی نصب ویندوز.

    روی لپ‌تاپ ویندوزی اجرا می‌شود، نه روی مک. دلیلش این است که `sharp`،
    `argon2` و موتور کوئری پریزما باینریِ مخصوص سیستم‌عامل‌اند؛ `npm install`
    روی مک باینری مک می‌سازد و روی سرور ویندوز اجرا نمی‌شود.

    خروجی: پوشه‌ی `payload\` که Inno Setup آن را بسته‌بندی می‌کند.

    پیش‌نیازها (خودت دانلود کرده‌ای):
      -NodeZip   node-v22.x-win-x64.zip
      -PgZip     postgresql-16.x-windows-x64-binaries.zip
      -NssmZip   nssm-2.24.zip

    مثال:
      .\build.ps1 -NodeZip C:\dl\node.zip -PgZip C:\dl\pg.zip -NssmZip C:\dl\nssm.zip
#>
param(
    [Parameter(Mandatory = $true)][string]$NodeZip,
    [Parameter(Mandatory = $true)][string]$PgZip,
    [Parameter(Mandatory = $true)][string]$NssmZip
)

$ErrorActionPreference = 'Stop'

<#
    نسخه‌ی Node که بسته‌بندی می‌شود باید با نسخه‌ای که `npm install` را اجرا
    می‌کند یکی باشد.

    باینری‌های بومی (sharp، argon2، موتور پریزما) برای یک ABI مشخص ساخته
    می‌شوند. اگر نصب با Node 24 (ABI 137) انجام شود و node.exe نسخه‌ی ۲۲
    (ABI 127) داخل بسته برود، برنامه روی سرور مشتری با خطای «برای نسخه‌ی
    دیگری کامپایل شده» بالا نمی‌آید — و آن خطا موقع ساخت دیده نمی‌شود، سر
    مشتری دیده می‌شود.

    پس همین‌جا بلند و واضح شکست بخور، نه آنجا بی‌صدا.
#>
$REQUIRED_NODE_MAJOR = 24

$buildNodeMajor = [int](node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if ($buildNodeMajor -ne $REQUIRED_NODE_MAJOR) {
    throw "این پروژه با Node $REQUIRED_NODE_MAJOR ساخته می‌شود ولی Node $buildNodeMajor روی PATH است. نسخه‌ی درست را نصب کن."
}

$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo    = Resolve-Path (Join-Path $here '..\..')
$payload = Join-Path $here 'payload'
$staging = Join-Path $here '_stage'

function Say($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }

# ---------------------------------------------------------------- پاک‌سازی
Say 'پاک‌سازی خروجی قبلی'
Remove-Item -Recurse -Force $payload, $staging -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $payload, $staging | Out-Null

# ---------------------------------------------------------------- وابستگی‌ها
Say 'نصب وابستگی‌ها (باینری‌های ویندوز)'
Push-Location $repo
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci شکست خورد' }

Say 'تولید کلاینت پریزما'
Push-Location (Join-Path $repo 'apps\api')
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw 'prisma generate شکست خورد' }
Pop-Location

Say 'ساخت API'
npm --workspace @warehouse-os/api run build
if ($LASTEXITCODE -ne 0) { throw 'build API شکست خورد' }

Say 'ساخت پنل وب'
# آدرس API عمداً اینجا ست نمی‌شود: در زمان اجرا از خود مرورگر گرفته می‌شود.
npm --workspace @warehouse-os/web run build
if ($LASTEXITCODE -ne 0) { throw 'build وب شکست خورد' }
Pop-Location

# ---------------------------------------------------------------- app\api
Say 'جمع‌آوری API'
$apiOut = Join-Path $payload 'app\api'
New-Item -ItemType Directory -Force -Path $apiOut | Out-Null
Copy-Item (Join-Path $repo 'apps\api\dist')          $apiOut -Recurse
Copy-Item (Join-Path $repo 'apps\api\prisma')        $apiOut -Recurse
Copy-Item (Join-Path $repo 'apps\api\package.json')  $apiOut

# فقط وابستگی‌های اجرا. نصب داخل خود پوشه انجام می‌شود تا مسیرها ساده بماند.
Push-Location $apiOut
npm install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'نصب وابستگی‌های اجرایی API شکست خورد' }
npx prisma generate
Pop-Location

# ---------------------------------------------------------------- app\web
Say 'جمع‌آوری پنل وب'
$webOut = Join-Path $payload 'app\web'
New-Item -ItemType Directory -Force -Path $webOut | Out-Null
# خروجی standalone در monorepo تودرتو می‌نشیند؛ server.js را پیدا کن.
$standalone = Join-Path $repo 'apps\web\.next\standalone'
$serverJs = Get-ChildItem -Path $standalone -Filter server.js -Recurse |
            Select-Object -First 1
if (-not $serverJs) { throw 'server.js در خروجی standalone پیدا نشد' }
Copy-Item (Split-Path -Parent $serverJs.FullName)\* $webOut -Recurse -Force
# node_modules ریشه‌ی standalone جداست و لازم است.
$rootModules = Join-Path $standalone 'node_modules'
if (Test-Path $rootModules) { Copy-Item $rootModules $webOut -Recurse -Force }

# ---------------------------------------------------------------- رانتایم‌ها
Say 'استخراج Node'
$tmp = Join-Path $staging 'node'
Expand-Archive -Path $NodeZip -DestinationPath $tmp -Force
$nodeExe = Get-ChildItem $tmp -Filter node.exe -Recurse | Select-Object -First 1
if (-not $nodeExe) { throw 'node.exe در آرشیو پیدا نشد' }

# همان بررسی، این بار روی خودِ فایلی که بسته‌بندی می‌شود.
$zipNodeMajor = [int](& $nodeExe.FullName -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if ($zipNodeMajor -ne $REQUIRED_NODE_MAJOR) {
    throw "آرشیو Node نسخه‌ی $zipNodeMajor است ولی وابستگی‌ها با Node $REQUIRED_NODE_MAJOR نصب شده‌اند. باینری‌های بومی روی سرور بالا نمی‌آیند."
}
New-Item -ItemType Directory -Force -Path (Join-Path $payload 'app\node') | Out-Null
Copy-Item $nodeExe.FullName (Join-Path $payload 'app\node\node.exe')

Say 'استخراج PostgreSQL'
$tmpPg = Join-Path $staging 'pg'
Expand-Archive -Path $PgZip -DestinationPath $tmpPg -Force
$pgRoot = Get-ChildItem $tmpPg -Directory |
          Where-Object { Test-Path (Join-Path $_.FullName 'bin\initdb.exe') } |
          Select-Object -First 1
if (-not $pgRoot) { throw 'پوشه‌ی pgsql با bin\initdb.exe پیدا نشد' }
Copy-Item $pgRoot.FullName (Join-Path $payload 'pgsql') -Recurse

Say 'استخراج NSSM'
$tmpN = Join-Path $staging 'nssm'
Expand-Archive -Path $NssmZip -DestinationPath $tmpN -Force
$nssm = Get-ChildItem $tmpN -Filter nssm.exe -Recurse |
        Where-Object { $_.FullName -match 'win64' } | Select-Object -First 1
if (-not $nssm) { throw 'nssm.exe (win64) پیدا نشد' }
Copy-Item $nssm.FullName (Join-Path $payload 'nssm.exe')

# ---------------------------------------------------------------- اسکریپت‌ها
Say 'کپی اسکریپت‌های نصب'
$scriptsOut = Join-Path $payload 'scripts'
New-Item -ItemType Directory -Force -Path $scriptsOut | Out-Null
Copy-Item (Join-Path $here 'first-run.ps1')  $scriptsOut
Copy-Item (Join-Path $here 'services.ps1')   $scriptsOut

Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue

$size = '{0:N0} MB' -f ((Get-ChildItem $payload -Recurse |
         Measure-Object Length -Sum).Sum / 1MB)
Say "آماده شد: $payload  ($size)"
Write-Host 'حالا installer.iss را با Inno Setup باز کن و Compile بزن.' -ForegroundColor Green
