'use strict';
/*
 * Writes apps/api/dist/build-info.json right after `nest build`.
 *
 * WHY
 *   Until now /health reported `version` from apps/api/package.json, which says
 *   0.0.1 and has said 0.0.1 since the first commit. After an update there was no
 *   way to tell from the running server which build it was running: the shop
 *   could be on a half-applied update and still answer {"status":"ok"}. The
 *   version lives in the root VERSION file, and this stamp records it with the
 *   moment the build finished, so /health can be compared against the delivery
 *   that was supposed to land.
 *
 * WHERE
 *   dist/build-info.json -- NOT dist/src/build-info.json. The reader
 *   (src/common/build-info.ts) resolves it two levels above dist/src/common,
 *   which is dist/ in both dev and the installed layout. `nest build` clears
 *   dist (deleteOutDir), so this runs after it: see the build script in
 *   apps/api/package.json.
 *
 * The kit builder stamps its copy again with the kit name and packaging time;
 * the `kit` / `packagedAt` fields are added there, not here.
 */
const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, '..');
const repoRoot = path.join(apiDir, '..', '..');
const distDir = path.join(apiDir, 'dist');
const outFile = path.join(distDir, 'build-info.json');

function fail(message) {
  console.error(`build-info: ${message}`);
  process.exit(1);
}

// Writing the stamp into a missing dist would create dist/ holding nothing but a
// metadata file -- a build that silently never happened.
if (!fs.existsSync(distDir)) fail(`${distDir} does not exist - run the build first`);

// The root VERSION file is the one place a human bumps it. A stamp without a
// real version is worse than no stamp, because /health would look authoritative
// and be wrong -- so this fails the build instead of inventing a number.
let version = '';
try {
  version = fs.readFileSync(path.join(repoRoot, 'VERSION'), 'utf8').trim();
} catch {
  /* reported below */
}
if (!version) fail('the root VERSION file is missing or empty - bump it there, not in package.json');

const stamp = { version, builtAt: new Date().toISOString() };
fs.writeFileSync(outFile, JSON.stringify(stamp, null, 2) + '\n', 'utf8');
console.log(`build-info: v${stamp.version} built ${stamp.builtAt} -> ${path.relative(repoRoot, outFile)}`);
