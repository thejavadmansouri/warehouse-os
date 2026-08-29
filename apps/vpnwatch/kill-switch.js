// KillSwitch — manages the privileged wifi on/off helper.
//
// How it works:
// 1. installScripts() copies two bash scripts into ~/Library/VpnWatch/scripts/.
// 2. runSetup() asks for the admin password ONCE (native macOS prompt via
//    osascript) and creates a sudoers rule letting THIS user run ONLY the
//    helper without a password. The password is never stored.
// 3. trigger(down) calls `sudo -n helper off|on` to cut/restore wifi.

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, execFileSync } = require('child_process');

const SCRIPTS_RES_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'app', 'scripts')
  : path.join(__dirname, 'scripts');

const SCRIPTS_DIR = path.join(os.homedir(), 'Library/VpnWatch/scripts');
const HELPER_PATH = path.join(SCRIPTS_DIR, 'vpnwatch-killswitch.sh');
const SETUP_PATH = path.join(SCRIPTS_DIR, 'setup-killswitch.sh');

function ensureScriptsDir() {
  if (!fs.existsSync(SCRIPTS_DIR)) {
    fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  }
}

function installScripts() {
  ensureScriptsDir();
  const helperSrc = path.join(SCRIPTS_RES_DIR, 'vpnwatch-killswitch.sh');
  const setupSrc = path.join(SCRIPTS_RES_DIR, 'setup-killswitch.sh');
  if (!fs.existsSync(helperSrc) || !fs.existsSync(setupSrc)) return false;

  for (const [src, dst] of [[helperSrc, HELPER_PATH], [setupSrc, SETUP_PATH]]) {
    if (fs.existsSync(dst)) fs.unlinkSync(dst);
    fs.copyFileSync(src, dst);
    fs.chmodSync(dst, 0o755);
  }
  return true;
}

function helperExists() {
  return fs.existsSync(HELPER_PATH) && fs.accessSync(HELPER_PATH, fs.constants.X_OK) === undefined;
}

function isConfigured() {
  if (!helperExists()) return false;
  try {
    const out = execFileSync('/usr/bin/sudo', ['-n', '-l', HELPER_PATH], {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000,
    });
    return out.includes(HELPER_PATH);
  } catch {
    return false;
  }
}

/** One-time setup: copies scripts and creates the sudoers rule via native admin prompt. */
function runSetup() {
  installScripts();
  if (!helperExists()) return false;

  const script = `do shell script "bash '${SETUP_PATH}' '${HELPER_PATH}'" with administrator privileges`;
  return new Promise((resolve) => {
    const child = execFile('/usr/bin/osascript', ['-e', script], { timeout: 60000 }, (err) => {
      if (err) {
        console.error('VpnWatch setup error:', err.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/** Triggers the kill switch. down=true → cut wifi, down=false → restore. */
function trigger(down) {
  if (!isConfigured()) return false;
  try {
    const status = execFileSync('/usr/bin/sudo', ['-n', HELPER_PATH, down ? 'off' : 'on'], {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  HELPER_PATH, SETUP_PATH,
  installScripts, helperExists, isConfigured,
  runSetup, trigger,
};
