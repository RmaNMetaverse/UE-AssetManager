'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, execFile } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

test('auth, files, metadata, favorites, backup and restore', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ue-am-test-'));
  process.env.DATA_DIR = data;
  delete process.env.ADMIN_PASSWORD;
  const { app, db } = require('../server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let token;
  const call = async (route, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(base + route, { ...options, headers });
    const body = await response.json();
    return { response, body };
  };
  try {
    assert.equal((await call('/health')).response.status, 200);
    const homepage = await (await fetch(base + '/')).text();
    assert.match(homepage, /app\.js/);
    assert.doesNotMatch(homepage, /192\.168\.90\.221/);
    assert.equal((await fetch(base + '/app.js')).status, 200);
    assert.equal((await fetch(base + '/admin-tools.html')).status, 200);
    assert.equal((await fetch(base + '/media/favicon/favicon.svg')).status, 200);
    assert.equal((await call('/admin/database/overview')).response.status, 401);
    let result = await call('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }) });
    assert.equal(result.response.status, 200);
    token = result.body.token;
    result = await call('/admin/database/overview');
    assert.equal(result.body.counts.users, 1);
    result = await call('/admin/database/tables/users');
    assert.equal(result.body.rows[0].username, 'admin');
    assert.ok(!Object.hasOwn(result.body.rows[0], 'password'));
    const form = new FormData();
    form.set('assetName', 'Demo');
    form.set('category', 'Character');
    form.set('tags', 'stone,rock');
    form.set('thumbnail', new Blob(['PNG data'], { type: 'image/png' }), 'thumb.png');
    form.set('assetFile', new Blob(['asset bytes'], { type: 'application/octet-stream' }), 'demo.spak');
    assert.equal((await fetch(base + '/upload', { method: 'POST', body: form })).status, 401);
    result = await call('/upload', { method: 'POST', body: form });
    assert.equal(result.response.status, 201, JSON.stringify(result.body));
    const asset = result.body.created;
    assert.match(asset.assetPath, /\/stored-files\//);
    assert.equal(asset.externalId, 1);
    assert.deepEqual(asset.tags, ['stone', 'rock']);
    assert.equal(await (await fetch(asset.assetPath)).text(), 'asset bytes');
    result = await call('/admin/storage/audit');
    assert.equal(result.body.summary.uploaded, 1);
    assert.equal(result.body.assets[0].files.asset.state, 'uploaded');
    const storedPath = db.prepare('SELECT assetPath FROM assets WHERE externalId=1').get().assetPath;
    const absoluteAsset = path.join(data, storedPath);
    const missingPath = `${absoluteAsset}.missing`;
    fs.renameSync(absoluteAsset, missingPath);
    result = await call('/admin/storage/audit');
    assert.equal(result.body.summary.missing, 1);
    fs.renameSync(missingPath, absoluteAsset);
    fs.truncateSync(absoluteAsset, 0);
    result = await call('/admin/storage/audit');
    assert.equal(result.body.assets[0].files.asset.state, 'empty');
    fs.writeFileSync(absoluteAsset, 'asset bytes');
    const orphanDir = path.join(data, 'assets', 'orphan-folder');
    fs.mkdirSync(orphanDir);
    fs.writeFileSync(path.join(orphanDir, 'stray.bin'), 'stray');
    result = await call('/admin/storage/orphans');
    assert.equal(result.body.total, 1);
    assert.match(result.body.orphans[0].path, /stray\.bin$/);
    fs.rmSync(orphanDir, { recursive: true, force: true });
    result = await call('/admin/database/tables/assets');
    assert.equal(result.body.total, 1);
    assert.deepEqual(result.body.rows[0].tags, ['stone', 'rock']);
    result = await call(`/admin/database/assets/${asset.id}`, { method:'PATCH',
      headers:{'content-type':'application/json'}, body:JSON.stringify({ displayOrder: 7 }) });
    assert.equal(result.response.status, 200);
    assert.equal(db.prepare('SELECT displayOrder FROM assets WHERE id=?').get(asset.id).displayOrder, 7);
    const mediaRange = await fetch(asset.assetPath, { headers: { Range: 'bytes=0-4' } });
    assert.equal(mediaRange.status, 206);
    assert.equal(await mediaRange.text(), 'asset');
    result = await call('/assets?tags=rock&search=Demo');
    assert.equal(result.body.total, 1);
    result = await call('/favorites', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assetId: asset.id }) });
    assert.equal(result.response.status, 201);
    assert.equal((await call('/favorites')).body.assets.length, 1);
    const replace = new FormData();
    replace.set('assetFile', new Blob(['new asset bytes']), 'demo.spak');
    replace.set('newTags', 'metal');
    result = await call('/assets/1/files', { method: 'PUT', body: replace });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(await (await fetch(result.body.updated.assetPath)).text(), 'new asset bytes');
    assert.equal((await call('/assets?tags=metal')).body.total, 1);
    result = await call('/admin/backup-db', { method: 'POST' });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    const archive = path.join(data, 'backups', result.body.filename);
    assert.ok(fs.statSync(archive).size > 0);
    assert.equal((await fetch(base + result.body.downloadUrl)).status, 200);
    assert.equal((await fetch(base + `/admin/backups/${result.body.filename}`)).status, 403);
    const restored = fs.mkdtempSync(path.join(os.tmpdir(), 'ue-am-restore-'));
    execFileSync('tar', ['-xzf', archive, '-C', restored]);
    const restoredDb = new DatabaseSync(path.join(restored, 'catalog.sqlite'));
    const row = restoredDb.prepare('SELECT * FROM assets WHERE externalId=1').get();
    assert.deepEqual(JSON.parse(row.tags), ['metal']);
    assert.equal(fs.readFileSync(path.join(restored, row.assetPath), 'utf8'), 'new asset bytes');
    restoredDb.close();
    fs.rmSync(restored, { recursive: true, force: true });
    const restoreTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'ue-am-restore-cli-'));
    execFileSync(process.execPath, [path.join(__dirname, '..', 'restore.js'), archive],
      { env: { ...process.env, DATA_DIR: restoreTarget } });
    const cliDb = new DatabaseSync(path.join(restoreTarget, 'catalog.sqlite'));
    assert.equal(cliDb.prepare('SELECT COUNT(*) AS n FROM assets').get().n, 1);
    cliDb.close();
    fs.rmSync(restoreTarget, { recursive: true, force: true });
    const legacyTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'ue-am-import-'));
    const legacyJson = path.join(data, 'legacy-export.json');
    const legacyAsset = (await call('/assets/1')).body.asset;
    fs.writeFileSync(legacyJson, JSON.stringify({ format: 1, assets: [legacyAsset], users: [], favorites: [] }));
    await new Promise((resolve, reject) => execFile(process.execPath,
      [path.join(__dirname, '..', 'import-legacy.js'), legacyJson],
      { env: { ...process.env, DATA_DIR: legacyTarget } }, error => error ? reject(error) : resolve()));
    const importedDb = new DatabaseSync(path.join(legacyTarget, 'catalog.sqlite'));
    const imported = importedDb.prepare('SELECT * FROM assets WHERE externalId=1').get();
    assert.ok(imported.assetPath.startsWith('assets/'));
    assert.equal(fs.readFileSync(path.join(legacyTarget, imported.assetPath), 'utf8'), 'new asset bytes');
    importedDb.close();
    fs.rmSync(legacyTarget, { recursive: true, force: true });
    result = await call('/assets/1', { method: 'DELETE' });
    assert.equal(result.response.status, 200);
    assert.equal((await call('/assets')).body.total, 0);
    const big = Buffer.alloc(16 * 1024 * 1024 + 3, 65);
    result = await call('/uploads/start', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assetName: 'Chunked', category: 'VFX', tags: ['large'], files: {
        assetFile: { name: 'large.spak', size: big.length }, thumbnail: { name: 'cover.png', size: 3 }
      } }) });
    assert.equal(result.response.status, 201, JSON.stringify(result.body));
    const id = result.body.id;
    const size = result.body.chunkSize;
    for (const [field, index, body] of [
      ['assetFile', 0, big.subarray(0, size)], ['assetFile', 1, big.subarray(size)],
      ['thumbnail', 0, Buffer.from('png')]
    ]) {
      result = await call(`/uploads/${id}/${field}/${index}`, { method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' }, body });
      assert.equal(result.response.status, 200, JSON.stringify(result.body));
    }
    result = await call(`/uploads/${id}/status`);
    assert.deepEqual(result.body.uploaded.assetFile, [0, 1]);
    result = await call(`/uploads/${id}/commit`, { method: 'POST' });
    assert.equal(result.response.status, 201, JSON.stringify(result.body));
    assert.equal((await fetch(result.body.created.assetPath)).headers.get('content-length'), String(big.length));
    result = await call('/uploads/start', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replaceExternalId: result.body.created.externalId, category: 'VFX',
        tags: 'replacement', files: { assetFile: { name: 'updated.spak', size: 4 } } }) });
    assert.equal(result.response.status, 201, JSON.stringify(result.body));
    const replacementId = result.body.id;
    result = await call(`/uploads/${replacementId}/assetFile/0`, { method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' }, body: Buffer.from('edit') });
    assert.equal(result.response.status, 200);
    result = await call(`/uploads/${replacementId}/commit`, { method: 'POST' });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(await (await fetch(result.body.updated.assetPath)).text(), 'edit');
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(data, { recursive: true, force: true });
  }
});
