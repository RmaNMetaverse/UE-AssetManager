'use strict';
// Run only while the app is stopped. Restores an archive made by /admin/backup-db.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const data = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const input = process.argv[2];
if (!input) throw new Error('Usage: node restore.js <backup.tar.gz>');
const archive = path.resolve(input);
if (!fs.statSync(archive).isFile()) throw new Error('Backup archive is not a file');
const stage = path.join(data, `restore-stage-${crypto.randomUUID()}`);
const previous = path.join(data, `previous-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(stage, { recursive: true });
try {
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', windowsHide: true })
    .split(/\r?\n/).filter(Boolean);
  if (!entries.includes('catalog.sqlite') || !entries.some(e => e === 'assets/' || e.startsWith('assets/')))
    throw new Error('Archive must contain catalog.sqlite and assets/');
  if (entries.some(e => e.startsWith('/') || e.includes('\\') || e.split('/').includes('..') ||
    !(e === 'catalog.sqlite' || e === 'assets' || e.startsWith('assets/'))))
    throw new Error('Unsafe archive entry');
  execFileSync('tar', ['-xzf', archive, '-C', stage], { windowsHide: true });
  const candidate = new DatabaseSync(path.join(stage, 'catalog.sqlite'));
  try {
    if (candidate.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
      throw new Error('Database integrity check failed');
    for (const row of candidate.prepare('SELECT assetPath,thumbnailPath,thumbnailPosterPath FROM assets').all()) {
      for (const value of Object.values(row)) {
        if (!value?.startsWith('assets/')) continue;
        const target = path.resolve(stage, value);
        if (!target.startsWith(path.resolve(stage, 'assets') + path.sep) || !fs.existsSync(target))
          throw new Error(`Missing asset file in backup: ${value}`);
      }
    }
  } finally { candidate.close(); }
  fs.mkdirSync(previous);
  const old = ['catalog.sqlite', 'catalog.sqlite-wal', 'catalog.sqlite-shm', 'assets'];
  const moved = [];
  try {
    for (const name of old) {
      const source = path.join(data, name);
      if (fs.existsSync(source)) { fs.renameSync(source, path.join(previous, name)); moved.push(name); }
    }
    fs.renameSync(path.join(stage, 'catalog.sqlite'), path.join(data, 'catalog.sqlite'));
    fs.renameSync(path.join(stage, 'assets'), path.join(data, 'assets'));
  } catch (error) {
    for (const name of ['catalog.sqlite', 'assets']) fs.rmSync(path.join(data, name), { recursive: true, force: true });
    for (const name of moved) fs.renameSync(path.join(previous, name), path.join(data, name));
    throw error;
  }
  console.log(`Restore complete. Previous data kept at ${previous}`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
