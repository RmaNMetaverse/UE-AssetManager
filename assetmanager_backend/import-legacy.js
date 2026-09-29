'use strict';
// One-time importer for legacy-export.js output. Downloads old public share
// links into the new host-native asset directory and rewrites catalogue paths.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { db, DATA_DIR } = require('./server');

const input = process.argv[2];
if (!input) throw new Error('Usage: node import-legacy.js <legacy-export.json>');
const exportData = JSON.parse(fs.readFileSync(input, 'utf8'));
if (exportData.format !== 1 || !Array.isArray(exportData.assets) ||
    !Array.isArray(exportData.users) || !Array.isArray(exportData.favorites))
  throw new Error('Invalid legacy export');
const assetRoot = path.join(DATA_DIR, 'assets');
const safeName = value => path.basename(String(value || 'file').replace(/\\/g, '/'))
  .replace(/[^\p{L}\p{N}_.() -]/gu, '_').slice(0, 180) || 'file';
function remoteName(response, fallback) {
  const header = response.headers.get('content-disposition') || '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  const plain = /filename="?([^";]+)"?/i.exec(header)?.[1];
  let name = fallback;
  try { if (encoded) name = decodeURIComponent(encoded); else if (plain) name = plain; } catch (_) { /* fallback */ }
  return safeName(name);
}
async function download(url, folder, label, fallback) {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) throw new Error(`Unsupported legacy file URL: ${url}`);
  const headers = {};
  if (process.env.LEGACY_HTTP_USER && process.env.LEGACY_HTTP_PASSWORD)
    headers.Authorization = `Basic ${Buffer.from(`${process.env.LEGACY_HTTP_USER}:${process.env.LEGACY_HTTP_PASSWORD}`).toString('base64')}`;
  const response = await fetch(url, { headers, redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status} ${url}`);
  const name = `${label}-${remoteName(response, fallback)}`;
  const target = path.join(folder, name);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(target, { flags: 'wx' }));
  const expected = Number(response.headers.get('content-length'));
  if (Number.isSafeInteger(expected) && expected > 0 && fs.statSync(target).size !== expected)
    throw new Error(`Incomplete download: ${url}`);
  return `assets/${path.basename(folder)}/${name}`;
}
async function main() {
  let imported = 0;
  for (const user of exportData.users) {
    if (!user.username || !user.password) continue;
    const existing = db.prepare('SELECT id FROM users WHERE username=?').get(user.username);
    if (existing) continue; // keep the new installation's initial admin password
    db.prepare(`INSERT INTO users(username,password,isAdmin,RGB,LiquidGlass,ThemeColor,createdAt)
      VALUES(?,?,?,?,?,?,?)`).run(user.username, user.password, user.isAdmin ? 1 : 0,
      Number(user.RGB) || 0, Number(user.LiquidGlass) || 0, user.ThemeColor || '#ffa31a',
      user.createdAt || new Date().toISOString());
  }
  const idMap = new Map();
  for (const asset of exportData.assets) {
    const existing = db.prepare('SELECT id FROM assets WHERE externalId=?').get(asset.externalId);
    if (existing) { idMap.set(asset.id, existing.id); continue; }
    const storageId = crypto.randomUUID();
    const folder = path.join(assetRoot, storageId);
    fs.mkdirSync(folder, { recursive: true });
    try {
      const thumbnailPath = await download(asset.thumbnailPath, folder, 'thumb', `${asset.assetName}.png`);
      const thumbnailPosterPath = await download(asset.thumbnailPosterPath, folder, 'poster', `${asset.assetName}_poster.png`);
      const assetPath = await download(asset.assetPath, folder, 'asset', `${asset.assetName}${asset.isVideo ? '.mp4' : '.spak'}`);
      if (!thumbnailPath || !assetPath) throw new Error(`Missing files for asset ${asset.externalId}`);
      const result = db.prepare(`INSERT INTO assets(externalId,assetName,thumbnailPath,thumbnailPosterPath,
        assetPath,category,isVideo,isAnimated,tags,displayOrder,createdAt,storageId)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(asset.externalId, asset.assetName, thumbnailPath,
        thumbnailPosterPath, assetPath, asset.category, Number(asset.isVideo) || 0,
        Number(asset.isAnimated) || 0, JSON.stringify(asset.tags || []),
        Number(asset.displayOrder) || 0, asset.createdAt || new Date().toISOString(), storageId);
      idMap.set(asset.id, Number(result.lastInsertRowid));
      imported++;
      console.log(`Imported #${asset.externalId}: ${asset.assetName}`);
    } catch (error) {
      fs.rmSync(folder, { recursive: true, force: true });
      throw error;
    }
  }
  for (const favorite of exportData.favorites) {
    const assetId = idMap.get(favorite.assetId);
    if (!assetId || !favorite.username) continue;
    db.prepare(`INSERT OR IGNORE INTO favorites(username,assetId,createdAt) VALUES(?,?,?)`)
      .run(favorite.username, assetId, favorite.createdAt || new Date().toISOString());
  }
  console.log(`Import complete: ${imported} new assets. Back up the new installation now.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => db.close());
