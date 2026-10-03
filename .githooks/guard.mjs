#!/usr/bin/env node
/*
 * Warehouse OS guard — refuses secrets, installers and oversized files before
 * they leave the machine.
 *
 * Called by the hooks next to it:
 *   pre-commit -> guard.mjs commit   (what this commit would contain)
 *   pre-push   -> guard.mjs push     (the commits the remote does not have yet)
 *
 * Why: a 2026-09-16 audit found three live access tokens in the repository root,
 * 1.65 GB of Setup executables, a 37k-file payload directory and a multi-gigabyte
 * cargo target tree — none of them ignored — in a PUBLIC repository. .gitignore
 * stops the accidents we already know about; this stops the next one, including
 * `git add -f`.
 *
 * Dependency-free on purpose: it only shells out to git, so it behaves the same
 * in Git Bash on Windows and on macOS. Patterns are POSIX ERE because git's own
 * grep engine matches them, and `-P` is not in every git build.
 *
 * It fails closed: if a check cannot run, the commit or push is stopped rather
 * than waved through. A guard that silently stops checking is worse than none.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MODE = process.argv[2] === 'push' ? 'push' : 'commit';
// git passes the remote name as the first argument of pre-push.
const REMOTE = process.argv[3] || 'origin';

const MAX_MB = 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const ZERO = /^0+$/;

function git(args, input) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
}

// ── refused by filename ───────────────────────────────────────────────────────
const FILE_RULES = [
  {
    id: 'env-file',
    why: 'a real environment file; .env.example is the one that belongs in git',
    test: (p) => /(^|\/)\.env(\.[^/]*)?$/.test(p) && !/\.example$/.test(p),
  },
  {
    id: 'key-material',
    why: 'private key material',
    test: (p) =>
      /\.(pem|key|p12|pfx|jks|keystore|ppk)$/i.test(p) || /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/.test(p),
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

// ── refused inside file contents ──────────────────────────────────────────────
// The `PRIVATE KEY` marker is assembled from pieces so that this file does not
// match its own rule when guard.mjs itself is scanned on the way out.
const CONTENT_RULES = [
  { id: 'jwt', why: 'a JWT — a live login token',
    re: 'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.' },
  { id: 'github-token', why: 'a GitHub access token',
    re: '(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})' },
  { id: 'private-key-body', why: 'an embedded private key',
    re: 'BEGIN [A-Z ]*' + 'PRIVATE KEY' + '-{5}' },
  { id: 'pg-password', why: 'a PostgreSQL URL carrying a literal password',
    re: "postgres(ql)?://[A-Za-z0-9_.-]+:[^@$<>'\"{ ]{6,}@",
    // .env.example carries the USER:PASSWORD placeholder on purpose.
    allow: (p) => /\.example$/.test(p) },
];

// ── the revisions we judge, and the paths each of them touches ────────────────
// commit: the index, as `git write-tree` sees it.
// push:   one entry per ref being pushed. The hook hands us the sha the remote
//         currently has for that ref, which is the exact answer to "what does
//         the remote already have".
function targets() {
  if (MODE === 'commit') {
    let tree;
    try {
      tree = git(['write-tree']).trim();
    } catch {
      return { list: [], failed: 'the staged index could not be written (unmerged entries?)' };
    }
    // No HEAD argument on purpose: in a repository that has no commit yet git
    // rejects it, which would turn the very first commit into a crash.
    const listed = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']);
    return {
      list: [
        { rev: tree, label: 'the index', index: true, paths: new Set(listed.split('\0').filter(Boolean)) },
      ],
    };
  }

  // pre-push stdin: "<local ref> <local sha> <remote ref> <remote sha>" per ref.
  const rows = readFileSync(0, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/))
    .filter((f) => f.length >= 4);

  const list = [];
  for (const [ref, sha, , remoteSha] of rows) {
    if (ZERO.test(sha)) continue; // a ref being deleted has nothing to scan
    // When the remote does not have this ref yet it reports all zeros, and then
    // the fetched tracking refs are the only thing that can say what it already
    // has. Without an exclusion every commit ever made counts as new, so the
    // guard reports files that shipped weeks ago and blocks a good push — which
    // is exactly how a guard gets bypassed with --no-verify.
    const not = ['--not', ZERO.test(remoteSha) ? `--remotes=${REMOTE}` : remoteSha];
    const commits = git(['rev-list', sha, ...not]);
    if (!commits.trim()) continue;
    const listed = git(
      ['diff-tree', '-r', '--no-commit-id', '--name-only', '--diff-filter=ACMR', '--stdin'],
      commits,
    );
    const paths = new Set(
      listed
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean),
    );
    if (paths.size) list.push({ rev: sha, label: ref.replace(/^refs\/heads\//, ''), paths });
  }
  return { list };
}

// `-z` matters: without it git quotes paths that are not plain ASCII (and
// escapes them octally under core.quotepath, on by default in a fresh clone), so
// the lookup below would silently miss exactly those files — and a size limit
// that skips files is not a size limit.
function sizesAt(rev) {
  const out = git(['ls-tree', '-r', '-l', '-z', rev]);
  const map = new Map();
  for (const rec of out.split('\0')) {
    const tab = rec.indexOf('\t');
    if (tab < 0) continue;
    map.set(rec.slice(tab + 1), Number(rec.slice(0, tab).split(/\s+/)[3]));
  }
  return map;
}

// ── run ───────────────────────────────────────────────────────────────────────
const { list, failed } = targets();
const blocks = [];
const scanFailures = failed ? [failed] : [];

for (const target of list) {
  const sizes = sizesAt(target.rev);

  for (const path of target.paths) {
    for (const rule of FILE_RULES) {
      if (rule.test(path)) blocks.push({ path, rule: rule.id, detail: rule.why });
    }
    const size = sizes.get(path);
    if (size === undefined) continue; // not part of this revision
    if (size > MAX_BYTES) {
      blocks.push({
        path,
        rule: 'oversized',
        detail: `${(size / 1048576).toFixed(1)} MB — over the ${MAX_MB} MB limit`,
      });
    }
  }

  // Content: git's own grep engine does the matching. `-e` has to come before
  // the revision — git rejects the call otherwise, and a rejected call that was
  // swallowed once let the whole content scan run dead in silence.
  // quotepath is pinned off so a non-ASCII path comes back raw and can be
  // matched against the path set, instead of being dropped without a word.
  const args = ['-c', 'core.quotepath=false', 'grep', '-I', '-n', '-E', '-e'];
  const prefix = target.index ? '' : `${target.rev}:`;
  for (const rule of CONTENT_RULES) {
    let out;
    try {
      out = target.index
        ? git([...args, rule.re, '--cached'])
        : git([...args, rule.re, target.rev]);
    } catch (err) {
      if (err.status === 1) continue; // clean grep: nothing matched
      scanFailures.push(`${rule.id}: ${String(err.stderr || err.message).trim().split('\n')[0]}`);
      continue;
    }
    for (const line of out.split('\n')) {
      const body = prefix && line.startsWith(prefix) ? line.slice(prefix.length) : line;
      const hit = /^(.*?):(\d+):/.exec(body);
      if (!hit) continue;
      const [, path, lineNo] = hit;
      if (!target.paths.has(path)) continue;
      if (rule.allow?.(path)) continue;
      if (!blocks.some((b) => b.path === path && b.rule === rule.id)) {
        blocks.push({ path, rule: rule.id, detail: `${rule.why} (line ${lineNo})` });
      }
    }
  }
}

if (!blocks.length && !scanFailures.length) {
  process.exitCode = 0;
} else {
  console.log(`\n⚠  Warehouse OS guard — this ${MODE} was stopped\n`);
  for (const b of blocks) console.log(`      ${b.path}\n        ${b.rule}: ${b.detail}`);
  for (const f of scanFailures) console.log(`      ${f}`);
  console.log(
    blocks.length
      ? `\n${blocks.length} problem(s) would put a secret or a build artifact into a public repository.`
      : '\nA check could not run, so this was stopped rather than waved through.',
  );
  console.log('   fix     : remove those files, or `git rm --cached <path>` to keep them on disk only');
  console.log(`   override: git ${MODE} --no-verify   (only when you mean it)`);
  // exitCode rather than exit(): git reads a hook's output through a pipe, and on
  // Windows process.exit() can cut buffered writes off mid-report — which is
  // exactly the list of offending files the operator needs to see.
  process.exitCode = 1;
}
