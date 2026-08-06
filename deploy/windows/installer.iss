; Warehouse OS installer for the Windows server.
;
; ASCII ONLY. Inno Setup 6 reads a .iss without a BOM using the system ANSI
; codepage, so non-ASCII here becomes mojibake in shortcut names and messages.
; The Persian labels the customer sees are created by first-run.ps1 from code
; points instead. Persian documentation lives in README.md.
;
; Run `build.ps1` first -- it produces the `payload` folder this packages.
;
; The layout is deliberate: only `app` is replaced on update. `data`, `config`
; and `backups` belong to the customer and the installer never touches them.

#define AppName "Warehouse OS"
#define AppVersion "0.2.0"
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

[Files]
; Code and runtimes -- these are what an update replaces.
Source: "payload\app\*";     DestDir: "{app}\app";     Flags: recursesubdirs createallsubdirs ignoreversion
Source: "payload\pgsql\*";   DestDir: "{app}\pgsql";   Flags: recursesubdirs createallsubdirs ignoreversion
Source: "payload\scripts\*"; DestDir: "{app}\scripts"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "payload\nssm.exe";  DestDir: "{app}";         Flags: ignoreversion
; Microsoft Visual C++ runtime. PostgreSQL 18 crashes during database creation
; on a machine with an old/absent runtime; extracted to a temp folder, run
; before first-run, and deleted afterwards.
Source: "payload\vc_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Dirs]
; Customer data and settings. `uninsneveruninstall` means even removing the
; program leaves the database and the backups alone -- that is deliberate.
Name: "{app}\data";     Flags: uninsneveruninstall
Name: "{app}\config";   Flags: uninsneveruninstall
Name: "{app}\backups";  Flags: uninsneveruninstall
Name: "{app}\versions"; Flags: uninsneveruninstall

[Run]
; Must run before first-run.ps1: initdb crashes on an old or absent VC++ runtime.
; A no-op if the machine already has a current one.
Filename: "{tmp}\vc_redist.x64.exe"; Parameters: "/install /quiet /norestart"; \
  StatusMsg: "Installing the Microsoft Visual C++ runtime..."; \
  Flags: waituntilterminated

; First-time setup. It skips itself if config\.env already exists, so rerunning
; the installer over an existing install cannot damage the database.
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\scripts\first-run.ps1"" -Root ""{app}"""; \
  StatusMsg: "Setting up the database and services..."; \
  Flags: waituntilterminated

; The console window closes with the installer, so hand the operator the
; addresses and the admin password location as a file they can read afterwards.
Filename: "notepad.exe"; Parameters: """{app}\INSTALL-INFO.txt"""; \
  Description: "Show the server address and next steps"; \
  Flags: postinstall nowait skipifsilent

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
  file. Returning an empty string means "carry on".
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
end;
