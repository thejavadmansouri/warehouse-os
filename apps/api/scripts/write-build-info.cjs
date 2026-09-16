'use strict';
/*
 * Writes apps/api/dist/build-info.json right after `nest build`.
 *
 * WHY
 *   Until now /health reported `version` from apps/api/package.json, which says
 *   0.0.1 and has said 0.0.1 since the first commit. After an update there was
 *   no way to tell from the running server which build it was actually running:
 *   the shop could be on a half-applied update and still answer {"status":"ok"}.
 *   The version number lives in the root VERSION file, and this stamp records
 *   it together with the moment the build finished, so /health can be compared
 *   against the delivery that was supposed to land.
 *
 * WHERE
 *   dist/build-info.json -- NOT dist/src/build-info.json. The reader
 *   (src/common/build-info.ts) resolves it as two levels above dist/src/common,
 *   which is dist/ in both dev and the installed layout. `nest build` clears
 *   dist (deleteOutDir), so this must run after it: see the build script in
 *   apps/api/package.json.
 *
 * The kit builder stamps its copy again with the kit name + packaging time; the
 * `kit` / `packagedAt` fields are added there, not here.
 */
const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, '..');
const repoRoot = path.join(apiDir, '..', '..');
const outFile = path.join(apiDir, 'dist', 'build-info.json');

function readVersion() {
  // The root VERSION file is the one place a human bumps. If it is missing the
  // package.json version is better than nothing, but never `undefined`.
  try {
    const raw = fs.readFileSync(path.join(repoRoot, 'VERSION'), 'utf8').trim();
    if (raw) return raw;
  } catch {
    /* fall through to package.json */
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(apiDir, 'package.json'), 'utf8'));
    if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
      return pkg.version.trim();
    }
  } catch {
    /* fall through */
  }
  return '0.0.0';
}

if (!fs.existsSync(path.dirname(outFile))) {
  // Writing the stamp into a missing dist would create dist/ with nothing but a
  // metadata file inside -- a build that silently never happened.
  console.error(`build-info: ${path.dirname(outFile)} does not exist - run the build first`);
  process.exit(1);
}

const stamp = {
  version: readVersion(),
  builtAt: new Date().toISOString(),
  node: process.version,
};

fs.writeFileSync(outFile, JSON.stringify(stamp, null, 2) + '\n', 'utf8');
console.log(
  `build-info: v${stamp.version} built ${stamp.builtAt} -> ${path.relative(repoRoot, outFile)}`,
);
