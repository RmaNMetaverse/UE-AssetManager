'use strict';
const API = window.location.origin;
const TOKEN_KEY = 'mam_authToken';
const USER_KEY = 'mam_currentUser';
const $ = id => document.getElementById(id);
let token = localStorage.getItem(TOKEN_KEY);
let view = new URLSearchParams(location.search).get('view') === 'storage' ? 'storage' : 'database';
let table = 'assets';
let databaseOffset = 0, databaseTotal = 0, storageOffset = 0, storageTotal = 0, orphanOffset = 0, orphanTotal = 0;
const pageSize = 50;
let visibleAssetRows = [];

async function api(path, options={}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: {
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type':'application/json' } : {}),
    ...options.headers, Authorization:`Bearer ${token}`
  } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
  return json;
}
function status(message, error=false) { $('status').textContent = message || ''; $('status').classList.toggle('error', error); }
function cell(row, value) { const td=document.createElement('td'); td.textContent=value == null?'':String(value); row.append(td); return td; }
function link(url, label) { const a=document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener'; a.textContent=label; return a; }
function badge(value) { const span=document.createElement('span'); span.className=`badge ${value}`; span.textContent=value; return span; }
function renderStats(target, entries) {
  target.replaceChildren();
  for (const [label,value] of entries) { const box=document.createElement('div'); box.className='stat';
    const number=document.createElement('strong'); number.textContent=String(value);
    const caption=document.createElement('span'); caption.textContent=label; box.append(number,caption); target.append(box); }
}
function showView(next) {
  view=next;
  $('databaseView').classList.toggle('hidden',view!=='database');
  $('storageView').classList.toggle('hidden',view!=='storage');
  $('databaseTab').classList.toggle('active',view==='database');
  $('storageTab').classList.toggle('active',view==='storage');
  history.replaceState(null,'',`?view=${view}`);
  status('');
  if(view==='database') loadDatabase(); else loadStorage();
}
async function loadDatabase() {
  try {
    status('Reading database...');
    const overview = await api('/admin/database/overview');
    renderStats($('databaseSummary'), [
      ['Assets',overview.counts.assets],['Users',overview.counts.users],
      ['Favorites',overview.counts.favorites],['Database size',formatBytes(overview.databaseBytes)],
      ['Integrity',overview.integrity]
    ]);
    const search = table==='assets' ? $('tableSearch').value.trim() : '';
    const result = await api(`/admin/database/tables/${table}?offset=${databaseOffset}&limit=${pageSize}&search=${encodeURIComponent(search)}`);
    databaseTotal=result.total;
    visibleAssetRows=table==='assets'?result.rows:[];
    const columns = table==='assets'
      ? ['id','externalId','assetName','category','isVideo','isAnimated','tags','displayOrder','assetPath','thumbnailPath','createdAt']
      : table==='users' ? ['id','username','isAdmin','RGB','LiquidGlass','ThemeColor','createdAt']
      : ['id','username','assetId','createdAt'];
    const grid=$('databaseTable'); grid.replaceChildren();
    const header=document.createElement('tr'); columns.concat('Action').forEach(name=>{const th=document.createElement('th'); th.textContent=name; header.append(th);}); grid.append(header);
    for (const item of result.rows) {
      const tr=document.createElement('tr');
      for (const column of columns) cell(tr,Array.isArray(item[column])?item[column].join(', '):item[column]);
      const action=document.createElement('td');
      if(table==='assets') { const button=document.createElement('button');button.textContent='Edit';button.onclick=()=>openEdit(item);action.append(button); }
      if(table==='favorites') { const button=document.createElement('button');button.textContent='Remove';button.onclick=()=>removeFavorite(item.id);action.append(button); }
      tr.append(action);grid.append(tr);
    }
    $('databasePage').textContent=`${databaseTotal?databaseOffset+1:0}–${Math.min(databaseOffset+pageSize,databaseTotal)} of ${databaseTotal}`;
    $('databasePrev').disabled=databaseOffset===0;
    $('databaseNext').disabled=databaseOffset+pageSize>=databaseTotal;
    $('tableSearch').disabled=table!=='assets';$('searchTable').disabled=table!=='assets';
    status('');
  } catch(error) { status(error.message,true); }
}
function formatBytes(bytes) { if(bytes<1024) return `${bytes} B`; if(bytes<1024**2) return `${(bytes/1024).toFixed(1)} KiB`; if(bytes<1024**3) return `${(bytes/1024**2).toFixed(1)} MiB`; return `${(bytes/1024**3).toFixed(1)} GiB`; }
function renderFile(td, role, file) {
  const line=document.createElement('div');line.className='file-row';
  line.append(document.createTextNode(`${role}: `),badge(file.state));
  if(file.url) line.append(document.createTextNode(' '),link(file.url,file.path||'Open external file'));
  else if(file.path) { const detail=document.createElement('small');detail.textContent=` ${file.path}`;line.append(detail); }
  if(file.bytes!=null){const size=document.createElement('small');size.textContent=` · ${formatBytes(file.bytes)}`;line.append(size);}
  td.append(line);
}
async function loadStorage() {
  try {
    status('Scanning stored files...');
    const search=$('storageSearch').value.trim();
    const result=await api(`/admin/storage/audit?offset=${storageOffset}&limit=${pageSize}&search=${encodeURIComponent(search)}`);
    storageTotal=result.total;orphanTotal=result.orphanTotal;
    renderStats($('storageSummary'), [
      ['Assets',result.summary.assets],['Uploaded',result.summary.uploaded],
      ['Missing files',result.summary.missing],['External files',result.summary.external],
      ['Orphan files',result.summary.orphanFiles]
    ]);
    const grid=$('storageTable');grid.replaceChildren();
    const header=document.createElement('tr');['External ID','Asset','Category','Status','Files'].forEach(name=>{const th=document.createElement('th');th.textContent=name;header.append(th);});grid.append(header);
    for(const item of result.assets){
      const tr=document.createElement('tr');cell(tr,item.externalId);cell(tr,item.assetName);cell(tr,item.category);
      const state=document.createElement('td');state.append(badge(item.status));tr.append(state);
      const files=document.createElement('td');renderFile(files,'Asset',item.files.asset);renderFile(files,'Thumbnail',item.files.thumbnail);
      if(item.files.poster.state!=='none') renderFile(files,'Poster',item.files.poster);
      tr.append(files);grid.append(tr);
    }
    $('storagePage').textContent=`${storageTotal?storageOffset+1:0}–${Math.min(storageOffset+pageSize,storageTotal)} of ${storageTotal}`;
    $('storagePrev').disabled=storageOffset===0;$('storageNext').disabled=storageOffset+pageSize>=storageTotal;
    await loadOrphans();status('');
  }catch(error){status(error.message,true);}
}
async function loadOrphans() {
  const result=await api(`/admin/storage/orphans?offset=${orphanOffset}&limit=${pageSize}`);
  orphanTotal=result.total;
  const grid=$('orphanTable');grid.replaceChildren();
  const header=document.createElement('tr');['Path','Size'].forEach(name=>{const th=document.createElement('th');th.textContent=name;header.append(th);});grid.append(header);
  for(const file of result.orphans){const tr=document.createElement('tr');const td=document.createElement('td');td.append(link(file.url,file.path));tr.append(td);cell(tr,formatBytes(file.bytes));grid.append(tr);}
  $('orphanPage').textContent=`${orphanTotal?orphanOffset+1:0}–${Math.min(orphanOffset+pageSize,orphanTotal)} of ${orphanTotal}`;
  $('orphanPrev').disabled=orphanOffset===0;$('orphanNext').disabled=orphanOffset+pageSize>=orphanTotal;
}
function openEdit(item) {
  $('editInternalId').value=item.id;$('editName').value=item.assetName;$('editCategory').value=item.category;
  $('editExternalId').value=item.externalId;$('editTags').value=(item.tags||[]).join(', ');
  $('editOrder').value=item.displayOrder;$('editVideo').checked=!!item.isVideo;$('editAnimated').checked=!!item.isAnimated;
  $('editError').textContent='';$('editDialog').showModal();
}
async function removeFavorite(id) {
  if(!confirm(`Remove favorite row #${id}?`)) return;
  try{await api(`/admin/database/favorites/${id}`,{method:'DELETE'});await loadDatabase();}catch(error){status(error.message,true);}
}
async function initialize() {
  if(token){try{const result=await api('/auth/me');if(!result.user?.isAdmin) throw new Error('Admin access required');
    $('activeUser').textContent=result.user.username;$('tools').classList.remove('hidden');$('loginPanel').classList.add('hidden');showView(view);return;
  }catch(_){token=null;}}
  $('loginPanel').classList.remove('hidden');$('tools').classList.add('hidden');
}
$('loginForm').addEventListener('submit',async event=>{
  event.preventDefault();$('loginError').textContent='';
  try{const response=await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:$('loginUsername').value,password:$('loginPassword').value})});
    const result=await response.json();if(!response.ok||!result.isAdmin) throw new Error(result.error||'Admin access required');
    token=result.token;localStorage.setItem(TOKEN_KEY,token);localStorage.setItem(USER_KEY,JSON.stringify(result));initialize();
  }catch(error){$('loginError').textContent=error.message;}
});
$('databaseTab').onclick=()=>showView('database');$('storageTab').onclick=()=>showView('storage');
$('backupAll').onclick=async()=>{
  if(!confirm('Create and download a complete backup of the database and uploaded files?')) return;
  try{status('Creating backup...');const result=await api('/admin/backup-db',{method:'POST'});
    const a=document.createElement('a');a.href=`${API}${result.downloadUrl}`;a.download=result.filename;a.click();status(`Backup created: ${result.filename}`);
  }catch(error){status(error.message,true);}
};
$('refreshDatabase').onclick=loadDatabase;$('refreshStorage').onclick=loadStorage;
$('tableSelect').onchange=()=>{table=$('tableSelect').value;databaseOffset=0;loadDatabase();};
$('searchTable').onclick=()=>{databaseOffset=0;loadDatabase();};
$('tableSearch').onkeydown=event=>{if(event.key==='Enter'){databaseOffset=0;loadDatabase();}};
$('databasePrev').onclick=()=>{databaseOffset=Math.max(0,databaseOffset-pageSize);loadDatabase();};
$('databaseNext').onclick=()=>{databaseOffset+=pageSize;loadDatabase();};
$('searchStorage').onclick=()=>{storageOffset=0;loadStorage();};
$('storageSearch').onkeydown=event=>{if(event.key==='Enter'){storageOffset=0;loadStorage();}};
$('storagePrev').onclick=()=>{storageOffset=Math.max(0,storageOffset-pageSize);loadStorage();};
$('storageNext').onclick=()=>{storageOffset+=pageSize;loadStorage();};
$('orphanPrev').onclick=()=>{orphanOffset=Math.max(0,orphanOffset-pageSize);loadOrphans();};
$('orphanNext').onclick=()=>{orphanOffset+=pageSize;loadOrphans();};
$('cancelEdit').onclick=()=>$('editDialog').close();
$('editForm').addEventListener('submit',async event=>{
  event.preventDefault();$('editError').textContent='';
  const id=$('editInternalId').value;
  const body={assetName:$('editName').value.trim(),category:$('editCategory').value.trim(),
    externalId:Number($('editExternalId').value),tags:$('editTags').value.split(',').map(s=>s.trim()).filter(Boolean),
    displayOrder:Number($('editOrder').value),isVideo:$('editVideo').checked,isAnimated:$('editAnimated').checked};
  try{await api(`/admin/database/assets/${id}`,{method:'PATCH',body:JSON.stringify(body)});$('editDialog').close();await loadDatabase();}
  catch(error){$('editError').textContent=error.message;}
});
initialize();
