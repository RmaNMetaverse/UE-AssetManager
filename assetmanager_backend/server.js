'use strict';

// One process serves the UI, API, SQLite catalogue and host-filesystem assets.
// Requires Node 24 (the runtime pinned in Dockerfile).
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { DatabaseSync, backup } = require('node:sqlite');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const ASSET_DIR = path.join(DATA_DIR, 'assets');
const STAGING_DIR = path.join(DATA_DIR, 'staging');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SESSION_DIR = path.join(STAGING_DIR, 'resumable');
const DB_FILE = path.join(DATA_DIR, 'catalog.sqlite');
const FRONTEND_DIR = path.resolve(__dirname, '..', 'assetmanager_frontend');
for (const dir of [DATA_DIR, ASSET_DIR, STAGING_DIR, BACKUP_DIR, SESSION_DIR]) fs.mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password TEXT NOT NULL, isAdmin INTEGER NOT NULL DEFAULT 0,
  RGB INTEGER NOT NULL DEFAULT 0, LiquidGlass INTEGER NOT NULL DEFAULT 0,
  ThemeColor TEXT NOT NULL DEFAULT '#ffa31a', createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY, externalId INTEGER NOT NULL UNIQUE,
  assetName TEXT NOT NULL, thumbnailPath TEXT NOT NULL,
  thumbnailPosterPath TEXT, assetPath TEXT NOT NULL, category TEXT NOT NULL,
  isVideo INTEGER NOT NULL DEFAULT 0, isAnimated INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]', displayOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL, storageId TEXT
);
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL, assetId INTEGER NOT NULL
    REFERENCES assets(id) ON DELETE CASCADE, createdAt TEXT NOT NULL,
  UNIQUE(username, assetId)
);
CREATE TABLE IF NOT EXISTS sessions (
  tokenHash TEXT PRIMARY KEY, userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expiresAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_order_idx ON assets(displayOrder, externalId);
CREATE UNIQUE INDEX IF NOT EXISTS assets_name_category_idx ON assets(assetName COLLATE NOCASE, category COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS favorites_user_idx ON favorites(username);`);

const app = express();
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
const PORT = Number(process.env.PORT || 4030);
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 50 * 1024 ** 3);

const upload = multer({
  storage: multer.diskStorage({ destination: STAGING_DIR, filename: (_req, _file, cb) => cb(null, crypto.randomUUID()) }),
  limits: { fileSize: MAX_FILE_BYTES, files: 3, fields: 16 }
}).fields([{ name: 'assetFile', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }, { name: 'thumbnailPoster', maxCount: 1 }]);

const fail = (res, status, message) => res.status(status).json({ success: false, error: message });
const run = (handler) => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next);
const now = () => new Date().toISOString();
const one = (sql, ...args) => db.prepare(sql).get(...args);
const many = (sql, ...args) => db.prepare(sql).all(...args);
const exec = (sql, ...args) => db.prepare(sql).run(...args);
const bool = (value) => value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
if (one('SELECT COUNT(*) AS n FROM users').n === 0) {
  const initialPassword = process.env.ADMIN_PASSWORD || 'admin';
  const initialName = process.env.ADMIN_USERNAME || 'admin';
  exec('INSERT INTO users(username,password,isAdmin,createdAt) VALUES(?,?,1,?)',
    initialName, bcrypt.hashSync(initialPassword, 12), now());
}
const tagsOf = (value) => {
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean);
  if (!value) return [];
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try { return tagsOf(JSON.parse(value)); } catch (_) { /* comma-separated fallback */ }
  }
  return String(value).split(',').map(s => s.trim()).filter(Boolean);
};
const videoName = (name) => /\.(mp4|mov|avi|wmv|mkv|flv|webm|mpeg|mpg|m4v)$/i.test(name || '');
const videoTags = (tags) => tags.some(tag => /video|movie|clip|flipbook|mp4|mov|avi|webm/i.test(tag));
const publicOrigin = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const fileUrl = (req, value) => value && value.startsWith('assets/')
  ? `${publicOrigin(req)}/stored-files/${value.slice(7).split('/').map(encodeURIComponent).join('/')}` : value;
function presentAsset(req, row) {
  if (!row) return null;
  return { ...row, tags: tagsOf(row.tags), thumbnailPath: fileUrl(req, row.thumbnailPath),
    thumbnailPosterPath: fileUrl(req, row.thumbnailPosterPath), assetPath: fileUrl(req, row.assetPath) };
}
const presentUser = (row) => ({ id: row.id, username: row.username, isAdmin: !!row.isAdmin,
  RGB: row.RGB, LiquidGlass: row.LiquidGlass, ThemeColor: row.ThemeColor, createdAt: row.createdAt });
const assetByExternalId = id => one('SELECT * FROM assets WHERE externalId=?', id);
const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
function nextExternalId() {
  let expected = 1;
  for (const row of many('SELECT externalId FROM assets ORDER BY externalId')) {
    if (row.externalId > expected) break;
    if (row.externalId === expected) expected++;
  }
  return expected;
}
function updateAsset(id, changes) {
  const allowed = ['assetName', 'thumbnailPath', 'thumbnailPosterPath', 'assetPath', 'category',
    'isVideo', 'isAnimated', 'tags', 'externalId'];
  const entries = Object.entries(changes).filter(([key]) => allowed.includes(key));
  if (!entries.length) return;
  exec(`UPDATE assets SET ${entries.map(([key]) => `${key}=?`).join(', ')} WHERE id=?`,
    ...entries.map(([key, value]) => key === 'tags' ? JSON.stringify(tagsOf(value)) : value), id);
}
function auth(req, res, next) {
  const token = /^Bearer (.+)$/i.exec(req.get('authorization') || '')?.[1];
  if (!token) return fail(res, 401, 'Sign in required');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const user = one(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.userId
    WHERE s.tokenHash=? AND s.expiresAt>?`, hash, now());
  if (!user) return fail(res, 401, 'Invalid or expired token');
  req.user = user;
  req.tokenHash = hash;
  next();
}
function admin(req, res, next) {
  if (!req.user.isAdmin) return fail(res, 403, 'Admin required');
  next();
}

// A backup waits for in-flight uploads/edits and rejects new writes until its
// archive is complete. This keeps the SQLite snapshot and asset files aligned.
let activeWrites = 0;
let backingUp = false;
function writeGate(_req, res, next) {
  if (backingUp) return fail(res, 503, 'Backup in progress; retry shortly');
  activeWrites++;
  res.once('finish', () => { activeWrites--; });
  res.once('close', () => { if (!res.writableEnded) activeWrites--; });
  next();
}

app.get('/health', (_req, res) => res.json({ success: true }));
app.get('/config', (_req, res) => res.json({ maxFileBytes: MAX_FILE_BYTES }));
app.post('/auth/register', auth, admin, writeGate, run(async (req, res) => {
  const { username, password } = req.body || {};
  if (!/^[\w.-]{2,64}$/.test(username || '') || typeof password !== 'string' || password.length < 8)
    return fail(res, 400, 'Username must be 2–64 letters/numbers; password must be at least 8 characters');
  const hash = await bcrypt.hash(password, 12);
  try {
    const result = exec('INSERT INTO users(username,password,isAdmin,createdAt) VALUES(?,?,?,?)',
      username, hash, bool(req.body.isAdmin), now());
    res.status(201).json({ success: true, userId: Number(result.lastInsertRowid) });
  } catch (error) {
    if (String(error).includes('UNIQUE')) return fail(res, 409, 'Username already exists');
    throw error;
  }
}));
app.post('/auth/login', writeGate, run(async (req, res) => {
  const user = one('SELECT * FROM users WHERE username=?', String(req.body?.username || ''));
  if (!user || !await bcrypt.compare(String(req.body?.password || ''), user.password))
    return fail(res, 401, 'Invalid credentials');
  const token = crypto.randomBytes(32).toString('hex');
  exec('INSERT INTO sessions(tokenHash,userId,expiresAt) VALUES(?,?,?)',
    crypto.createHash('sha256').update(token).digest('hex'), user.id,
    new Date(Date.now() + 24 * 3600 * 1000).toISOString());
  res.json({ success: true, token, ...presentUser(user) });
}));
app.post('/auth/logout', auth, writeGate, (req, res) => {
  exec('DELETE FROM sessions WHERE tokenHash=?', req.tokenHash);
  res.json({ success: true });
});
app.get('/auth/me', auth, (req, res) => res.json({ success: true, user: presentUser(req.user) }));
app.post('/auth/editpassword', auth, writeGate, run(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!await bcrypt.compare(String(currentPassword || ''), req.user.password))
    return fail(res, 401, 'Current password is incorrect');
  if (typeof newPassword !== 'string' || newPassword.length < 8)
    return fail(res, 400, 'New password must be at least 8 characters');
  exec('UPDATE users SET password=? WHERE id=?', await bcrypt.hash(newPassword, 12), req.user.id);
  exec('DELETE FROM sessions WHERE userId=? AND tokenHash<>?', req.user.id, req.tokenHash);
  res.json({ success: true, message: 'Password updated successfully', userId: req.user.id, username: req.user.username });
}));
app.put('/user/settings', auth, writeGate, (req, res) => {
  const fields = ['RGB', 'LiquidGlass', 'ThemeColor'].filter(k => req.body?.[k] !== undefined);
  if (!fields.length) return fail(res, 400, 'No settings provided');
  const values = fields.map(k => k === 'ThemeColor' ? String(req.body[k]).slice(0, 64) : bool(req.body[k]));
  exec(`UPDATE users SET ${fields.map(k => `${k}=?`).join(',')} WHERE id=?`, ...values, req.user.id);
  res.json({ success: true, user: presentUser(one('SELECT * FROM users WHERE id=?', req.user.id)) });
});

app.get('/categories', auth, (_req, res) => res.json({ success: true,
  categories: many('SELECT DISTINCT category FROM assets ORDER BY category COLLATE NOCASE').map(r => r.category) }));
app.get('/tags', (_req, res) => res.json({ success: true,
  tags: [...new Set(many('SELECT tags FROM assets').flatMap(r => tagsOf(r.tags)))].sort() }));
app.get('/assets', (req, res) => {
  const { search, category, tags, sort } = req.query;
  let rows = many('SELECT * FROM assets');
  if (search) {
    const numeric = /^#?(\d+)$/.exec(String(search).trim());
    rows = numeric ? rows.filter(r => r.externalId === Number(numeric[1]))
      : rows.filter(r => r.assetName.toLowerCase().includes(String(search).toLowerCase()));
  }
  if (category) rows = rows.filter(r => r.category === category);
  if (tags) {
    const requested = tagsOf(tags);
    rows = rows.filter(r => tagsOf(r.tags).some(tag => requested.includes(tag)));
  }
  const sorts = {
    custom: (a, b) => a.displayOrder - b.displayOrder || b.externalId - a.externalId,
    name_asc: (a, b) => a.assetName.localeCompare(b.assetName),
    name_desc: (a, b) => b.assetName.localeCompare(a.assetName),
    date_asc: (a, b) => a.createdAt.localeCompare(b.createdAt),
    date_desc: (a, b) => b.createdAt.localeCompare(a.createdAt),
    id_asc: (a, b) => a.externalId - b.externalId,
    id_desc: (a, b) => b.externalId - a.externalId,
    category: (a, b) => a.category.localeCompare(b.category)
  };
  rows.sort(sorts[sort] || sorts.date_desc);
  const total = rows.length;
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 20));
  res.json({ success: true, assets: rows.slice(offset, offset + limit).map(r => presentAsset(req, r)), total });
});
app.put('/assets/display-order', auth, admin, writeGate, (req, res) => {
  const submitted = req.body?.orderedExternalIds;
  if (!Array.isArray(submitted) || !submitted.length || submitted.some(id => !validId(id)) ||
      new Set(submitted.map(Number)).size !== submitted.length)
    return fail(res, 400, 'Valid, unique orderedExternalIds required');
  const current = many('SELECT externalId FROM assets ORDER BY displayOrder, externalId DESC').map(r => r.externalId);
  if (submitted.some(id => !current.includes(Number(id)))) return fail(res, 409, 'An asset no longer exists');
  const all = [...submitted.map(Number), ...current.filter(id => !submitted.map(Number).includes(id))];
  db.exec('BEGIN IMMEDIATE');
  try {
    all.forEach((id, index) => exec('UPDATE assets SET displayOrder=? WHERE externalId=?', index + 1, id));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  res.json({ success: true, updated: all.length });
});
app.get('/assets/:id/tags', (req, res) => {
  if (!validId(req.params.id)) return fail(res, 400, 'Invalid External ID');
  const asset = assetByExternalId(Number(req.params.id));
  if (!asset) return fail(res, 404, 'Asset not found');
  res.json({ success: true, tags: tagsOf(asset.tags), category: asset.category });
});
app.get('/assets/:id', (req, res) => {
  if (!validId(req.params.id)) return fail(res, 400, 'Invalid id');
  const asset = assetByExternalId(Number(req.params.id));
  if (!asset) return fail(res, 404, 'Asset not found');
  res.json({ success: true, asset: presentAsset(req, asset) });
});

const safeName = original => {
  const base = path.basename(String(original || 'file').replace(/\\/g, '/'));
  return base.replace(/[^\p{L}\p{N}_.() -]/gu, '_').slice(0, 180) || 'file';
};
const fileFields = ['assetFile', 'thumbnail', 'thumbnailPoster'];
function staged(req, field) { return req.files?.[field]?.[0] || null; }
function cleanupStaging(req) {
  for (const file of Object.values(req.files || {}).flat()) {
    try { fs.rmSync(file.path, { force: true }); } catch (_) { /* already moved */ }
  }
}
function multipart(req, res, next) {
  upload(req, res, error => {
    if (error) { cleanupStaging(req); return fail(res, 400, error.message); }
    next();
  });
}
function moveFile(file, storageId, label) {
  if (!file) return null;
  const name = `${label}-${crypto.randomUUID()}-${safeName(file.originalname)}`;
  const destination = path.join(ASSET_DIR, storageId, name);
  fs.renameSync(file.path, destination);
  return `assets/${storageId}/${name}`;
}
function fileChange(req, asset, storageId) {
  const changes = {};
  const uploaded = [];
  for (const [field, column, label] of [
    ['assetFile', 'assetPath', 'asset'], ['thumbnail', 'thumbnailPath', 'thumb'],
    ['thumbnailPoster', 'thumbnailPosterPath', 'poster']
  ]) {
    const file = staged(req, field);
    if (!file) continue;
    const old = asset?.[column];
    const value = moveFile(file, storageId, label);
    changes[column] = value;
    uploaded.push({ value, old });
  }
  return { changes, uploaded };
}
function removeStored(value) {
  if (!value?.startsWith('assets/')) return;
  const parts = value.split('/');
  if (parts.length !== 3 || !/^[0-9a-f-]{36}$/.test(parts[1])) return;
  fs.rmSync(path.join(ASSET_DIR, parts[1], parts[2]), { force: true });
}
const createUploadedAsset = run(async (req, res) => {
  const name = String(req.body.assetName || '').trim();
  const category = String(req.body.category || '').trim();
  const assetFile = staged(req, 'assetFile');
  const thumbnail = staged(req, 'thumbnail');
  if (!name || !category || !assetFile || !thumbnail) {
    cleanupStaging(req); return fail(res, 400, 'Missing required fields or files');
  }
  if (!/\.(jpe?g|png|gif|webm|webp)$/i.test(thumbnail.originalname)) {
    cleanupStaging(req); return fail(res, 400, 'Thumbnail must be JPG, PNG, WebP, GIF, or WebM');
  }
  const exists = one('SELECT id FROM assets WHERE assetName=? COLLATE NOCASE AND category=? COLLATE NOCASE', name, category);
  if (exists) { cleanupStaging(req); return fail(res, 409, 'Asset name already exists in this category'); }
  const storageId = crypto.randomUUID();
  const folder = path.join(ASSET_DIR, storageId);
  fs.mkdirSync(folder);
  try {
    const { changes } = fileChange(req, null, storageId);
    const tags = tagsOf(req.body.tags);
    const isVideo = videoName(assetFile.originalname) || videoTags(tags) || bool(req.body.isVideo) ? 1 : 0;
    const isAnimated = bool(req.body.isAnimated);
    if (!isAnimated && !isVideo && changes.thumbnailPosterPath) removeStored(changes.thumbnailPosterPath);
    const externalId = nextExternalId();
    const order = (one('SELECT MAX(displayOrder) AS n FROM assets').n || 0) + 1;
    const result = exec(`INSERT INTO assets(externalId,assetName,thumbnailPath,thumbnailPosterPath,assetPath,
      category,isVideo,isAnimated,tags,displayOrder,createdAt,storageId)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, externalId, name, changes.thumbnailPath,
      isAnimated || isVideo ? changes.thumbnailPosterPath || null : null,
      changes.assetPath, category, isVideo, isAnimated, JSON.stringify(tags), order, now(), storageId);
    const created = one('SELECT * FROM assets WHERE id=?', Number(result.lastInsertRowid));
    res.status(201).json({ success: true, assetName: name, created: presentAsset(req, created) });
  } catch (error) { fs.rmSync(folder, { recursive: true, force: true }); throw error; }
  finally { cleanupStaging(req); }
});
app.post('/upload', auth, admin, writeGate, multipart, createUploadedAsset);

const CHUNK_SIZE = 16 * 1024 * 1024;
function uploadSession(req) {
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const folder = path.join(SESSION_DIR, id);
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
    if (manifest.owner !== req.user.id) return null;
    return { folder, manifest };
  } catch (_) { return null; }
}
function chunkCount(file) { return Math.ceil(file.size / CHUNK_SIZE); }
function chunkPath(folder, field, index) { return path.join(folder, `${field}-${index}.chunk`); }
app.post('/uploads/start', auth, admin, writeGate, (req, res) => {
  const body = req.body || {};
  const files = body.files || {};
  const replaceId = body.replaceExternalId == null ? null : Number(body.replaceExternalId);
  if (replaceId !== null && (!validId(replaceId) || !assetByExternalId(replaceId)))
    return fail(res, 404, 'Asset to replace not found');
  if (!String(body.category || '').trim() ||
      (replaceId === null && (!String(body.assetName || '').trim() || !files.assetFile || !files.thumbnail)) ||
      (replaceId !== null && !Object.keys(files).length))
    return fail(res, 400, 'Missing asset details or files');
  for (const [field, file] of Object.entries(files)) {
    if (!fileFields.includes(field) || !file || typeof file.name !== 'string' ||
        !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES)
      return fail(res, 400, 'Invalid file description');
  }
  if (files.thumbnail && !/\.(jpe?g|png|gif|webm|webp)$/i.test(files.thumbnail.name))
    return fail(res, 400, 'Invalid thumbnail format');
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  for (const entry of fs.readdirSync(SESSION_DIR)) {
    const folder = path.join(SESSION_DIR, entry);
    try { if (fs.statSync(folder).mtimeMs < cutoff) fs.rmSync(folder, { recursive: true, force: true }); }
    catch (_) { /* another cleanup may have removed it */ }
  }
  const id = crypto.randomUUID();
  const folder = path.join(SESSION_DIR, id);
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({ owner: req.user.id,
    assetName: String(body.assetName).trim(), category: String(body.category).trim(),
    tags: tagsOf(body.tags), isAnimated: bool(body.isAnimated), isVideo: bool(body.isVideo),
    replaceExternalId: replaceId, files }));
  res.status(201).json({ success: true, id, chunkSize: CHUNK_SIZE });
});
app.get('/uploads/:id/status', auth, admin, (req, res) => {
  const session = uploadSession(req);
  if (!session) return fail(res, 404, 'Upload session not found');
  const uploaded = {};
  for (const [field, file] of Object.entries(session.manifest.files)) {
    uploaded[field] = [];
    for (let i = 0; i < chunkCount(file); i++)
      if (fs.existsSync(chunkPath(session.folder, field, i))) uploaded[field].push(i);
  }
  res.json({ success: true, chunkSize: CHUNK_SIZE, uploaded });
});
app.put('/uploads/:id/:field/:index', auth, admin, writeGate, run(async (req, res) => {
  const session = uploadSession(req);
  if (!session) return fail(res, 404, 'Upload session not found');
  const { field } = req.params;
  const index = Number(req.params.index);
  const file = session.manifest.files[field];
  if (!file || !Number.isSafeInteger(index) || index < 0 || index >= chunkCount(file))
    return fail(res, 400, 'Invalid chunk');
  const expected = Math.min(CHUNK_SIZE, file.size - index * CHUNK_SIZE);
  if (Number(req.get('content-length')) !== expected) return fail(res, 400, 'Incorrect chunk length');
  const target = chunkPath(session.folder, field, index);
  const partial = `${target}.${crypto.randomUUID()}.partial`;
  let received = 0;
  try {
    await pipeline(req, new Transform({ transform(chunk, _encoding, callback) {
      received += chunk.length;
      callback(received <= expected ? null : new Error('Chunk too large'), chunk);
    } }), fs.createWriteStream(partial, { flags: 'wx' }));
    if (received !== expected) throw new Error('Incomplete chunk');
    fs.renameSync(partial, target);
    res.json({ success: true, received });
  } catch (error) {
    fs.rmSync(partial, { force: true });
    if (!res.headersSent) fail(res, 400, error.message);
  }
}));
app.post('/uploads/:id/commit', auth, admin, writeGate, run(async (req, res) => {
  const session = uploadSession(req);
  if (!session) return fail(res, 404, 'Upload session not found');
  const { folder, manifest } = session;
  const assembled = [];
  try {
    for (const [field, file] of Object.entries(manifest.files)) {
      for (let i = 0; i < chunkCount(file); i++)
        if (!fs.existsSync(chunkPath(folder, field, i))) return fail(res, 409, `Missing ${field} chunk ${i}`);
      const destination = path.join(STAGING_DIR, crypto.randomUUID());
      assembled.push(destination);
      let size = 0;
      for (let i = 0; i < chunkCount(file); i++) {
        const source = chunkPath(folder, field, i);
        size += fs.statSync(source).size;
        await pipeline(fs.createReadStream(source), fs.createWriteStream(destination, { flags: 'a' }));
      }
      if (size !== file.size) throw new Error(`Incorrect assembled size for ${field}`);
      req.files ||= {};
      req.files[field] = [{ path: destination, originalname: file.name, size }];
    }
    req.body = { assetName: manifest.assetName, category: manifest.category,
      tags: manifest.tags, isAnimated: manifest.isAnimated, isVideo: manifest.isVideo };
    res.once('finish', () => {
      if (res.statusCode === (manifest.replaceExternalId === null ? 201 : 200))
        fs.rmSync(folder, { recursive: true, force: true });
    });
    if (manifest.replaceExternalId === null) {
      await createUploadedAsset(req, res, error => { if (error) throw error; });
    } else {
      req.params.id = String(manifest.replaceExternalId);
      await replaceAssetFiles(req, res, error => { if (error) throw error; });
    }
  } catch (error) {
    for (const target of assembled) fs.rmSync(target, { force: true });
    throw error;
  }
}));
app.post('/assets', auth, admin, writeGate, (req, res) => {
  const { assetName, assetPath, thumbnailPath, category } = req.body || {};
  if (!assetName || !assetPath || !thumbnailPath || !category) return fail(res, 400, 'Missing required fields');
  const externalId = req.body.externalId === undefined ? nextExternalId() : Number(req.body.externalId);
  if (!validId(externalId)) return fail(res, 400, 'Invalid External ID');
  const tags = tagsOf(req.body.tags);
  try {
    const result = exec(`INSERT INTO assets(externalId,assetName,thumbnailPath,thumbnailPosterPath,assetPath,
      category,isVideo,isAnimated,tags,displayOrder,createdAt)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`, externalId, assetName, thumbnailPath,
      req.body.thumbnailPosterPath || null, assetPath, category,
      videoName(assetPath) || videoTags(tags) ? 1 : 0, bool(req.body.isAnimated),
      JSON.stringify(tags), (one('SELECT MAX(displayOrder) AS n FROM assets').n || 0) + 1, now());
    res.status(201).json({ success: true, asset: presentAsset(req, one('SELECT * FROM assets WHERE id=?', Number(result.lastInsertRowid))) });
  } catch (error) {
    if (String(error).includes('UNIQUE')) return fail(res, 409, 'External ID already exists');
    throw error;
  }
});
app.put('/assets/:id', auth, admin, writeGate, (req, res) => {
  const asset = assetByExternalId(Number(req.params.id));
  if (!asset) return fail(res, 404, 'Asset not found');
  const data = {};
  for (const key of ['assetName', 'assetPath', 'thumbnailPath', 'thumbnailPosterPath', 'category', 'tags'])
    if (req.body?.[key] !== undefined) data[key] = req.body[key];
  if (req.body?.externalId !== undefined) {
    if (!validId(req.body.externalId)) return fail(res, 400, 'Invalid External ID');
    data.externalId = Number(req.body.externalId);
  }
  if (req.body?.isVideo !== undefined) data.isVideo = bool(req.body.isVideo);
  else if (data.tags) data.isVideo = videoTags(tagsOf(data.tags)) ? 1 : 0;
  if (req.body?.isAnimated !== undefined) data.isAnimated = bool(req.body.isAnimated);
  if ((data.isAnimated ?? asset.isAnimated) === 0 && (data.isVideo ?? asset.isVideo) === 0) {
    if (!data.thumbnailPath && asset.thumbnailPosterPath) data.thumbnailPath = asset.thumbnailPosterPath;
    data.thumbnailPosterPath = null;
  }
  updateAsset(asset.id, data);
  res.json({ success: true, asset: presentAsset(req, one('SELECT * FROM assets WHERE id=?', asset.id)) });
});
const replaceAssetFiles = run(async (req, res) => {
  const asset = assetByExternalId(Number(req.params.id));
  if (!asset) { cleanupStaging(req); return fail(res, 404, 'Asset not found'); }
  const storageId = asset.storageId || crypto.randomUUID();
  fs.mkdirSync(path.join(ASSET_DIR, storageId), { recursive: true });
  try {
    const { changes, uploaded } = fileChange(req, asset, storageId);
    const data = { ...changes };
    for (const [field, column] of [['newAssetName', 'assetName'], ['category', 'category'],
      ['tags', 'tags'], ['newExternalId', 'externalId'], ['isAnimated', 'isAnimated']]) {
      if (req.body[field] !== undefined && req.body[field] !== '') data[column] = req.body[field];
    }
    if (req.body.newCategory !== undefined) data.category = req.body.newCategory;
    if (req.body.newTags !== undefined) data.tags = req.body.newTags;
    if (req.body.newIsAnimated !== undefined) data.isAnimated = req.body.newIsAnimated;
    if (data.externalId !== undefined) {
      if (!validId(data.externalId)) return fail(res, 400, 'Invalid External ID');
      data.externalId = Number(data.externalId);
    }
    if (data.isAnimated !== undefined) data.isAnimated = bool(data.isAnimated);
    if (staged(req, 'assetFile')) data.isVideo = videoName(staged(req, 'assetFile').originalname) ? 1 : 0;
    if ((data.isAnimated ?? asset.isAnimated) === 0 && (data.isVideo ?? asset.isVideo) === 0) {
      if (!data.thumbnailPath && asset.thumbnailPosterPath) data.thumbnailPath = asset.thumbnailPosterPath;
      data.thumbnailPosterPath = null;
    }
    updateAsset(asset.id, data);
    exec('UPDATE assets SET storageId=? WHERE id=?', storageId, asset.id);
    for (const item of uploaded) if (item.old && item.old !== item.value) removeStored(item.old);
    if (data.thumbnailPosterPath === null && changes.thumbnailPosterPath) removeStored(changes.thumbnailPosterPath);
    if (data.thumbnailPosterPath === null && asset.thumbnailPosterPath &&
        data.thumbnailPath !== asset.thumbnailPosterPath) removeStored(asset.thumbnailPosterPath);
    const updated = one('SELECT * FROM assets WHERE id=?', asset.id);
    res.json({ success: true, updated: presentAsset(req, updated), details: {} });
  } catch (error) {
    for (const file of fs.readdirSync(path.join(ASSET_DIR, storageId))) {
      if (file.includes('-') && ![asset.assetPath, asset.thumbnailPath, asset.thumbnailPosterPath]
        .some(old => old?.endsWith(`/${file}`))) fs.rmSync(path.join(ASSET_DIR, storageId, file), { force: true });
    }
    throw error;
  } finally { cleanupStaging(req); }
});
app.put('/assets/:id/files', auth, admin, writeGate, multipart, replaceAssetFiles);
app.delete('/assets/:id', auth, admin, writeGate, (req, res) => {
  const asset = assetByExternalId(Number(req.params.id));
  if (!asset) return fail(res, 404, 'Asset not found');
  exec('DELETE FROM assets WHERE id=?', asset.id);
  if (asset.storageId) fs.rmSync(path.join(ASSET_DIR, asset.storageId), { recursive: true, force: true });
  res.json({ success: true, message: 'Asset deleted', assetName: asset.assetName, folders: [] });
});

app.get('/favorites', auth, (req, res) => res.json({ success: true,
  assets: many(`SELECT a.* FROM favorites f JOIN assets a ON a.id=f.assetId
    WHERE f.username=? ORDER BY f.createdAt DESC`, req.user.username).map(a => presentAsset(req, a)) }));
app.post('/favorites', auth, writeGate, (req, res) => {
  const asset = one('SELECT id FROM assets WHERE id=?', Number(req.body?.assetId));
  if (!asset) return fail(res, 404, 'Asset not found');
  const existing = one('SELECT * FROM favorites WHERE username=? AND assetId=?', req.user.username, asset.id);
  if (existing) return res.json({ success: true, message: 'Already favorited' });
  const result = exec('INSERT INTO favorites(username,assetId,createdAt) VALUES(?,?,?)', req.user.username, asset.id, now());
  res.status(201).json({ success: true, favorite: one('SELECT * FROM favorites WHERE id=?', Number(result.lastInsertRowid)) });
});
app.delete('/favorites/:assetId', auth, writeGate, (req, res) => {
  const result = exec('DELETE FROM favorites WHERE username=? AND assetId=?', req.user.username, Number(req.params.assetId));
  if (!result.changes) return fail(res, 404, 'Favorite not found');
  res.json({ success: true, deleted: result.changes });
});
app.post('/admin/replace-tags', auth, admin, writeGate, (req, res) => {
  const { oldTag, newTag } = req.body || {};
  if (!oldTag || !newTag) return fail(res, 400, 'Missing oldTag or newTag');
  let updatedRows = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of many('SELECT id,tags FROM assets')) {
      const tags = tagsOf(row.tags).map(t => t.split(String(oldTag)).join(String(newTag)));
      if (JSON.stringify(tags) !== row.tags) {
        exec('UPDATE assets SET tags=? WHERE id=?', JSON.stringify(tags), row.id);
        updatedRows++;
      }
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  res.json({ success: true, updatedRows });
});

// Built-in database manager. It exposes useful catalogue tables and controlled
// edits, while keeping password hashes and session tokens out of the browser.
const MANAGED_TABLES = {
  assets: 'id,externalId,assetName,thumbnailPath,thumbnailPosterPath,assetPath,category,isVideo,isAnimated,tags,displayOrder,createdAt,storageId',
  users: 'id,username,isAdmin,RGB,LiquidGlass,ThemeColor,createdAt',
  favorites: 'id,username,assetId,createdAt'
};
app.get('/admin/database/overview', auth, admin, (_req, res) => {
  const counts = Object.fromEntries(Object.keys(MANAGED_TABLES)
    .map(table => [table, one(`SELECT COUNT(*) AS n FROM ${table}`).n]));
  res.json({ success: true, counts, databaseBytes: fs.statSync(DB_FILE).size,
    integrity: one('PRAGMA integrity_check').integrity_check });
});
app.get('/admin/database/tables/:table', auth, admin, (req, res) => {
  const { table } = req.params;
  if (!Object.hasOwn(MANAGED_TABLES, table)) return fail(res, 404, 'Unknown table');
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const where = table === 'assets' && req.query.search ? ' WHERE assetName LIKE ? OR CAST(externalId AS TEXT)=?' : '';
  const args = where ? [`%${String(req.query.search).slice(0, 120)}%`, String(req.query.search).slice(0, 120)] : [];
  const total = one(`SELECT COUNT(*) AS n FROM ${table}${where}`, ...args).n;
  const rows = many(`SELECT ${MANAGED_TABLES[table]} FROM ${table}${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    ...args, limit, offset);
  res.json({ success: true, table, rows: rows.map(row => table === 'assets' ? { ...row, tags: tagsOf(row.tags) } : row),
    total, limit, offset });
});
app.patch('/admin/database/assets/:id', auth, admin, writeGate, (req, res) => {
  const asset = one('SELECT * FROM assets WHERE id=?', Number(req.params.id));
  if (!asset) return fail(res, 404, 'Asset not found');
  const changes = {};
  for (const field of ['assetName', 'category', 'externalId', 'tags', 'isVideo', 'isAnimated', 'displayOrder']) {
    if (req.body?.[field] !== undefined) changes[field] = req.body[field];
  }
  if (!Object.keys(changes).length) return fail(res, 400, 'No editable fields supplied');
  if (changes.assetName !== undefined && !String(changes.assetName).trim()) return fail(res, 400, 'Asset name is required');
  if (changes.category !== undefined && !String(changes.category).trim()) return fail(res, 400, 'Category is required');
  if (changes.externalId !== undefined && !validId(changes.externalId)) return fail(res, 400, 'Invalid External ID');
  for (const field of ['isVideo', 'isAnimated']) if (changes[field] !== undefined) changes[field] = bool(changes[field]);
  if (changes.displayOrder !== undefined && (!Number.isSafeInteger(Number(changes.displayOrder)) || Number(changes.displayOrder) < 0))
    return fail(res, 400, 'Invalid display order');
  if (changes.externalId !== undefined) changes.externalId = Number(changes.externalId);
  if (changes.displayOrder !== undefined) changes.displayOrder = Number(changes.displayOrder);
  if (changes.tags !== undefined) changes.tags = JSON.stringify(tagsOf(changes.tags));
  try {
    exec(`UPDATE assets SET ${Object.keys(changes).map(key => `${key}=?`).join(',')} WHERE id=?`,
      ...Object.values(changes), asset.id);
  } catch (error) {
    if (String(error).includes('UNIQUE')) return fail(res, 409, 'External ID or name/category already exists');
    throw error;
  }
  res.json({ success: true, asset: presentAsset(req, one('SELECT * FROM assets WHERE id=?', asset.id)) });
});
app.delete('/admin/database/favorites/:id', auth, admin, writeGate, (req, res) => {
  const result = exec('DELETE FROM favorites WHERE id=?', Number(req.params.id));
  if (!result.changes) return fail(res, 404, 'Favorite not found');
  res.json({ success: true });
});

function storedFileStatus(req, value) {
  if (!value) return { state: 'none' };
  if (!value.startsWith('assets/')) return { state: 'external', url: value };
  const relative = value.slice(7);
  const absolute = path.resolve(ASSET_DIR, relative);
  if (!absolute.startsWith(ASSET_DIR + path.sep)) return { state: 'invalid', path: value };
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) return { state: 'missing', path: value };
    return { state: stat.size === 0 ? 'empty' : 'uploaded', path: value, url: fileUrl(req, value), bytes: stat.size,
      modifiedAt: stat.mtime.toISOString() };
  } catch (_) { return { state: 'missing', path: value }; }
}
function storageInventory(req) {
  const assets = many('SELECT id,externalId,assetName,category,assetPath,thumbnailPath,thumbnailPosterPath FROM assets ORDER BY externalId');
  const referenced = new Set();
  const rows = assets.map(asset => {
    const files = {
      asset: storedFileStatus(req, asset.assetPath),
      thumbnail: storedFileStatus(req, asset.thumbnailPath),
      poster: storedFileStatus(req, asset.thumbnailPosterPath)
    };
    for (const file of Object.values(files)) if (file.path) referenced.add(file.path);
    return { id: asset.id, externalId: asset.externalId, assetName: asset.assetName,
      category: asset.category, files, status: Object.values(files).some(f => ['missing','invalid','empty'].includes(f.state))
        ? 'missing' : Object.values(files).some(f => f.state === 'external') ? 'external' : 'uploaded' };
  });
  const orphans = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) {
        const relative = `assets/${path.relative(ASSET_DIR, absolute).replace(/\\/g, '/')}`;
        if (!referenced.has(relative)) orphans.push({ path: relative, bytes: fs.statSync(absolute).size,
          url: fileUrl(req, relative) });
      }
    }
  };
  walk(ASSET_DIR);
  return { rows, orphans };
}
app.get('/admin/storage/audit', auth, admin, (req, res) => {
  const { rows, orphans } = storageInventory(req);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const search = String(req.query.search || '').trim().toLowerCase();
  const filtered = search ? rows.filter(row => row.assetName.toLowerCase().includes(search) ||
    String(row.externalId) === search) : rows;
  const summary = {
    assets: rows.length, uploaded: rows.filter(r => r.status === 'uploaded').length,
    missing: rows.filter(r => r.status === 'missing').length,
    external: rows.filter(r => r.status === 'external').length,
    orphanFiles: orphans.length
  };
  res.json({ success: true, summary, assets: filtered.slice(offset, offset + limit), total: filtered.length,
    orphanTotal: orphans.length, offset, limit });
});
app.get('/admin/storage/orphans', auth, admin, (req, res) => {
  const { orphans } = storageInventory(req);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  res.json({ success: true, orphans: orphans.slice(offset, offset + limit), total: orphans.length, offset, limit });
});

function tar(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', part => { stderr += String(part).slice(0, 1000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`tar failed: ${stderr}`)));
  });
}
async function createBackup() {
  if (backingUp) throw new Error('Backup already running');
  backingUp = true;
  const stamp = now().replace(/[:.]/g, '-');
  const filename = `UE-AssetManager-${stamp}.tar.gz`;
  const snapshotDir = path.join(STAGING_DIR, `backup-${crypto.randomUUID()}`);
  fs.mkdirSync(snapshotDir);
  try {
    while (activeWrites > 0) await new Promise(resolve => setTimeout(resolve, 100));
    await backup(db, path.join(snapshotDir, 'catalog.sqlite'));
    const pending = path.join(BACKUP_DIR, `${filename}.partial`);
    await tar(['-czf', pending, '-C', snapshotDir, 'catalog.sqlite', '-C', DATA_DIR, 'assets']);
    fs.renameSync(pending, path.join(BACKUP_DIR, filename));
    return filename;
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true });
    backingUp = false;
  }
}
const backupTickets = new Map();
app.post('/admin/backup-db', auth, admin, run(async (_req, res) => {
  const filename = await createBackup();
  const ticket = crypto.randomBytes(32).toString('hex');
  for (const [key, value] of backupTickets) if (value.expires < Date.now()) backupTickets.delete(key);
  backupTickets.set(ticket, { filename, expires: Date.now() + 15 * 60 * 1000 });
  res.json({ success: true, filename,
    downloadUrl: `/admin/backups/${encodeURIComponent(filename)}?ticket=${ticket}` });
}));
app.get('/admin/backups/:filename', (req, res) => {
  const name = req.params.filename;
  if (!/^UE-AssetManager-[\w-]+\.tar\.gz$/.test(name)) return fail(res, 400, 'Invalid backup name');
  const ticket = backupTickets.get(String(req.query.ticket || ''));
  if (!ticket || ticket.filename !== name || ticket.expires < Date.now())
    return fail(res, 403, 'Download link expired; create a new backup');
  res.download(path.join(BACKUP_DIR, name));
});

app.use('/stored-files', express.static(ASSET_DIR, { fallthrough: false, maxAge: '1h' }));
app.use(express.static(FRONTEND_DIR));
app.get('/', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (!res.headersSent) fail(res, 500, 'Server error');
});

if (require.main === module) {
  const server = app.listen(PORT, '0.0.0.0', () => console.log(`Asset Manager on port ${PORT}; data at ${DATA_DIR}`));
  server.requestTimeout = 0; // large multipart uploads may take longer than Node's default
}
module.exports = { app, db, createBackup, DATA_DIR };
