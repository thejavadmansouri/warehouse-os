/*
 * set-label-settings.cjs
 *
 * The "Setting label size" step of apply-update.ps1 (68%).
 *
 * apply-update.ps1 has always expected this file next to itself, and the update
 * kit was never assembled without it, so the file simply did not exist. It runs
 * with the working directory set to <Root>\app\api while both Windows services
 * are stopped.
 *
 * Why it talks to PostgreSQL directly instead of the API: the API is stopped at
 * this point in the update, and the HTTP route (PUT /labels/settings) is
 * ADMIN/MANAGER only. The Prisma client that is already installed inside the
 * app is the shortest honest path.
 *
 * Why it does not overwrite existing values: LabelSettings is ONE singleton row
 * that serves BOTH label workflows --
 *
 *   product labels : TSC TTP-244 Pro, 105 mm roll, two 51x32 mm die-cut labels
 *   shelf labels   : roll width and label size the shop picked in the panel
 *
 * so writing values from an update script to satisfy one workflow silently
 * breaks the other. The shop's own numbers (set in the panel by a human) are
 * the authority; this script only makes sure the row exists exactly the way
 * LabelsService.getSettings() would create it, and then prints what is set so
 * the update log records the real state. Setting values on purpose is opt-in
 * through "mode": "force" in label-settings.json.
 *
 * Exit code 0 = row exists and was printed. Anything else = apply-update.ps1
 * aborts the update with the message below.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'label-settings.json');

/** Matches the PowerShell regex: double-quoted value first, then bare. */
function readDatabaseUrl(root) {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();

  const envFile = path.join(root, 'config', '.env');
  if (!fs.existsSync(envFile)) {
    throw new Error('config\\.env not found at ' + envFile);
  }
  const text = fs.readFileSync(envFile, 'utf8');
  const quoted = text.match(/DATABASE_URL\s*=\s*"([^"]+)"/);
  const bare = text.match(/DATABASE_URL\s*=\s*([^\r\n]+)/);
  const value = quoted ? quoted[1] : bare ? bare[1] : '';
  if (!value.trim()) throw new Error('DATABASE_URL is missing from ' + envFile);
  return value.trim();
}

/**
 * apply-update.ps1 pushes <Root>\app\api as the working directory before
 * calling node, so two levels up is the install root. WOS_ROOT wins when it is
 * set (useful when running this by hand during a rehearsal).
 */
function findRoot() {
  const candidates = [
    process.env.WOS_ROOT,
    path.resolve(process.cwd(), '..', '..'),
    'C:\\WarehouseOS',
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'config'))) return dir;
  }
  throw new Error(
    'Cannot locate the install root (no config folder found). Set WOS_ROOT and run again.',
  );
}

/** The app's own installed client; the kit is not allowed to need its own. */
function loadPrismaClient(root) {
  const clientPath = path.join(root, 'app', 'api', 'node_modules', '@prisma', 'client');
  if (!fs.existsSync(clientPath)) {
    throw new Error('@prisma/client not found at ' + clientPath);
  }
  const mod = require(clientPath);
  const PrismaClient = mod.PrismaClient || (mod.default && mod.default.PrismaClient);
  if (!PrismaClient) throw new Error('@prisma/client did not export PrismaClient');
  return PrismaClient;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return { mode: 'seed' };
  const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  return parsed && typeof parsed === 'object' ? parsed : { mode: 'seed' };
}

/** How many labels fit side by side on the roll - the number that matters. */
function describe(row) {
  const media = row.mediaWidthMm || row.widthMm;
  const perRow = row.widthMm > 0 ? Math.floor(media / row.widthMm) : 0;
  return (
    'columns=' + row.columns +
    ' widthMm=' + row.widthMm +
    ' heightMm=' + row.heightMm +
    ' gapMm=' + row.gapMm +
    // undefined happens when the generated client predates the label_media_width
    // migration (a rehearsal against an old install); say so instead of printing
    // the word undefined into the shop's update log.
    ' mediaWidthMm=' + (row.mediaWidthMm === null || row.mediaWidthMm === undefined ? 'not set' : row.mediaWidthMm) +
    ' -> ' + perRow + ' label(s) per row on ' + media + ' mm' +
    ' | barcodeText=' + row.showBarcodeText +
    ' name=' + row.showName +
    ' printer=' + (row.printerName || row.printerHost || 'not set')
  );
}

async function main() {
  const root = findRoot();
  const config = loadConfig();
  const mode = String(config.mode || 'seed').toLowerCase();

  process.env.DATABASE_URL = readDatabaseUrl(root);

  const PrismaClient = loadPrismaClient(root);
  const prisma = new PrismaClient();

  try {
    let row = await prisma.labelSettings.findUnique({ where: { id: 'singleton' } });
    const existed = Boolean(row);

    if (!existed) {
      // Same shape the application creates on a fresh install: schema defaults.
      row = await prisma.labelSettings.create({
        data: Object.assign({ id: 'singleton' }, config.seed || {}),
      });
      console.log('label settings: row was missing - created with defaults');
    } else {
      console.log('label settings: existing row kept');
    }

    if (mode === 'force' && config.values) {
      row = await prisma.labelSettings.update({
        where: { id: 'singleton' },
        data: config.values,
      });
      console.log('label settings: values FORCED from label-settings.json');
    } else if (mode === 'force') {
      console.log('label settings: mode is force but no "values" given - nothing written');
    } else {
      console.log('label settings: mode is seed - panel values untouched');
    }

    console.log('label settings: ' + describe(row));
    console.log('label settings: ' + JSON.stringify(row));
    console.log('label settings: done (root ' + root + ')');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('label settings FAILED: ' + (err && err.message ? err.message : err));
  process.exit(1);
});
