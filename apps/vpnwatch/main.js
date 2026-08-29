// VpnWatch — menu-bar VPN / IP monitoring light with kill switch.
// Electron, no compilation needed. Persian UI, RTL.

const { app, Tray, Menu, nativeImage, Notification, dialog, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const geo = require('./geo-service');
const store = require('./store');
const killSwitch = require('./kill-switch');

// ---------- Persian digits ----------

function faNum(s) {
  const map = { '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴', '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹' };
  return String(s).replace(/[0-9]/g, (d) => map[d]);
}

// ---------- State ----------

let tray = null;
let timer = null;
let lastState = null; // { status: 'allowed'|'notAllowed'|'unknown', countryCode, country, ip }
let lastCheckDate = null;
let countryDialog = null;

// ---------- Tray light ----------

// Draws a colored status dot (36x36 @2x for crisp retina rendering).
function makeDot(color) {
  const size = 36; // 18pt @2x
  const radius = 14;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2 + 0.5;
      const dy = y - size / 2 + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;
      if (dist <= radius) {
        // White ring on the outside, color inside → looks like a status light
        const ring = dist > radius - 4;
        const [r, g, b] = ring ? [255, 255, 255] : color;
        buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
      } else {
        buf[i + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size, scaleFactor: 2 });
}

const DOT_GREEN = [52, 199, 89];
const DOT_RED = [255, 59, 48];
const DOT_GRAY = [142, 142, 147];

function updateTray() {
  if (!tray) return;
  const state = lastState;
  let dot, code;
  if (!state || state.status === 'unknown') {
    dot = makeDot(DOT_GRAY);
    code = '؟';
  } else if (state.status === 'allowed') {
    dot = makeDot(DOT_GREEN);
    code = state.countryCode;
  } else {
    dot = makeDot(DOT_RED);
    code = state.countryCode;
  }
  tray.setImage(dot);
  tray.setTitle(` ${code}`);
  tray.setToolTip('VpnWatch');
}

// ---------- Notifications ----------

function notify(title, body) {
  try {
    new Notification({ title, body, silent: false }).show();
  } catch (err) {
    console.error('VpnWatch: notification failed:', err.message);
  }
}

function notifyIfNeeded(oldState, newState) {
  if (!store.getAlertOnRed()) return;
  if (!newState || newState.status !== 'notAllowed') return;
  if (oldState && oldState.status === 'notAllowed') return; // only on transition
  notify(
    '⚠️ آی‌پی غیرمجاز شناسایی شد',
    `کشور: ${newState.country} (${newState.countryCode}) — از لیست کشورهای مجاز خارج است.`
  );
}

// ---------- Kill switch ----------

function killSwitchIfNeeded(oldState, newState) {
  if (store.getKillSwitchMode() !== 1) return; // wifi mode only
  if (oldState && oldState.status === newState.status) return; // transitions only

  if (newState.status === 'notAllowed') {
    // Red detected → cut the network to stop the leak.
    if (killSwitch.trigger(true)) {
      notify('🔒 کیلسوییچ فعال شد', 'وای‌فای قطع شد تا ترافیک نشت نکند.');
    }
  } else if (oldState && oldState.status === 'notAllowed' && newState.status === 'allowed') {
    // Back to an allowed country → restore the network.
    killSwitch.trigger(false);
  }
  // unknown → do nothing, no evidence of a leak
}

// ---------- Check ----------

async function checkNow() {
  const info = await geo.check();
  lastCheckDate = new Date();

  let newState;
  if (info) {
    const allowed = store.isAllowed(info.countryCode);
    newState = {
      status: allowed ? 'allowed' : 'notAllowed',
      countryCode: info.countryCode,
      country: info.country,
      ip: info.ip,
    };
    store.addHistory({
      date: new Date().toISOString(),
      ip: info.ip,
      countryCode: info.countryCode,
      country: info.country,
      allowed,
    });
  } else {
    newState = { status: 'unknown', countryCode: null, country: null, ip: null };
  }

  updateTray();
  rebuildMenu();
  notifyIfNeeded(lastState, newState);
  killSwitchIfNeeded(lastState, newState);
  lastState = newState;
}

function scheduleTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(checkNow, store.getCheckInterval() * 1000);
}

// ---------- Launch at login ----------

function launchAgentPath() {
  return path.join(app.getPath('home'), 'Library/LaunchAgents/com.proman.vpnwatch.plist');
}

function launchAtLogin() {
  return fs.existsSync(launchAgentPath());
}

function setLaunchAtLogin(enabled) {
  const plistPath = launchAgentPath();
  if (!enabled) {
    try { fs.unlinkSync(plistPath); } catch { /* not there */ }
    return;
  }
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.proman.vpnwatch</string>
  <key>ProgramArguments</key>
  <array><string>${app.getPath('exe')}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
  <key>ProcessType</key><string>Interactive</string>
</dict>
</plist>`;
  try {
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(plistPath, plist);
  } catch (err) {
    console.error('VpnWatch: launch agent failed:', err.message);
  }
}

// ---------- Custom country dialog ----------

function openCountryDialog() {
  if (countryDialog) { countryDialog.focus(); return; }
  countryDialog = new BrowserWindow({
    width: 320, height: 190,
    resizable: false, minimizable: false, maximizable: false,
    fullscreenable: false, alwaysOnTop: true, skipTaskbar: true,
    title: 'افزودن کشور مجاز',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  countryDialog.setMenuBarVisibility(false);
  countryDialog.loadFile(path.join(__dirname, 'country-dialog.html'));
  countryDialog.on('closed', () => { countryDialog = null; });
}

ipcMain.on('country-submit', (_e, value) => {
  const code = String(value || '').trim().toUpperCase();
  if (code && /^[A-Z]{2}$/.test(code)) {
    if (store.getAllowAll()) store.setAllowAll(false);
    const list = store.getAllowedCountries();
    if (!list.includes(code)) list.push(code);
    store.setAllowedCountries(list);
    rebuildMenu();
    checkNow();
  }
  if (countryDialog) countryDialog.close();
});

ipcMain.on('country-cancel', () => {
  if (countryDialog) countryDialog.close();
});

// ---------- Menu ----------

function fmtTime(d) {
  const hh = faNum(String(d.getHours()).padStart(2, '0'));
  const mm = faNum(String(d.getMinutes()).padStart(2, '0'));
  const ss = faNum(String(d.getSeconds()).padStart(2, '0'));
  return `${hh}:${mm}:${ss}`;
}

function countryName(code) {
  return require('./country-names').countryNamesFA[code] || code;
}

function rebuildMenu() {
  const state = lastState || { status: 'unknown', countryCode: null, country: null, ip: null };

  let stateText, countryLine;
  if (state.status === 'allowed') {
    stateText = `🟢 مجاز — ${state.country}`;
    countryLine = `کشور: ${state.country} (${state.countryCode})`;
  } else if (state.status === 'notAllowed') {
    stateText = `🔴 غیرمجاز — ${state.country}`;
    countryLine = `کشور: ${state.country} (${state.countryCode})`;
  } else {
    stateText = '⚪ نامشخص (آفلاین یا خطا)';
    countryLine = 'کشور: —';
  }

  const lastIp = (store.getHistory()[0] || {}).ip || '—';
  const lastCheck = lastCheckDate ? fmtTime(lastCheckDate) : 'هنوز بررسی نشده';

  // --- interval submenu ---
  const intervalMenu = store.INTERVAL_OPTIONS.map((opt) => {
    const label = opt < 60
      ? `${faNum(opt)} ثانیه`
      : opt === 60 ? '۱ دقیقه' : `${faNum(opt / 60)} دقیقه`;
    return {
      label,
      type: 'radio',
      checked: opt === store.getCheckInterval(),
      click: () => { store.setCheckInterval(opt); scheduleTimer(); rebuildMenu(); },
    };
  });

  // --- allowed countries submenu ---
  const countriesMenu = [
    {
      label: 'همه کشورها',
      type: 'checkbox',
      checked: store.getAllowAll(),
      click: () => { store.setAllowAll(!store.getAllowAll()); rebuildMenu(); checkNow(); },
    },
    { type: 'separator' },
    ...['GB', 'IE', 'DE', 'NL', 'US', 'TR', 'AE', 'IR'].map((code) => ({
      label: `${countryName(code)} (${code})`,
      type: 'checkbox',
      checked: store.getAllowAll() || store.getAllowedCountries().includes(code),
      click: () => {
        if (store.getAllowAll()) store.setAllowAll(false);
        const list = store.getAllowedCountries();
        if (list.includes(code)) {
          list.splice(list.indexOf(code), 1);
          if (list.length === 0) list.push('GB');
        } else {
          list.push(code);
        }
        store.setAllowedCountries(list);
        rebuildMenu();
        checkNow();
      },
    })),
    { type: 'separator' },
    { label: 'افزودن کد دلخواه…', click: openCountryDialog },
  ];

  // --- history submenu ---
  const history = store.getHistory();
  const historyMenu = history.length === 0
    ? [{ label: 'موردی ثبت نشده', enabled: false }]
    : history.slice(0, 20).map((entry) => {
        const d = new Date(entry.date);
        const time = `${faNum(String(d.getHours()).padStart(2, '0'))}:${faNum(String(d.getMinutes()).padStart(2, '0'))}`;
        const mark = entry.allowed ? '🟢 مجاز' : '🔴 غیرمجاز';
        return { label: `${time} — ${entry.countryCode} — ${mark}`, enabled: false };
      });

  // --- kill switch submenu ---
  const ksStatus = store.getKillSwitchMode() === 0
    ? 'وضعیت: خاموش'
    : killSwitch.isConfigured() ? 'وضعیت: آماده ✅' : 'وضعیت: نیاز به نصب ⚠️';
  const ksMenu = [
    { label: ksStatus, enabled: false },
    { type: 'separator' },
    {
      label: 'خاموش',
      type: 'radio',
      checked: store.getKillSwitchMode() === 0,
      click: () => { store.setKillSwitchMode(0); rebuildMenu(); },
    },
    {
      label: 'قطع وای‌فای هنگام قرمز شدن',
      type: 'radio',
      checked: store.getKillSwitchMode() === 1,
      click: () => {
        store.setKillSwitchMode(1);
        rebuildMenu();
        // If we are already red, cut immediately.
        if (lastState && lastState.status === 'notAllowed' && killSwitch.trigger(true)) {
          notify('🔒 کیلسوییچ فعال شد', 'وای‌فای قطع شد تا ترافیک نشت نکند.');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'نصب کیلسوییچ (یک‌بار، رمز مدیر می‌خواهد)',
      click: async () => {
        const ok = await killSwitch.runSetup();
        rebuildMenu();
        killSwitch.trigger(false); // make sure Wi-Fi is back on after setup
        notify(ok ? '✅ کیلسوییچ نصب شد' : '⚠️ نصب کیلسوییچ ناموفق بود', ok
          ? 'از این پس هنگام آی‌پی غیرمجاز، وای‌فای خودکار قطع می‌شود.'
          : 'مشکل در ایجاد دسترسی مدیر. دوباره تلاش کنید.');
      },
    },
    {
      label: 'بازیابی اینترنت',
      enabled: killSwitch.isConfigured(),
      click: () => { killSwitch.trigger(false); rebuildMenu(); },
    },
  ];

  const template = [
    { label: stateText, enabled: false },
    { label: `آی‌پی: ${lastIp}`, enabled: false },
    { label: countryLine, enabled: false },
    { label: `آخرین بررسی: ${lastCheck}`, enabled: false },
    { type: 'separator' },
    { label: 'بررسی الان', accelerator: 'CmdOrCtrl+R', click: checkNow },
    { type: 'separator' },
    { label: 'فاصله بررسی', submenu: intervalMenu },
    { label: 'کشورهای مجاز', submenu: countriesMenu },
    { type: 'separator' },
    { label: 'تاریخچه', submenu: historyMenu },
    { type: 'separator' },
    {
      label: 'اجرای خودکار با روشن شدن مک',
      type: 'checkbox',
      checked: launchAtLogin(),
      click: () => { setLaunchAtLogin(!launchAtLogin()); rebuildMenu(); },
    },
    {
      label: 'هشدار هنگام آی‌پی غیرمجاز',
      type: 'checkbox',
      checked: store.getAlertOnRed(),
      click: () => { store.setAlertOnRed(!store.getAlertOnRed()); rebuildMenu(); },
    },
    { label: 'کیلسوییچ 🔒', submenu: ksMenu },
    { type: 'separator' },
    { label: 'خروج', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
  ];

  const menu = Menu.buildFromTemplate(template);
  tray.setContextMenu(menu);
}

// ---------- App lifecycle ----------

app.whenReady().then(() => {
  app.dock.hide(); // menu-bar accessory app

  killSwitch.installScripts();

  tray = new Tray(makeDot(DOT_GRAY));
  tray.setTitle(' ؟');
  tray.setToolTip('VpnWatch');

  updateTray();
  rebuildMenu();

  scheduleTimer();
  checkNow(); // first check immediately
});

app.on('window-all-closed', () => {
  // Keep running in the menu bar (macOS default: don't quit).
});