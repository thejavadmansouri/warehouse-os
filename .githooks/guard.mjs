#!/usr/bin/env node
/*
 * Warehouse OS guard — refuses secrets, installers and oversized files
 * before they leave the machine.
 *
 * Called by the hooks in this directory:
 *   pre-commit  -> guard.mjs commit   (checks what the commit would contain)
 *   pre-push    -> guard.mjs push     (checks the commits the remote does not have yet)
 *
 * Why this exists: on 2026-09-16 an audit of the shop laptop found three live
 * access tokens sitting in the repository root, 1.65 GB of Setup executables,
 * a 37k-file payload directory and a multi-gigabyte cargo target tree — none of
 * them ignored. `git add -A` would have committed all of it into a public
 * repository. .gitignore stops the accidents we already know about; this stops
 * the next one, including `git add -f`.
 *
 * Deliberately dependency-free and portable: it only shells out to git, so it
 * behaves the same in Git Bash on Windows and on macOS. Patterns use POSIX ERE
 * because git's own grep engine is the one matching them, and `-P` is not
 * available in every git build.
 *
 * Written to fail closed: if a check cannot run, the push/commit is stopped
 * rather than waved through, because a guard that silently stops checking is
 * worse than no guard at all.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const MODE = process.argv[2] === 'push' ? 'push' : 'commit';
// git passes the remote name as the second argument of pre-push.
const REMOTE = process.argv[3] || 'origin';

const MAX_MB = Number(process.env.WOS_GUARD_MAX_MB || 5);
const WARN_MB = Number(process.env.WOS_GUARD_WARN_MB || 1);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const WARN_BYTES = WARN_MB * 1024 * 1024;

function git(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
}

const ROOT = git(['rev-parse', '--show-toplevel']).trim();
process.chdir(ROOT);

// ── what we refuse by filename ────────────────────────────────────────────────
const FILE_RULES = [
  {
    id: 'env-file',
    why: 'a real environment file; .env.example is the one that belongs in git',
    test: (p) => /(^|\/)\.env(\.[^/]*)?$/.test(p) && !/\.example$/.test(p),
  },
  {
    id: 'key-material',
    why: 'private key material',
    test: (p) => /\.(pem|key|p12|pfx|jks|keystore|ppk)$/i.test(p) || /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/.test(p),
  },
  {
    id: 'token-file',
    why: 'a local session token or credential file',
    test: (p) =>
      /(^|\/)(login\.json|token\.txt|net-token\.txt|credentials\.json|service-account[^/]*\.json|\.npmrc|\.netrc)$/.test(p),
  },
  {
    id: 'artifact',
    why: 'build output, installer or archive — regenerate it, do not commit it',
    test: (p) => /\.(exe|dll|msi|zip|7z|rar|iso|tar|gz|tgz|dump|bak|apk|aab|jar)$/i.test(p),
  },
];

// ── what we refuse inside file contents ───────────────────────────────────────
// The `PRIVATE KEY` marker is assembled from pieces so that this file does not
// match its own rule.
const PRIVATE_KEY_MARKER = 'BEGIN [A-Z ]*' + 'PRIVATE KEY' + '-{5}';

const CONTENT_RULES = [
  { id: 'jwt', level: 'block', why: 'a JWT — a live login token',
    re: 'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.' },
  { id: 'github-token', level: 'block', why: 'a GitHub access token',
    re: '(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})' },
  { id: 'aws-key', level: 'block', why: 'an AWS access key id',
    re: '(AKIA|ASIA)[0-9A-Z]{16}' },
  { id: 'slack-token', level: 'block', why: 'a Slack token',
    re: 'xox[abprs]-[A-Za-z0-9-]{10,}' },
  { id: 'api-key', level: 'block', why: 'an API key',
    re: 'sk-[A-Za-z0-9]{32,}' },
  { id: 'telegram-token', level: 'block', why: 'a Telegram bot token',
    re: '[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}' },
  { id: 'private-key-body', level: 'block', why: 'an embedded private key',
    re: PRIVATE_KEY_MARKER },
  { id: 'pg-password', level: 'block', why: 'a PostgreSQL URL carrying a literal password',
    re: "postgres(ql)?://[A-Za-z0-9_.-]+:[^@$<>'\"{ ]{6,}@",
    // .env.example carries the USER:PASSWORD placeholder on purpose.
    allow: (p) => /\.example$/.test(p) },
  { id: 'bearer-literal', level: 'warn', why: 'a hardcoded bearer token',
    re: '[Aa]uthorization:? *[Bb]earer [A-Za-z0-9._-]{20,}' },
  { id: 'secret-assignment', level: 'warn', why: 'a long literal assigned to a secret-looking name',
    re: "(api[_-]?key|apikey|secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|passwd)[\"']? *[:=] *[\"'][A-Za-z0-9+/_=.-]{24,}[\"']" },
];

// ── allowlist: exact paths, one per line, `#` starts a comment ────────────────
const ALLOW = new Set();
const allowPath = '.githooks/allowlist.txt';
if (existsSync(allowPath)) {
  for (const line of readFileSync(allowPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (t && !t.startsWith('#')) ALLOW.add(t);
  }
}

const ZERO = /^0+$/;

// ── the revisions we judge, and the paths each of them touches ────────────────
// commit: the index, as `git write-tree` sees it.
// push:   each ref being pushed. The hook hands us the remote's sha for every
//         ref, so that is the primary answer for "what does the remote already
//         have"; the remote's tracking refs cover the ref-does-not-exist-there
//         case, which is how a new branch is pushed here.
function targets() {
  if (MODE === 'commit') {
    let tree;
    try {
      tree = git(['write-tree']).trim();
    } catch {
      return { list: [], notes: [], unverifiable: 'the staged index could not be written (unmerged entries?)' };
    }
    // No HEAD here on purpose: in a repository that has no commit yet that
    // argument is fatal, which would turn the very first commit into a crash.
    const out = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']);
    const paths = new Set(out.split('\0').filter(Boolean));
    return { list: [{ rev: tree, label: 'the index', paths, index: true }], notes: [], unverifiable: null };
  }

  const lines = readFileSync(0, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/))
    .filter((f) => f.length >= 4 && f[1] && !ZERO.test(f[1])); // skip deleted refs

  const remoteShas = lines.map((f) => f[3]).filter((s) => s && !ZERO.test(s));
  const hasTrackingRefs =
    git(['for-each-ref', '--count=1', '--format=%(refname)', `refs/remotes/${REMOTE}/`]).trim() !== '';

  const notes = [];
  const list = [];
  for (const [localRef, localSha, , remoteSha] of lines) {
    const exclude = [];
    if (remoteSha && !ZERO.test(remoteSha)) exclude.push(remoteSha);
    for (const s of remoteShas) if (s !== remoteSha) exclude.push(s);
    if (exclude.length === 0 && !hasTrackingRefs) {
      notes.push(`${REMOTE} has no reachable refs for this branch, so every commit behind it counts as new`);
    }
    let newCommits = '';
    try {
      newCommits = git(['rev-list', localSha, '--not', ...exclude, `--remotes=${REMOTE}`]);
    } catch {
      // Drop only the argument that upsets rev-list. Falling back to "every
      // commit" would report files the remote published long ago and block a
      // perfectly good push.
      newCommits = exclude.length ? git(['rev-list', localSha, '--not', ...exclude]) : git(['rev-list', localSha]);
    }
    if (!newCommits.trim()) continue;
    const listed = execFileSync(
      'git',
      ['diff-tree', '-r', '--no-commit-id', '--name-only', '--diff-filter=ACMR', '--stdin'],
      { input: newCommits, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    );
    const paths = new Set();
    for (const p of listed.split('\n')) if (p.trim()) paths.add(p.trim());
    if (paths.size) list.push({ rev: localSha, label: localRef.replace(/^refs\/heads\//, ''), paths, index: false });
  }
  return { list, notes, unverifiable: null };
}

// `-z` matters: without it git quotes paths that are not plain ASCII (and
// escapes them octally under core.quotepath, which is on by default in a fresh
// clone), so the lookup below would silently miss exactly those files — and a
// size limit that skips files is not a size limit.
function sizesAt(rev) {
  const out = git(['ls-tree', '-r', '-l', '-z', rev]);
  const map = new Map();
  for (const rec of out.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    if (tab < 0) continue;
    const meta = rec.slice(0, tab).split(/\s+/);
    map.set(rec.slice(tab + 1), Number(meta[3]));
  }
  return map;
}

// ── run ───────────────────────────────────────────────────────────────────────
const { list, notes = [], unverifiable } = targets();

const blocks = [];
const warns = [];
const allowed = [];
const scanFailures = [];

if (unverifiable) scanFailures.push(unverifiable);

for (const target of list) {
  const sizes = sizesAt(target.rev);

  for (const p of target.paths) {
    if (ALLOW.has(p)) { allowed.push(p); continue; }
    for (const rule of FILE_RULES) {
      if (rule.test(p)) blocks.push({ path: p, rule: rule.id, detail: rule.why });
    }
    const size = sizes.get(p);
    if (size === undefined) continue; // deleted at this revision, or not part of it
    if (size > MAX_BYTES) {
      blocks.push({ path: p, rule: 'oversized', detail: `${(size / 1048576).toFixed(1)} MB — over the ${MAX_MB} MB limit` });
    } else if (size > WARN_BYTES) {
      warns.push({ path: p, rule: 'large', detail: `${(size / 1048576).toFixed(1)} MB` });
    }
  }

  // Content: let git do the matching, in its own grep engine. `-e` has to come
  // before the revision — git rejects the call otherwise — and when a revision
  // is given every match is prefixed with it.
  const prefix = target.index ? '' : `${target.rev}:`;
  for (const rule of CONTENT_RULES) {
    let out = '';
    try {
      // quotepath pinned off so a non-ASCII path comes back raw and can be
      // matched against the path set; otherwise the match is silently dropped.
      const grepArgs = ['-c', 'core.quotepath=false', 'grep', '-I', '-n', '-E'];
      out = target.index
        ? git([...grepArgs, '--cached', '-e', rule.re])
        : git([...grepArgs, '-e', rule.re, target.rev]);
    } catch (err) {
      if (err.status === 1) continue; // clean grep: nothing matched
      scanFailures.push(`${rule.id}: ${String(err.stderr || err.message).trim().split('\n')[0]}`);
      continue;
    }
    for (const line of out.split('\n')) {
      if (!line) continue;
      const body = prefix && line.startsWith(prefix) ? line.slice(prefix.length) : line;
      const first = body.indexOf(':');
      const second = body.indexOf(':', first + 1);
      if (first < 0 || second < 0) continue;
      const path = body.slice(0, first);
      const lineNo = body.slice(first + 1, second);
      if (!target.paths.has(path)) continue;
      if (ALLOW.has(path)) { if (!allowed.includes(path)) allowed.push(path); continue; }
      if (rule.allow && rule.allow(path)) continue;
      (rule.level === 'warn' ? warns : blocks).push({
        path,
        rule: rule.id,
        detail: `${rule.why} (line ${lineNo})`,
      });
    }
  }
}

const label = MODE === 'push' ? 'push' : 'commit';
const dedupe = new Set();
const unique = (items) => items.filter((it) => {
  const k = `${it.path}|${it.rule}|${it.detail}`;
  if (dedupe.has(k)) return false;
  dedupe.add(k);
  return true;
});
const blocked = unique(blocks);
const softWarns = unique(warns);

if (blocked.length || softWarns.length || scanFailures.length || allowed.length) {
  console.log(`\n⚠  Warehouse OS guard — checking this ${label}`);
  for (const n of [...new Set(notes)]) console.log(`  note: ${n}`);
  // An allowlist entry that nobody can see is an invisible bypass.
  if (allowed.length) {
    console.log(`  note: ${allowed.length} path(s) passed only because .githooks/allowlist.txt allows them`);
  }
  if (blocked.length) {
    console.log('\n  ✖ BLOCKED');
    for (const it of blocked) console.log(`      ${it.path}\n        ${it.rule}: ${it.detail}`);
  }
  if (softWarns.length) {
    console.log('\n  ! worth a look (not blocking)');
    for (const it of softWarns) console.log(`      ${it.path}\n        ${it.rule}: ${it.detail}`);
  }
  if (scanFailures.length) {
    console.log('\n  ✖ COULD NOT VERIFY');
    for (const f of scanFailures) console.log(`      ${f}`);
  }
}

if (blocked.length || scanFailures.length) {
  if (blocked.length) {
    console.log(`\n${blocked.length} problem(s) would put a secret or a build artifact into a public repository.`);
  } else {
    console.log('\nA check could not run, so this was stopped rather than waved through.');
  }
  console.log(`The ${label} was stopped. Nothing was written and nothing was sent.\n`);
  console.log('  fix     : remove the offending lines, or `git rm --cached <path>` to keep the file on disk only');
  console.log('  allow   : add the exact path (one per line, with a reason) to .githooks/allowlist.txt');
  console.log(`  override: git ${label === 'push' ? 'push' : 'commit'} --no-verify   (only when you mean it)\n`);
  // exitCode rather than exit(): git reads the hook's output through a pipe,
  // and on Windows process.exit() can cut buffered writes off mid-report —
  // which is exactly the list of offending files the operator needs to see.
  process.exitCode = 1;
} else {
  if (softWarns.length) console.log(`\n✔ nothing blocked — ${label} may proceed (see the notes above)\n`);
  process.exitCode = 0;
}
