; نصب‌کننده‌ی Warehouse OS برای سرور ویندوز.
;
; قبل از Compile باید `build.ps1` اجرا شده و پوشه‌ی `payload` ساخته شده باشد.
;
; چیدمان عمدی است: فقط `app` هنگام آپدیت جایگزین می‌شود. `data`، `config` و
; `backups` مالِ مشتری‌اند و نصب‌کننده هرگز دستشان نمی‌زند.

#define AppName "Warehouse OS"
#define AppVersion "0.2.0"
#define AppRoot "C:\WarehouseOS"

[Setup]
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={#AppRoot}
; مسیر ثابت است چون اسکریپت‌های سرویس و آپدیت رویش حساب می‌کنند.
DisableDirPage=yes
DefaultGroupName={#AppName}
OutputBaseFilename=WarehouseOS-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
; پستگرس و سرویس ویندوز هر دو دسترسی مدیر می‌خواهند.
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern

[Languages]
Name: "fa"; MessagesFile: "compiler:Default.isl"

[Files]
; کد و رانتایم‌ها — اینها با هر آپدیت عوض می‌شوند.
Source: "payload\app\*";     DestDir: "{app}\app";     Flags: recursesubdirs createallsubdirs ignoreversion
Source: "payload\pgsql\*";   DestDir: "{app}\pgsql";   Flags: recursesubdirs createallsubdirs ignoreversion
Source: "payload\scripts\*"; DestDir: "{app}\scripts"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "payload\nssm.exe";  DestDir: "{app}";         Flags: ignoreversion

[Dirs]
; داده و تنظیمات مشتری. `uninsneveruninstall` یعنی حتی حذف برنامه هم
; دیتابیس و بکاپ‌ها را پاک نمی‌کند — این عمدی است.
Name: "{app}\data";     Flags: uninsneveruninstall
Name: "{app}\config";   Flags: uninsneveruninstall
Name: "{app}\backups";  Flags: uninsneveruninstall
Name: "{app}\versions"; Flags: uninsneveruninstall

[Run]
; راه‌اندازی اولیه. اگر config\.env از قبل باشد خودش رد می‌شود، پس اجرای
; دوباره‌ی نصب‌کننده روی نصب موجود دیتابیس را خراب نمی‌کند.
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\scripts\first-run.ps1"" -Root ""{app}"""; \
  StatusMsg: "در حال راه‌اندازی دیتابیس و سرویس‌ها…"; \
  Flags: waituntilterminated

[UninstallRun]
; سرویس‌ها باید قبل از حذف فایل‌ها برداشته شوند، وگرنه فایل‌ها قفل می‌مانند.
Filename: "{app}\nssm.exe"; Parameters: "stop WarehouseOS-Web";   Flags: runhidden; RunOnceId: "stopWeb"
Filename: "{app}\nssm.exe"; Parameters: "stop WarehouseOS-API";   Flags: runhidden; RunOnceId: "stopApi"
Filename: "{app}\nssm.exe"; Parameters: "stop WarehouseOS-DB";    Flags: runhidden; RunOnceId: "stopDb"
Filename: "{app}\nssm.exe"; Parameters: "remove WarehouseOS-Web confirm"; Flags: runhidden; RunOnceId: "rmWeb"
Filename: "{app}\nssm.exe"; Parameters: "remove WarehouseOS-API confirm"; Flags: runhidden; RunOnceId: "rmApi"
Filename: "{app}\nssm.exe"; Parameters: "remove WarehouseOS-DB confirm";  Flags: runhidden; RunOnceId: "rmDb"

[Icons]
Name: "{group}\پنل فروش"; Filename: "http://localhost:3001"
Name: "{group}\پوشه‌ی نصب"; Filename: "{app}"
