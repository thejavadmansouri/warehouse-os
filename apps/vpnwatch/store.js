// Store — persists settings and history as JSON in the user-data dir.
// (Equivalent of UserDefaults in the original Swift design.)

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  allowAll: false,
  allowedCountries: ['GB'],
  checkInterval: 60, // seconds
  alertOnRed: true,
  killSwitchMode: 0, // 0=off, 1=wifi
  history: [],
};

const MAX_HISTORY = 50;
let data = null;

function filePath() {
  return path.join(app.getPath('userData'), 'vpnwatch.json');
}

function load() {
  if (data) return data;
  try {
    const raw = fs.readFileSync(filePath(), 'utf8');
    data = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    data = { ...DEFAULTS };
  }
  return data;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(filePath()), { recursive: true });
    fs.writeFileSync(filePath(), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('VpnWatch: failed to save settings:', err.message);
  }
}

function get(key) { return load()[key]; }
function set(key, value) { load()[key] = value; save(); }

// --- Allowed countries ---

function getAllowAll() { return get('allowAll'); }
function setAllowAll(v) { set('allowAll', v); }

function getAllowedCountries() { return get('allowedCountries'); }
function setAllowedCountries(list) {
  set('allowedCountries', list.map((c) => c.toUpperCase()));
}

function isAllowed(countryCode) {
  const cc = countryCode.toUpperCase();
  if (get('allowAll')) return true;
  return getAllowedCountries().includes(cc);
}

function getAllowedLabel() {
  if (get('allowAll')) return 'همه کشورها';
  return getAllowedCountries().join('، ');
}

// --- Check interval ---

const INTERVAL_OPTIONS = [30, 60, 300];

function getCheckInterval() { return get('checkInterval'); }
function setCheckInterval(s) { set('checkInterval', s); }

// --- Alert ---

function getAlertOnRed() { return get('alertOnRed'); }
function setAlertOnRed(v) { set('alertOnRed', v); }

// --- Kill switch ---

function getKillSwitchMode() { return get('killSwitchMode'); }
function setKillSwitchMode(m) { set('killSwitchMode', m); }

// --- History ---

function getHistory() { return get('history'); }

function addHistory(entry) {
  const history = get('history');
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  save();
}

module.exports = {
  INTERVAL_OPTIONS,
  getAllowAll, setAllowAll,
  getAllowedCountries, setAllowedCountries,
  isAllowed, getAllowedLabel,
  getCheckInterval, setCheckInterval,
  getAlertOnRed, setAlertOnRed,
  getKillSwitchMode, setKillSwitchMode,
  getHistory, addHistory,
};