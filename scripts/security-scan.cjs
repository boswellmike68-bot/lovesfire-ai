#!/usr/bin/env node
/**
 * Bozangive Partner Protocol — Security Exposure Scanner
 * Zero dependencies. Uses only Node.js builtins.
 *
 * Usage:
 *   node scripts/security-scan.js                  # run all scans
 *   node scripts/security-scan.js --mode emails    # emails only
 *   node scripts/security-scan.js --mode secrets   # keys/tokens/hex
 *   node scripts/security-scan.js --mode env       # .env file audit
 *
 * Exit codes:
 *   0 = clean
 *   1 = exposures found
 */

const fs = require('fs');
const path = require('path');

// ── Configuration ──────────────────────────────────────────────────

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache', '.parcel-cache']);
const SKIP_EXTENSIONS = new Set(['.db', '.png', '.jpg', '.jpeg', '.gif', '.mp4', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.svg', '.lock', '.tgz']);
const MAX_FILE_SIZE = 512 * 1024; // 512 KB

// Safe patterns that should NOT be flagged
const SAFE_EMAIL_PATTERNS = [
  'example.com', 'placeholder', 'your_', 'your-', 'noreply',
  '@types', '@param', '@returns', '@see', '@ts-', '@import',
  '@media', '@keyframes', '@charset', '@font-face', '@apply',
  'user@', 'someone@', 'test@test', 'email@domain',
  'steward@example', 'name@example', 'your@email'
];

const SAFE_KEY_PATTERNS = [
  'your_key', 'your_', '_here', 'placeholder', 'example',
  '_test_your', '_live_your', 'abc123', 'def456',
  'invalid_key', 'super-secret', 'ci-admin', 'secret-admin'
];

// ── File Walker ────────────────────────────────────────────────────

function walkDir(dir, files = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return files; }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkDir(full, files);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SKIP_EXTENSIONS.has(ext)) continue;
      try {
        const stat = fs.statSync(full);
        if (stat.size > MAX_FILE_SIZE) continue;
      } catch { continue; }
      files.push(full);
    }
  }
  return files;
}

// ── Scanners ───────────────────────────────────────────────────────

function scanEmails(content, filePath) {
  const hits = [];
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.match(emailRegex);
    if (!matches) continue;

    for (const email of matches) {
      const lower = email.toLowerCase();
      // Skip safe patterns
      if (SAFE_EMAIL_PATTERNS.some(p => lower.includes(p))) continue;
      // Skip the public contact email (intentionally visible)
      if (lower === 'bossbozitive@outlook.com') continue;
      // Skip known public government/municipal emails
      if (lower.endsWith('@chatham-kent.ca')) continue;

      hits.push({
        file: filePath,
        line: i + 1,
        match: email,
        category: 'EMAIL',
        severity: lower.includes('gmail') || lower.includes('hotmail') || lower.includes('yahoo')
          ? 'CRITICAL' : 'MEDIUM',
        context: line.trim().substring(0, 120)
      });
    }
  }
  return hits;
}

function scanSecrets(content, filePath) {
  const hits = [];
  const lines = content.split('\n');

  // Token prefix patterns
  const tokenRegex = /(lf_|sk_live_|pk_live_|sk_test_|pk_test_|whsec_|ghp_|gho_|AKIA)[a-zA-Z0-9_-]{16,}/g;
  // Long hex strings (potential secrets)
  const hexRegex = /[0-9a-f]{32,64}/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Token scan
    const tokenMatches = line.match(tokenRegex);
    if (tokenMatches) {
      for (const token of tokenMatches) {
        const lower = token.toLowerCase();
        if (SAFE_KEY_PATTERNS.some(p => lower.includes(p))) continue;
        // Skip import/require lines
        if (line.includes('import ') || line.includes('require(') || line.includes('from \'')) continue;

        hits.push({
          file: filePath,
          line: i + 1,
          match: token.substring(0, 12) + '...<REDACTED>',
          category: 'TOKEN',
          severity: 'CRITICAL',
          context: line.trim().substring(0, 120)
        });
      }
    }

    // Hex scan (skip JSON report files, hash references, comments about hashing)
    if (filePath.endsWith('.json') || filePath.endsWith('.html')) continue;
    const hexMatches = line.match(hexRegex);
    if (hexMatches) {
      for (const hex of hexMatches) {
        // Skip lines that are clearly about hashing/checksums
        if (/hash|sha|integrity|checksum|manifest|digest|random/i.test(line)) continue;
        // Skip lines in code that generate hashes
        if (line.includes('toString(') || line.includes('crypto.') || line.includes('Bytes(')) continue;
        // Skip REDACTED placeholders
        if (line.includes('REDACTED')) continue;

        hits.push({
          file: filePath,
          line: i + 1,
          match: hex.substring(0, 12) + '...<REDACTED>(' + hex.length + ' chars)',
          category: 'HEX_SECRET',
          severity: hex.length >= 48 ? 'CRITICAL' : 'MEDIUM',
          context: line.trim().substring(0, 120)
        });
      }
    }
  }
  return hits;
}

function scanEnv(content, filePath) {
  const hits = [];
  // Only scan .env* files
  const basename = path.basename(filePath);
  if (!basename.startsWith('.env') && basename !== 'FUNDING.yml') return hits;
  // Skip actual .env (gitignored, contains real values intentionally)
  if (basename === '.env') return hits;

  const lines = content.split('\n');
  const sensitiveKeys = /^(.*(?:KEY|SECRET|TOKEN|PASSWORD|ADMIN|EMAIL|ACCOUNT).*?)=(.+)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#') || !line) continue;

    const match = line.match(sensitiveKeys);
    if (!match) continue;

    const [, key, value] = match;
    const lower = value.toLowerCase();

    // Skip obviously safe placeholders
    if (SAFE_KEY_PATTERNS.some(p => lower.includes(p))) continue;
    if (lower.includes('example.com') || lower.includes('placeholder')) continue;
    if (lower.includes('your') || lower.includes('change_me') || lower.includes('xxx')) continue;

    // Skip public contact email
    if (lower === 'bossbozitive@outlook.com') continue;

    hits.push({
      file: filePath,
      line: i + 1,
      match: key + '=<VALUE_PRESENT>',
      category: 'ENV_VALUE',
      severity: /password|secret|private/i.test(key) ? 'CRITICAL' : 'MEDIUM',
      context: line.substring(0, 120)
    });
  }
  return hits;
}

// ── Runner ─────────────────────────────────────────────────────────

function run() {
  const args = process.argv.slice(2);
  const modeIdx = args.indexOf('--mode');
  const mode = modeIdx >= 0 ? args[modeIdx + 1] : 'all';
  const repoRoot = process.cwd();

  console.log('');
  console.log('='.repeat(60));
  console.log('  BOZANGIVE PARTNER PROTOCOL — Security Exposure Scanner');
  console.log('='.repeat(60));
  console.log(`  Repo:  ${path.basename(repoRoot)}`);
  console.log(`  Path:  ${repoRoot}`);
  console.log(`  Mode:  ${mode}`);
  console.log(`  Time:  ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  console.log('');

  const files = walkDir(repoRoot);
  console.log(`Scanning ${files.length} files...\n`);

  let allHits = [];

  for (const file of files) {
    let content;
    try { content = fs.readFileSync(file, 'utf-8'); }
    catch { continue; }

    const rel = path.relative(repoRoot, file);

    if (mode === 'all' || mode === 'emails') {
      allHits.push(...scanEmails(content, rel));
    }
    if (mode === 'all' || mode === 'secrets') {
      allHits.push(...scanSecrets(content, rel));
    }
    if (mode === 'all' || mode === 'env') {
      allHits.push(...scanEnv(content, rel));
    }
  }

  // ── Report ──────────────────────────────────────────────────────

  if (allHits.length === 0) {
    console.log('  STATUS: ALL CLEAR');
    console.log('  No exposures detected.\n');
    console.log('='.repeat(60));
    process.exit(0);
  }

  // Sort: CRITICAL first, then by file
  allHits.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'CRITICAL' ? -1 : 1;
    return a.file.localeCompare(b.file);
  });

  const critical = allHits.filter(h => h.severity === 'CRITICAL').length;
  const medium = allHits.filter(h => h.severity === 'MEDIUM').length;

  console.log(`  EXPOSURES FOUND: ${allHits.length}`);
  console.log(`    CRITICAL: ${critical}`);
  console.log(`    MEDIUM:   ${medium}`);
  console.log('');

  for (const hit of allHits) {
    const sev = hit.severity === 'CRITICAL' ? '[!!]' : '[--]';
    console.log(`  ${sev} ${hit.category} | ${hit.file}:${hit.line}`);
    console.log(`       Match: ${hit.match}`);
    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`  ${critical} CRITICAL | ${medium} MEDIUM | ${allHits.length} TOTAL`);
  console.log('  Run repairs before committing.');
  console.log('='.repeat(60));
  console.log('');

  process.exit(1);
}

run();
