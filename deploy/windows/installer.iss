; Warehouse OS installer for Windows.
;
; ASCII ONLY. Inno Setup 6 reads a .iss without a BOM using the system ANSI
; codepage, so non-ASCII here becomes mojibake in shortcut names and messages.
; The Persian labels the customer sees are created by first-run.ps1 from code
; points instead. Persian documentation lives in README.md.
;
; ONE installer, THREE install types (choose in the wizard's first page):
;
;   full   -- everything on one machine: PostgreSQL + Node + API + web panel
;             + the seller desktop app. The one-stop setup for a bare shop
;             computer: install, and the desktop icon opens the POS.
;   server -- the server half only (services, database, panel). For a shop
;             whose POS computers are separate machines on the LAN.
;   seller -- the seller desktop app only. A second POS computer: the app's
;             own first-run window asks for the server address.
;
; Run `build.ps1` first -- it produces the `payload` folder this packages.
;
; The layout is deliberate: only `app` is replaced on update. `data`, `config`
; and `backups` belong to the customer and the installer never touches them.

#define AppName "Warehouse OS"
#define AppVersion "0.4.0"
#define AppRoot "C:\WarehouseOS"

[Setup]
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={#AppRoot}
; The path is fixed because the service and update scripts depend on it.
DisableDirPage=yes
DefaultGroupName={#AppName}
OutputBaseFilename=WarehouseOS-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
; PostgreSQL and Windows services both need administrator rights.
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern

[Languages]
; Inno ships no Persian translation; the wizard is English. The application
; itself is Persian, and this installer is run by the integrator, not by
; warehouse staff.
Name: "english"; MessagesFile: "compiler:Default.isl"

[Types]
; The wizard shows these three names. "full" is first and therefore the
; default when the operator just clicks Next -- which is exactly right for
; the single-computer shop the installer is made for.
Name: "full";   Description: "Full install - server and seller app on this computer"
Name: "server"; Description: "Server only - database, services and web panel"
Name: "seller"; Description: "Seller app only - connect to an existing server"

[Components]
; "server" carries everything the services need; "seller" is one exe plus an
; icon. Types above map onto these components.
Name: "server"; Description: "Server (database, API, web panel, services)"; Types: full server
Name: "seller"; Description: "Seller desktop app (POS shell)";               Types: full seller

[Tasks]
; A POS computer that boots straight into the selling screen. Shown when the
; seller component is installed; ON by default (unchecked is the escape hatch).
Name: "seller_autostart"; \
  Description: "Start the seller app automatically when Windows starts"; \
  Components: seller

[Files]
; Code and runtimes -- these are what an update replaces. `app` is split by
; component so a "seller"-only install copies ~8 MB, not the whole 1.4 GB
; server tree it will never run.
Source: "payload\app\api\*";     DestDir: "{app}\app\api";     Flags: recursesubdirs createallsubdirs ignoreversion; Components: server
Source: "payload\app\web\*";     DestDir: "{app}\app\web";     Flags: recursesubdirs createallsubdirs ignoreversion; Components: server
; The Node runtime the API and the panel services run on. Without it the
; services point at a file that does not exist and first-run dies halfway --
; exactly what happened with 0.3.2, whose only trace was an error inside
; data\install.log. It lives inside `app` on purpose so updates refresh it too.
Source: "payload\app\node\node.exe"; DestDir: "{app}\app\node"; Flags: ignoreversion; Components: server
Source: "payload\app\desktop\*"; DestDir: "{app}\app\desktop"; Flags: recursesubdirs createallsubdirs ignoreversion; Components: seller
Source: "payload\pgsql\*";   DestDir: "{app}\pgsql";   Flags: recursesubdirs createallsubdirs ignoreversion; Components: server
Source: "payload\scripts\*"; DestDir: "{app}\scripts"; Flags: recursesubdirs createallsubdirs ignoreversion; Components: server
Source: "payload\nssm.exe";  DestDir: "{app}";         Flags: ignoreversion; Components: server
; Microsoft Visual C++ runtime. PostgreSQL 18 crashes during database creation
; on a machine with an old/absent runtime; extracted to a temp folder, run
; before first-run, and deleted afterwards.
Source: "payload\vc_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Components: server

[Registry]
; The autostart is Inno's job, not first-run.ps1's: the task checkbox above is
; the operator's choice and the [Registry] entry honours exactly that choice.
; HKCU (not HKLM) -- the shell is a user app and must not run elevated.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "WarehouseOS-Seller"; \
  ValueData: """{app}\app\desktop\warehouse-seller.exe"""; \
  Tasks: seller_autostart; Components: seller; Flags: uninsdeletevalue

[Dirs]
; Customer data and settings. `uninsneveruninstall` means even removing the
; program leaves the database and the backups alone -- that is deliberate.
Name: "{app}\data";     Flags: uninsneveruninstall; Components: server
Name: "{app}\config";   Flags: uninsneveruninstall; Components: server
Name: "{app}\backups";  Flags: uninsneveruninstall; Components: server
Name: "{app}\versions"; Flags: uninsneveruninstall; Components: server

[Run]
; Must run before first-run.ps1: initdb crashes on an old or absent VC++ runtime.
; A no-op if the machine already has a current one.
Filename: "{tmp}\vc_redist.x64.exe"; Parameters: "/install /quiet /norestart"; \
  StatusMsg: "Installing the Microsoft Visual C++ runtime..."; \
  Flags: waituntilterminated; Components: server

; First-time setup. It skips itself if config\.env already exists, so rerunning
; the installer over an existing install cannot damage the database.
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\scripts\first-run.ps1"" -Root ""{app}"""; \
  StatusMsg: "Setting up the database and services..."; \
  Flags: waituntilterminated; Components: server

; The console window closes with the installer, so hand the operator the
; addresses and the admin password location as a file they can read afterwards.
Filename: "notepad.exe"; Parameters: """{app}\INSTALL-INFO.txt"""; \
  Description: "Show the server address and next steps"; \
  Flags: postinstall nowait skipifsilent; Components: server

Filename: "{app}\app\desktop\warehouse-seller.exe"; \
  Description: "{cm:LaunchProgram,Warehouse OS}"; \
  Flags: postinstall skipifsilent unchecked; Components: seller

[UninstallRun]
; Services must be removed before the files, or the files stay locked.
Filename: "{app}\nssm.exe"; Parameters: "stop WarehouseOS-Web";   Flags: runhidden; RunOnceId: "stopWeb"
Filename: "{app}\nssm.exe"; Parameters: "stop WarehouseOS-API";   Flags: runhidden; RunOnceId: "stopApi"
Filename: "{app}\nssm.exe"; Parameters: "stop WarehouseOS-DB";    Flags: runhidden; RunOnceId: "stopDb"
Filename: "{app}\nssm.exe"; Parameters: "remove WarehouseOS-Web confirm"; Flags: runhidden; RunOnceId: "rmWeb"
Filename: "{app}\nssm.exe"; Parameters: "remove WarehouseOS-API confirm"; Flags: runhidden; RunOnceId: "rmApi"
Filename: "{app}\nssm.exe"; Parameters: "remove WarehouseOS-DB confirm";  Flags: runhidden; RunOnceId: "rmDb"

[UninstallDelete]
; first-run.ps1 creates the shortcuts, so Inno does not know about them. The
; folder is removed by name, which works whatever the Persian labels are.
Type: filesandordirs; Name: "{group}"
Type: files;          Name: "{app}\INSTALL-INFO.txt"

[Code]
{
  Stop the services before any file is copied.

  Without this, reinstalling or upgrading over a running install fails: node.exe
  and postgres.exe hold app\ and pgsql\ open, and Inno cannot replace a locked
  file. The seller app lives under app\desktop as well -- close it too.
  Returning an empty string means "carry on".
}
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  Nssm: String;
begin
  Result := '';
  Nssm := ExpandConstant('{app}\nssm.exe');
  if FileExists(Nssm) then
  begin
    Exec(Nssm, 'stop WarehouseOS-Web', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec(Nssm, 'stop WarehouseOS-API', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec(Nssm, 'stop WarehouseOS-DB',  '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
  Exec('taskkill', '/IM warehouse-seller.exe /F', '', SW_HIDE, ewNoWait, ResultCode);
end;
