// Central category data (single source of truth for sidebar + admin select)
const categoryData = {
  "Static Meshes": ["Accessory", "Archviz", "Terrain", "Photogrammetry", "MegascanMeshes"],
  "Blueprints": ["AssetBlueprint", "FunctionalBlueprint"],
  "Foliage": ["Trees", "BushesVegetation", "MegascanFoliage"],
  "Materials": ["MegascanMaterials","MasterMaterial","Decals"],
  "FlipBooks": ["Character", "VFX"],
    // VAT (vertex animation textures) family
    "Animated": ["VAT-Characters","VAT-Animals","VAT-Clothes", "VAT-Trees"],
  "Textures": ["HDRI","Masks","Noises", "SurfaceImperfections","Patterns"]
};

document.addEventListener('DOMContentLoaded', () => {
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', () => {
            console.log('MosesAssetManagerServer|ClearCache');
        });
    }
});
        // Asset size slider: wire up and restore saved value
        try{
            const assetSizeSlider = document.getElementById('assetSizeSlider');
            if (assetSizeSlider){
                // restore saved value from localStorage if present
                try{ const saved = parseInt(localStorage.getItem('moses:card_min'),10); if (!isNaN(saved)) assetSizeSlider.value = String(saved); }catch(e){}
                // apply initial CSS variable
                try{ document.documentElement.style.setProperty('--card-min', assetSizeSlider.value + 'px'); }catch(e){}
                // Use 'change' so the slider snaps to discrete steps and only applies on release for a snappier UX
                assetSizeSlider.addEventListener('change', (ev)=>{
                    const v = ev.target.value;
                    document.documentElement.style.setProperty('--card-min', v + 'px');
                    try{ localStorage.setItem('moses:card_min', String(v)); }catch(e){}
                });
            }
        }catch(e){ console.warn('Asset size slider init failed', e); }
        // Liquid Glass UI setting: persists in localStorage and toggles a class on the root element
        try{
            const savedLG = localStorage.getItem('moses:liquid_glass');
            const lgEnabled = savedLG === '1' || savedLG === 'true';
            if (lgEnabled) try{ document.documentElement.classList.add('liquid-glass'); }catch(e){}
            document.addEventListener('DOMContentLoaded', ()=>{
                const lgToggle = document.getElementById('liquidGlassToggle');
                if (!lgToggle) return;
                try{ lgToggle.checked = lgEnabled; }catch(e){}
                lgToggle.addEventListener('change', (ev)=>{
                    const on = !!ev.target.checked;
                    try{
                        if (on) document.documentElement.classList.add('liquid-glass');
                        else document.documentElement.classList.remove('liquid-glass');
                    }catch(e){}
                    try{ localStorage.setItem('moses:liquid_glass', on ? '1' : '0'); }catch(e){}
                    // Persist per-user setting to backend when authenticated
                    try{ saveUserSettings({ LiquidGlass: on ? 1 : 0 }); }catch(e){}
                });
                    // Transparency slider: control the CSS variables used by Liquid Glass styles
                    const lgSlider = document.getElementById('liquidGlassTransparency');
                    const lgValEl = document.getElementById('liquidGlassTransparencyValue');
                    try{
                        // load saved display value (0..100) which maps to actual opacity 8..20%
                            const savedDisplay = parseInt(localStorage.getItem('moses:liquid_glass_opacity'), 10);
                            const displayStart = (!isNaN(savedDisplay)) ? savedDisplay : 0; // displayed 0..100
                            if (lgSlider){ lgSlider.value = String(displayStart); }
                            if (lgValEl) lgValEl.textContent = String(displayStart);
                            // helper: map displayed 0..100 -> actual opacity 0.08..0.20
                            const displayToActual = (disp) => {
                                const d = Math.max(0, Math.min(100, Number(disp) || 0));
                                const min = 8, max = 20; // percentages
                                const actualPerc = min + (max - min) * (d / 100);
                                return Math.max(0, Math.min(1, actualPerc / 100));
                            };
                            // helper to update slider fill color based on display value
                            const setSliderFill = (slider, disp) => {
                                if (!slider) return;
                                try{
                                    const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '25,201,189';
                                    const pct = Math.max(0, Math.min(100, Number(disp) || 0));
                                    const filled = pct;
                                    slider.style.background = `linear-gradient(90deg, rgba(${accentRgb}, ${Math.max(0.06, (filled/100) * 0.9)}) ${filled}%, rgba(255,255,255,0.06) ${filled}% )`;
                                }catch(e){}
                            };
                            // apply initial computed CSS variables
                            const opActualStart = displayToActual(displayStart);
                            const tint = Math.min(0.6, opActualStart * 1.6);
                            const btnAlpha = Math.min(0.9, opActualStart * 1.8 + 0.06);
                            try{ document.documentElement.style.setProperty('--liquid-opacity', String(opActualStart)); }catch(e){}
                            try{ document.documentElement.style.setProperty('--liquid-tint-alpha', String(tint)); }catch(e){}
                            try{ document.documentElement.style.setProperty('--liquid-btn-alpha', String(btnAlpha)); }catch(e){}
                            setSliderFill(lgSlider, displayStart);
                            if (lgSlider){
                                lgSlider.addEventListener('input', (ev)=>{
                                    const v = parseInt(ev.target.value, 10) || 0; // display 0..100
                                    if (lgValEl) lgValEl.textContent = String(v);
                                    const opActual = displayToActual(v);
                                    const tt = Math.min(0.6, opActual * 1.6);
                                    const ba = Math.min(0.9, opActual * 1.8 + 0.06);
                                    try{ document.documentElement.style.setProperty('--liquid-opacity', String(opActual)); }catch(e){}
                                    try{ document.documentElement.style.setProperty('--liquid-tint-alpha', String(tt)); }catch(e){}
                                    try{ document.documentElement.style.setProperty('--liquid-btn-alpha', String(ba)); }catch(e){}
                                    setSliderFill(lgSlider, v);
                                    try{ localStorage.setItem('moses:liquid_glass_opacity', String(v)); }catch(e){}
                                });
                            }
                    }catch(e){ /* ignore */ }
            });
        }catch(e){ /* ignore */ }
// Category filter state
let activeCategory = null;
let categoryFetchTimer = null;

function applyCategoryFilter(category) {
    activeCategory = category;
    // leaving favorites view when applying a category
    showOnlyFavorites = false;
  hasMore = true;
  // Clear search and tags when switching category
  if (searchInput) searchInput.value = '';
  activeTags.clear();
  renderActiveTags();
  if (categoryFetchTimer) clearTimeout(categoryFetchTimer);
  categoryFetchTimer = setTimeout(() => {
    fetchAssets({ offset: 0, limit: 80, append: false, sort: getIdSort(), category });
    categoryFetchTimer = null;
  }, 80); // debounce rapid clicks
}

// Wire up category buttons and 'All' summary

function updateCategoryHighlight() {
    const categoryBtns = document.querySelectorAll('.category-btn');
    const allSummary = document.querySelector('.side-accordion[open] > summary');
    const favSummary = document.getElementById('favoritesSummary');
    if (activeCategory) {
        categoryBtns.forEach(b => {
            if (b.dataset.category === activeCategory) {
                b.classList.add('category-active');
            } else {
                b.classList.remove('category-active');
            }
        });
        if (allSummary) allSummary.classList.remove('category-active');
        if (favSummary) favSummary.classList.remove('category-active');
    } else {
        categoryBtns.forEach(b => b.classList.remove('category-active'));
        if (showOnlyFavorites){
            if (favSummary) favSummary.classList.add('category-active');
            if (allSummary) allSummary.classList.remove('category-active');
        } else {
            if (allSummary) allSummary.classList.add('category-active');
            if (favSummary) favSummary.classList.remove('category-active');
        }
    }
}

function readableCategoryName(id){
    const special = {
        MegascanMeshes: 'Megascan Meshes',
        MegascanMeshesTest: 'Megascan Meshes Test',
        AssetBlueprint: 'Asset Blueprint',
        FunctionalBlueprint: 'Functional Blueprint',
        BushesVegetation: 'Bushes & Vegetation',
        CharacterFlipbooks: 'Character & Animals Flipbooks',
        VFXFlipbooks: 'VFX Flipbooks',
        MegascanFoliage: 'Megascan Foliage',
        MegascanMaterials: 'Megascan Materials'
    };
    if (special[id]) return special[id];
    return id.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function buildSideCategoryAccordions(){
    const container = document.getElementById('categoryAccordions');
    if (!container) return;
    // Remove previously generated (keep the first 'All')
    const detailsList = container.querySelectorAll('details');
    detailsList.forEach((d,i)=>{ if (i>0) d.remove(); });
    Object.entries(categoryData).forEach(([group, cats])=>{
        const details = document.createElement('details');
        details.className = 'side-accordion';
        const summary = document.createElement('summary');
        summary.textContent = group;
        details.appendChild(summary);
        if (cats && cats.length){
            const ul = document.createElement('ul');
            cats.forEach(cat=>{
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.className = 'category-btn category-text';
                btn.dataset.category = cat;
                btn.textContent = readableCategoryName(cat);
                li.appendChild(btn);
                ul.appendChild(li);
            });
            details.appendChild(ul);
        }
        container.appendChild(details);
    });
    wireCategoryButtons();
        // Add visual separator, then Favorites section below categories
        const sep = document.createElement('div');
        sep.className = 'side-divider';
        container.appendChild(sep);
        const favDetails = document.createElement('details');
        favDetails.className = 'side-accordion';
        const favSummary = document.createElement('summary');
    favSummary.textContent = 'Favorites';
    favSummary.id = 'favoritesSummary';
        favSummary.style.cursor = 'pointer';
        favDetails.appendChild(favSummary);
        container.appendChild(favDetails);
        favSummary.addEventListener('click', (e)=>{ e.preventDefault(); applyFavoritesFilter(); updateCategoryHighlight(); });
}

function wireCategoryButtons(){
    const categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            applyCategoryFilter(btn.dataset.category);
            updateCategoryHighlight();
        });
    });
    const allSummary = document.querySelector('#categoryAccordions details[open] > summary');
    if (allSummary){
        allSummary.style.cursor = 'pointer';
        allSummary.addEventListener('click', e=>{
            e.preventDefault();
            applyCategoryFilter(null);
            updateCategoryHighlight();
        });
        allSummary.classList.remove('category-active');
    }
}

document.addEventListener('DOMContentLoaded', ()=>{
    buildSideCategoryAccordions();
});
// Ensure admin button visibility reflects any stored user once DOM is ready
document.addEventListener('DOMContentLoaded', ()=>{
    updateAdminVisibility();
});

// Avatar/menu wiring: show user's initial in a small circle and toggle a dropdown
function updateAvatarUI(){
    const avatarBtn = document.getElementById('userAvatarBtn');
    const avatarMenu = document.getElementById('userAvatarMenu');
    if (!avatarBtn) return;
    if (currentUser && currentUser.username){
        const initial = String(currentUser.username).trim().charAt(0).toUpperCase();
        avatarBtn.textContent = initial;
        avatarBtn.classList.remove('has-image');
        avatarBtn.style.backgroundImage = '';
        if (currentUser.avatarUpdatedAt && authToken) {
            const image = new Image();
            image.onload = ()=>{ avatarBtn.style.backgroundImage = `url("${API_BASE}/user/avatar?v=${encodeURIComponent(currentUser.avatarUpdatedAt)}")`; avatarBtn.classList.add('has-image'); };
            image.src = `${API_BASE}/user/avatar?v=${encodeURIComponent(currentUser.avatarUpdatedAt)}`;
        }
        avatarBtn.style.display = '';
    } else {
        // hide avatar if no user
        avatarBtn.style.display = 'none';
        if (avatarMenu) avatarMenu.classList.add('hidden');
    }
}

// Profile picture crop and upload. The crop is rendered locally before upload.
document.addEventListener('DOMContentLoaded', ()=>{
    const fileInput = document.getElementById('avatarFileInput');
    const canvas = document.getElementById('avatarCropCanvas');
    const saveBtn = document.getElementById('saveAvatarBtn');
    const message = document.getElementById('avatarMessage');
    const zoomInput = document.getElementById('avatarZoom');
    const xInput = document.getElementById('avatarOffsetX');
    const yInput = document.getElementById('avatarOffsetY');
    if (!fileInput || !canvas || !saveBtn) return;
    const ctx = canvas.getContext('2d');
    let image = null;
    const draw = ()=>{
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!image) { ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }
        const scale = Math.max(canvas.width / image.width, canvas.height / image.height) * Number(zoomInput.value || 1);
        const width = image.width * scale, height = image.height * scale;
        const x = (canvas.width - width) * Number(xInput.value || 50) / 100;
        const y = (canvas.height - height) * Number(yInput.value || 50) / 100;
        ctx.drawImage(image, x, y, width, height);
    };
    [zoomInput, xInput, yInput].forEach(input => input.addEventListener('input', draw));
    fileInput.addEventListener('change', ()=>{
        const file = fileInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ()=>{
            image = new Image();
            image.onload = ()=>{ zoomInput.value = '1'; xInput.value = '50'; yInput.value = '50'; saveBtn.disabled = false; draw(); };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
    saveBtn.addEventListener('click', ()=>{
        if (!image || !authToken) return;
        saveBtn.disabled = true;
        message.textContent = 'Saving…';
        canvas.toBlob(async blob=>{
            try {
                const form = new FormData();
                form.append('avatar', blob, 'profile.jpg');
                const response = await authFetch(`${API_BASE}/user/avatar`, { method:'PUT', body:form });
                const result = await response.json().catch(()=>null);
                if (!response.ok || !result?.success) throw new Error(result?.error || 'Could not save profile picture');
                setCurrentUser(result.user);
                updateAvatarUI();
                message.textContent = 'Profile picture saved.';
            } catch (error) { message.textContent = error.message || 'Upload failed'; }
            finally { saveBtn.disabled = false; }
        }, 'image/jpeg', 0.9);
    });
    draw();
});

document.addEventListener('DOMContentLoaded', ()=>{
    updateAvatarUI();
    const avatarBtn = document.getElementById('userAvatarBtn');
    const avatarMenu = document.getElementById('userAvatarMenu');
    if (!avatarBtn) return;
    avatarBtn.addEventListener('click', (e)=>{
        e.stopPropagation();
        if (!avatarMenu) return;
        const isHidden = avatarMenu.classList.contains('hidden');
        if (isHidden) avatarMenu.classList.remove('hidden'); else avatarMenu.classList.add('hidden');
    });
    // Close menu when clicking elsewhere
    document.addEventListener('click', ()=>{
        if (avatarMenu) avatarMenu.classList.add('hidden');
    });
    // Prevent clicks inside menu from closing it
    if (avatarMenu) avatarMenu.addEventListener('click', (e)=>{ e.stopPropagation(); });
});

// Wire sort toggle button separately so it initializes regardless of other DOM wiring
document.addEventListener('DOMContentLoaded', ()=>{
    try{
        const sortBtn = document.getElementById('sortToggle');
        if (!sortBtn) return;
        // initialize icon
        updateSortToggleUI();
        sortBtn.addEventListener('click', ()=>{
            if (isUnfilteredAssetView()) {
                defaultSortMode = defaultSortMode === 'custom' ? 'id_asc' : defaultSortMode === 'id_asc' ? 'id_desc' : 'custom';
            } else {
                idSortAsc = !idSortAsc;
            }
            updateSortToggleUI();
            if (!showOnlyFavorites){
                hasMore = true;
                fetchAssets({ search: searchInput ? searchInput.value.trim() : '', tags: Array.from(activeTags), offset: 0, limit: 80, append: false, sort: getIdSort(), category: activeCategory });
            }
        });
    }catch(e){ console.warn('Sort toggle init failed', e); }
});

// NOTE: The previous side toggle element (#sideToggleBtn) and its wiring
// have been removed in favor of a single toggle (`#mobileSideToggle`) that
// controls the sidebar across all screen sizes (collapse on desktop, overlay on mobile).

// Mobile-responsive side panel: create a hamburger toggle that opens the side panel as an overlay
document.addEventListener('DOMContentLoaded', ()=>{
    const MOBILE_BREAKPOINT = 900; // px
    function initMobileSidePanel(){
        const side = document.getElementById('sidePanel');
        const topWrap = document.getElementById('topbar-buttons-wrap');
        if (!side || !topWrap) return;
        // avoid double-init
        if (document.getElementById('mobileSideToggle')) return;

        const btn = document.createElement('button');
        btn.id = 'mobileSideToggle';
        btn.className = 'mobile-side-toggle';
        btn.type = 'button';
        btn.title = 'Show menu';
        btn.setAttribute('aria-expanded','false');
        btn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">menu</span>';
        // insert at start of topbar buttons so it's visible on small screens
        topWrap.insertBefore(btn, topWrap.firstChild);

        // backdrop overlay
        const overlay = document.createElement('div');
        overlay.id = 'mobileSideOverlay';
        overlay.className = 'hidden';
        document.body.appendChild(overlay);

        const STORAGE_KEY = 'mam_sidepanel_collapsed';

        function setCollapsed(collapsed, persist=true){
            if (collapsed){
                side.classList.add('collapsed');
                btn.setAttribute('aria-expanded','false');
                btn.querySelector('.material-symbols-outlined').textContent = 'chevron_right';
                btn.title = 'Expand side panel';
            } else {
                side.classList.remove('collapsed');
                btn.setAttribute('aria-expanded','true');
                btn.querySelector('.material-symbols-outlined').textContent = 'chevron_left';
                btn.title = 'Collapse side panel';
            }
            if (persist) try{ localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); }catch(e){}
        }

        // Mobile overlay open/close
        function openOverlay(){
            side.classList.remove('mobile-hidden-by-default');
            side.classList.add('mobile-open');
            overlay.classList.remove('hidden');
            // show close icon
            btn.querySelector('.material-symbols-outlined').textContent = 'close';
            btn.setAttribute('aria-expanded','true');
            try{ document.body.style.overflow = 'hidden'; }catch(e){}
        }
        function closeOverlay(){
            side.classList.remove('mobile-open');
            side.classList.add('mobile-hidden-by-default');
            overlay.classList.add('hidden');
            // restore collapsed/expanded icon based on stored state
            const stored = localStorage.getItem(STORAGE_KEY);
            const collapsed = stored === '1';
            setCollapsed(collapsed, false);
            try{ document.body.style.overflow = ''; }catch(e){}
        }

        // Initialize the button icon + collapsed state from storage
        try{
            const stored = localStorage.getItem(STORAGE_KEY);
            const collapsed = stored === '1';
            setCollapsed(collapsed, false);
        }catch(e){ setCollapsed(false, false); }

        btn.addEventListener('click', (e)=>{
            e.stopPropagation();
            const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
            if (isMobile){
                if (side.classList.contains('mobile-open')) closeOverlay(); else openOverlay();
            } else {
                // toggle collapsed state on wider screens
                const collapsedNow = side.classList.contains('collapsed');
                setCollapsed(!collapsedNow, true);
            }
        });

        overlay.addEventListener('click', closeOverlay);
        document.addEventListener('keydown', (ev)=>{ if (ev.key === 'Escape' && side.classList.contains('mobile-open')) closeOverlay(); });

        // Always show the toggle button (it now replaces the old sideToggleBtn behavior)
        btn.style.display = '';
        // Ensure side panel is in normal flow by default on larger screens
        if (window.innerWidth <= MOBILE_BREAKPOINT){ side.classList.add('mobile-hidden-by-default'); }
        window.addEventListener('resize', ()=>{
            if (window.innerWidth <= MOBILE_BREAKPOINT){ side.classList.add('mobile-hidden-by-default'); }
            else { side.classList.remove('mobile-hidden-by-default'); closeOverlay(); }
        });
    }
    initMobileSidePanel();
});
// Simple vanilla frontend for Moses Asset Library
// The API is served by the same service as this page.

// Default API base: prefer explicit override, otherwise call the same host that served the frontend
const API_BASE = (window.__API_BASE__ || window.location.origin);
//console.log('MosesAssetManager|API_BASE =', API_BASE);
// Auth token handling (persisted to localStorage so full page reload keeps login)
const AUTH_TOKEN_KEY = 'mam_authToken';
const AUTH_USER_KEY = 'mam_currentUser';

// Initialize from storage if available
let authToken = null;
let currentUser = null; // will contain { id, username, isAdmin }
try {
    authToken = localStorage.getItem(AUTH_TOKEN_KEY) || null;
} catch (e) {
    console.warn('Could not read auth token from localStorage', e);
    authToken = null;
}
try {
    const stored = localStorage.getItem(AUTH_USER_KEY);
    currentUser = stored ? JSON.parse(stored) : null;
} catch (e) {
    console.warn('Could not read/parse stored currentUser', e);
    currentUser = null;
}

function setCurrentUser(u){
    currentUser = u;
    try{
        if (u) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(u));
        else localStorage.removeItem(AUTH_USER_KEY);
    }catch(e){ console.warn('Could not persist currentUser', e); }
}

function setAuthToken(t){
    authToken = t;
    try{
        if (t) localStorage.setItem(AUTH_TOKEN_KEY, t);
        else localStorage.removeItem(AUTH_TOKEN_KEY);
    }catch(e){ console.warn('Could not persist auth token', e); }
    // If token is cleared, also clear the stored current user for consistency
    if (!t) setCurrentUser(null);
}

function isAuthenticated(){
    return !!authToken;
}

function updateAdminVisibility(){
    const btn = document.getElementById('adminPanelBtn');
    if (!btn) return;
    if (currentUser && currentUser.isAdmin) btn.style.display = ''; else btn.style.display = 'none';
}

async function authFetch(url, opts={}){
    opts.headers = opts.headers || {};
    if (authToken) opts.headers['Authorization'] = `Bearer ${authToken}`;
    return fetch(url, opts);
}

// Large files are sent in retryable 16 MiB chunks. The session ID is saved so
// choosing the same file again after a refresh resumes completed chunks.
async function uploadInChunks(formData, status, replaceExternalId=null){
    const fields = ['assetFile', 'thumbnail', 'thumbnailPoster'];
    const files = {};
    for (const field of fields){
        const file = formData.get(field);
        if (file instanceof Blob) files[field] = { name: file.name || `${field}.bin`, size: file.size };
    }
    const metadata = {
        assetName: formData.get('assetName'), category: formData.get('category'),
        tags: formData.get('tags'), isAnimated: formData.get('isAnimated'),
        isVideo: formData.get('isVideo'), replaceExternalId, files
    };
    const signature = JSON.stringify({ metadata,
        modified: ['assetFile', 'thumbnail'].map(field => formData.get(field)?.lastModified || 0) });
    const storageKey = `mam_upload_${signature}`;
    let id = null;
    try{ id = localStorage.getItem(storageKey); }catch(_){ }
    let state = null;
    if (id){
        const response = await authFetch(`${API_BASE}/uploads/${id}/status`);
        if (response.ok) state = await response.json();
        else { id = null; try{ localStorage.removeItem(storageKey); }catch(_){ } }
    }
    if (!id){
        const response = await authFetch(`${API_BASE}/uploads/start`, {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(metadata)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not start upload');
        id = result.id;
        state = { uploaded:{}, chunkSize:result.chunkSize };
        try{ localStorage.setItem(storageKey, id); }catch(_){ }
    }
    const chunkSize = state.chunkSize;
    const totalBytes = Object.values(files).reduce((sum, file) => sum + file.size, 0);
    let completedBytes = 0;
    for (const field of fields){
        if (!files[field]) continue;
        const file = formData.get(field);
        const done = new Set(state.uploaded?.[field] || []);
        for (let index = 0; index < Math.ceil(file.size / chunkSize); index++){
            const begin = index * chunkSize;
            const end = Math.min(file.size, begin + chunkSize);
            if (done.has(index)){ completedBytes += end - begin; continue; }
            let sent = false;
            for (let attempt = 0; attempt < 4 && !sent; attempt++){
                try{
                    const response = await authFetch(`${API_BASE}/uploads/${id}/${field}/${index}`, {
                        method:'PUT', headers:{'Content-Type':'application/octet-stream'},
                        body:file.slice(begin, end)
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || `Chunk ${index} failed`);
                    sent = true;
                }catch(error){
                    if (attempt === 3) throw error;
                    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
                }
            }
            completedBytes += end - begin;
            status.textContent = `Uploading... ${Math.floor(100 * completedBytes / totalBytes)}%`;
        }
    }
    status.textContent = 'Finishing upload...';
    const response = await authFetch(`${API_BASE}/uploads/${id}/commit`, { method:'POST' });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Could not finish upload');
    try{ localStorage.removeItem(storageKey); }catch(_){ }
    return result;
}

// Persist per-user settings to backend. `updates` can contain numeric 0/1 for RGB and/or LiquidGlass.
async function saveUserSettings(updates){
    if (!isAuthenticated()) return;
    try{
        console.debug('Saving user settings', updates);
        const res = await authFetch(`${API_BASE}/user/settings`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(updates) });
        const text = await res.text().catch(()=>null);
        let j = null;
        try{ j = text ? JSON.parse(text) : null; }catch(e){ console.warn('Non-JSON response from settings PUT', text); }
        console.debug('Save settings response', res.status, j || text);
        if (res.ok && j && j.success && j.user){
            // Update local currentUser with returned values
            setCurrentUser(j.user);
        } else {
            // surface a console warning so user/dev sees failure
            console.warn('Failed to persist user settings', res.status, j || text);
        }
    }catch(e){ console.warn('Failed to save user settings', e); }
}

// Apply server-provided user preferences to UI controls (best-effort, also writes localStorage as fallback)
function applyServerUserSettings(user){
    if (!user) return;
    try{
        // Liquid Glass (store fallback in localStorage so UI init picks it up)
        if (typeof user.LiquidGlass !== 'undefined' && user.LiquidGlass !== null){
            const lgToggle = document.getElementById('liquidGlassToggle');
            const enabled = Number(user.LiquidGlass) === 1;
            try{ localStorage.setItem('moses:liquid_glass', enabled ? '1' : '0'); }catch(e){}
            if (lgToggle){
                // Ensure control is enabled so users can toggle it after login
                try{ lgToggle.disabled = false; }catch(e){}
                lgToggle.checked = enabled;
                try{ if (enabled) document.documentElement.classList.add('liquid-glass'); else document.documentElement.classList.remove('liquid-glass'); }catch(e){}
            }
            try{ if (lgToggle) lgToggle.dispatchEvent(new Event('change')); }catch(e){}
        }
        // RGB hue-rotation (store fallback in localStorage so accent init picks it up)
        if (typeof user.RGB !== 'undefined' && user.RGB !== null){
            const rgbToggle = document.getElementById('accentRgbToggle');
            const enabled = Number(user.RGB) === 1;
            try{ localStorage.setItem('moses:accent_rgb', enabled ? '1' : '0'); }catch(e){}
            if (rgbToggle){
                // Enable the control when applying server-side preference so the user can toggle it
                try{ rgbToggle.disabled = false; }catch(e){}
                rgbToggle.checked = enabled;
                try{ rgbToggle.dispatchEvent(new Event('change')); }catch(e){}
            }
        }
        // ThemeColor: server-provided hex/color string
        if (typeof user.ThemeColor !== 'undefined' && user.ThemeColor !== null){
            const color = (String(user.ThemeColor || '').trim()) || '#ffa31a';
            try{ localStorage.setItem('moses:accent', JSON.stringify({ accent: color, strong: color })); }catch(e){}
            try{ applyAccent(color, color); }catch(e){}
        }
    }catch(e){ /* ignore */ }
}
const searchInput = document.getElementById('searchInput');
const suggestionsEl = document.getElementById('suggestions');
const searchClearBtn = document.getElementById('searchClearBtn');
const grid = document.getElementById('grid');
const mainLoading = document.getElementById('mainLoading');
const activeTagsEl = document.getElementById('activeTags');
const countsEl = document.getElementById('counts');
const controlsEl = document.getElementById('controls');
const emptyEl = document.getElementById('empty');

let assets = [];

// Helper: check whether an asset name is unique (case-insensitive). If excludeExternalId is provided, that asset is ignored (useful when renaming an existing asset).
// CATEGORY prefix map must mirror server-side mapping so the client can determine folder collisions
// Check whether an asset name is unique within its category.
// `excludeExternalId` behaves as before for edit flows.
async function isAssetNameUnique(name, category, excludeExternalId) {
    if (!name || !name.trim()) return false;
    try{
        const res = await authFetch(`${API_BASE}/assets?search=${encodeURIComponent(name.trim())}&limit=1000`);
        const j = await res.json().catch(()=>null);
        if (!res.ok || !j || !Array.isArray(j.assets)) return true; // assume unique if backend didn't return list
        const lower = String(name).trim().toLowerCase();
        for (const a of j.assets){
            try{
                if (!a || !a.assetName) continue;
                if (String(a.assetName).trim().toLowerCase() === lower){
                    // if excludeExternalId provided, allow match with same externalId
                    if (typeof excludeExternalId !== 'undefined' && excludeExternalId !== null){
                        if (typeof a.externalId !== 'undefined' && a.externalId === excludeExternalId) continue;
                    }
                    // Names can repeat in different categories.
                    if (typeof category !== 'undefined' && category !== null){
                        if (String(a.category).toLowerCase() !== String(category).toLowerCase()) {
                            continue;
                        }
                    }
                    return false; // not unique
                }
            }catch(e){ /* ignore */ }
        }
        return true;
    }catch(e){
        // on error, default to allowing operation to avoid blocking due to transient network error
        console.warn('Name uniqueness check failed', e);
        return true;
    }
}
let allTags = [];
let activeTags = new Set();
// Multi-selection state (asset ids)
let multiSelectedAssetIds = new Set();
// Multi-selection is restricted to special categories only (Character, VFX)
// Favorites state
let favoriteAssetIds = new Set();
let showOnlyFavorites = false;
// ID sort state: true = ascending (smallest externalId first), false = descending
let idSortAsc = false;
// The unfiltered home view cycles independently through custom, ascending, and descending.
let defaultSortMode = 'custom';
// Admin-only editing state. The saved custom order itself is global and is used
// for every user's unfiltered default view.
let customSortEditing = false;
let customSortSaving = false;
let lastAssetFetchWasUnfiltered = false;

function isUnfilteredAssetView(search = null, tags = null, category = null){
    const effectiveSearch = search === null ? (searchInput ? searchInput.value.trim() : '') : String(search || '').trim();
    const effectiveTags = tags === null ? Array.from(activeTags || []) : tags;
    const effectiveCategory = category === null ? activeCategory : category;
    return !showOnlyFavorites && !effectiveSearch && (!effectiveTags || effectiveTags.length === 0) && !effectiveCategory;
}

// Wire up the custom search clear button (shows when there's text in the field)
if (searchInput && searchClearBtn){
    function _updateSearchClear(){
        try{
            if (searchInput.value && String(searchInput.value).trim().length){ searchClearBtn.classList.remove('hidden'); }
            else { searchClearBtn.classList.add('hidden'); }
        }catch(e){ /* ignore */ }
    }
    // initial state
    _updateSearchClear();
    // show/hide on input/focus
    searchInput.addEventListener('input', _updateSearchClear);
    searchInput.addEventListener('focus', _updateSearchClear);
    // hide a little after blur to allow clicks on the clear button
    searchInput.addEventListener('blur', ()=>{ setTimeout(()=>{ try{ searchClearBtn.classList.add('hidden'); }catch(e){} }, 180); });
    // clear action
    searchClearBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        try{ searchInput.value = ''; }catch(e){}
        _updateSearchClear();
        try{ suggestionsEl.classList.add('hidden'); }catch(e){}
        try{ applyFilters(); }catch(e){}
        // return focus to input
        try{ searchInput.focus(); }catch(e){}
    });
}

function getIdSort(){ return idSortAsc ? 'id_asc' : 'id_desc'; }

function updateSortToggleUI(){
    const btn = document.getElementById('sortToggle');
    if (!btn) return;
    const customOrderActive = isUnfilteredAssetView() && defaultSortMode === 'custom';
    btn.classList.toggle('custom-order-active', customOrderActive);
    if (customOrderActive) {
        btn.innerHTML = '<span class="material-symbols-outlined sortArrow" aria-hidden="true">swap_vert</span>';
        btn.title = 'Using the shared custom display order';
        return;
    }
    // Use compact material icon arrows only. Keep title/tooltip for accessibility.
    const ascending = isUnfilteredAssetView() ? defaultSortMode === 'id_asc' : idSortAsc;
    if (ascending) {
        btn.innerHTML = '<span class="material-symbols-outlined sortArrow" aria-hidden="true">keyboard_double_arrow_up</span>';
        btn.title = 'Sort by External ID (older first)';
    } else {
        btn.innerHTML = '<span class="material-symbols-outlined sortArrow" aria-hidden="true">keyboard_double_arrow_down</span>';
        btn.title = 'Sort by External ID (newer first)';
    }
    // Button sizing / centering handled via CSS (#sortToggle)
}
let isLoading = false;
let hasMore = true;
let debounceTimer = null;
let suggestionIndex = -1;
let currentSuggestions = [];
// Shift-key download mode state
let _mam_shiftDown = false;
function updateImportButtonsLabel(){
    try{
        document.querySelectorAll('.import-btn').forEach(btn => {
            if (!btn) return;
            btn.textContent = _mam_shiftDown ? 'Download' : 'Import';
        });
    }catch(e){}
}
// Track Shift key globally and update labels while page is active
window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Shift' && !_mam_shiftDown){
        _mam_shiftDown = true;
        updateImportButtonsLabel();
    }
});
window.addEventListener('keyup', (ev) => {
    if (ev.key === 'Shift' && _mam_shiftDown){
        _mam_shiftDown = false;
        updateImportButtonsLabel();
    }
});
// Reset on blur (e.g., switching windows) to avoid stuck state
window.addEventListener('blur', ()=>{ if (_mam_shiftDown){ _mam_shiftDown = false; updateImportButtonsLabel(); } });
/**
 * Fetch assets from backend.
 * options: { search, tags, offset, limit, append }
 */
async function fetchAssets({ search = '', tags = [], offset = 0, limit = 80, append = false, sort = null, category = null } = {}){
    // Require authentication before fetching assets
    if (!isAuthenticated()) return Promise.resolve([]);
    if (isLoading) return;
    // The global custom presentation order is the default only when there is no
    // search, tag, category, or favorites filter. Filtered views keep ID sorting.
    lastAssetFetchWasUnfiltered = isUnfilteredAssetView(search, tags, category);
    sort = lastAssetFetchWasUnfiltered ? defaultSortMode : (sort || getIdSort());
    updateSortToggleUI();
    isLoading = true;
  let loadingStart = Date.now();
  if (grid && !arguments[0]?.append) grid.innerHTML = '';
  if (mainLoading) mainLoading.classList.remove('hidden');
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (tags.length) params.set('tags', tags.join(','));
  if (category) params.set('category', category);
  params.set('offset', String(offset));
  params.set('limit', String(limit));
  if (sort) params.set('sort', sort);
  try{
    const res = await authFetch(`${API_BASE}/assets?${params.toString()}`);
    const json = await res.json();
  const newAssets = (json && json.success) ? (json.assets || []) : [];
  const totalFromServer = (json && json.success && typeof json.total === 'number') ? json.total : null;
    if (append){
      assets = assets.concat(newAssets);
    } else {
      assets = newAssets;
    }
  // if fewer than requested were returned, we've reached the end
  hasMore = newAssets.length >= limit;
  // expose server total for UI
  fetchAssets._total = totalFromServer;
  }catch(e){
    console.warn('Failed to fetch assets', e);
    if (!append) assets = [];
    hasMore = false;
  } finally {
    // Only apply 1s spinner delay for full reloads (not append/lazy load)
    const elapsed = Date.now() - loadingStart;
    const minDelay = 1000;
    const doRender = () => {
      buildTagIndex();
      render();
      isLoading = false;
      if (mainLoading) mainLoading.classList.add('hidden');
    };
    if (mainLoading && elapsed < minDelay && !arguments[0]?.append) {
      setTimeout(doRender, minDelay - elapsed);
    } else {
      doRender();
    }
  }
}

async function fetchTags(){
    // Require authentication before fetching tags
    if (!isAuthenticated()) return Promise.resolve([]);
    try{
        const res = await authFetch(`${API_BASE}/tags`);
    const json = await res.json();
    if (json && json.success && Array.isArray(json.tags)){
      // Merge backend tags with current allTags (frontend will re-sort)
      const merged = new Set([...(allTags||[]), ...json.tags]);
      allTags = Array.from(merged).sort((a,b)=>a.localeCompare(b));
    }
  }catch(e){
    // ignore - we'll still have asset-derived tags
    console.warn('Could not fetch tags from backend', e);
  }
}

// Fetch favorites for current user and populate favoriteAssetIds
async function fetchFavorites(){
    if (!isAuthenticated()) return [];
    try{
        const res = await authFetch(`${API_BASE}/favorites`);
        const json = await res.json().catch(()=>null);
        if (json && json.success && Array.isArray(json.assets)){
            favoriteAssetIds = new Set((json.assets || []).map(a => a.id));
            return json.assets;
        }
    }catch(e){ console.warn('Could not fetch favorites', e); }
    return [];
}

// Remove all favorites for the current user (calls DELETE per favorite)
async function clearAllFavorites(){
    if (!isAuthenticated()) { alert('Please sign in to clear favorites.'); return false; }
    if (!confirm('Remove all favorites? This cannot be undone.')) return false;
    try{
        const ids = Array.from(favoriteAssetIds);
        // perform deletes in parallel but limit concurrency to avoid overwhelming server
        const promises = ids.map(id => authFetch(`${API_BASE}/favorites/${id}`, { method: 'DELETE' }).catch(e=>({ ok:false })));
        const results = await Promise.all(promises);
        // refresh favorites state from server
        await fetchFavorites();
        // refresh favorites view if currently showing favorites
        if (showOnlyFavorites) applyFavoritesFilter();
        else render();
        return true;
    }catch(e){ console.error('Failed to clear favorites', e); alert('Failed to clear favorites'); return false; }
}

// Login overlay wiring
document.addEventListener('DOMContentLoaded', ()=>{
    const loginBtn = document.getElementById('loginBtn');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const loginError = document.getElementById('loginError');
    const loginOverlay = document.getElementById('loginOverlay');

    async function doLogin(){
        const username = loginUsername.value.trim();
        const password = loginPassword.value;
        loginError.style.display = 'none';
        try{
            const res = await fetch(`${API_BASE}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
            const json = await res.json();
            if (!json || !json.success) { loginError.textContent = json?.error || 'Login failed'; loginError.style.display = 'block'; return; }
            setAuthToken(json.token);
            setCurrentUser({ id: json.id, username: json.username, isAdmin: !!json.isAdmin, RGB: json.RGB || 0, LiquidGlass: json.LiquidGlass || 0, ThemeColor: json.ThemeColor || '', avatarUpdatedAt: json.avatarUpdatedAt || null });
            try{ applyServerUserSettings(json); }catch(e){}
            // Offer to save credentials using the Credential Management API when available
            try{
                if (window.PasswordCredential && navigator.credentials && navigator.credentials.store){
                    try{
                        const cred = new PasswordCredential({ id: username, password });
                        await navigator.credentials.store(cred);
                    }catch(e){
                        // some browsers restrict direct PasswordCredential construction; fall through to create()
                        try{
                            const created = await navigator.credentials.create({ password: { id: username, password } });
                            if (created && navigator.credentials.store) await navigator.credentials.store(created);
                        }catch(_){ /* ignore */ }
                    }
                } else if (navigator.credentials && navigator.credentials.create){
                    try{
                        const created = await navigator.credentials.create({ password: { id: username, password } });
                        if (created && navigator.credentials.store) await navigator.credentials.store(created);
                    }catch(_){ /* ignore */ }
                }
            }catch(e){ console.warn('Credential store failed', e); }
            updateAdminVisibility();
            updateAvatarUI();
            // hide overlay and load favorites, tags + assets now that we're authenticated
            if (loginOverlay) loginOverlay.style.display = 'none';
            await fetchFavorites();
            await Promise.all([fetchTags(), fetchAssets({ search: searchInput ? searchInput.value.trim() : '', tags: Array.from(activeTags), offset:0, limit:80, append:false, sort:getIdSort(), category: activeCategory })]);
            buildTagIndex();
        }catch(e){ loginError.textContent = 'Login error'; loginError.style.display = 'block'; }
    }

    if (loginBtn){ loginBtn.addEventListener('click', doLogin); }
        // trigger login when pressing Enter in username or password fields
        [loginUsername, loginPassword].forEach(el => {
            if (!el) return;
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); doLogin(); }
            });
        });
        // autofocus username for convenience
        if (loginUsername) { setTimeout(()=>{ loginUsername.focus(); }, 50); }
    // If token exists (including from localStorage), validate with /auth/me and auto-hide overlay
    (async ()=>{
            if (!authToken) return;
        try{
            const r = await authFetch(`${API_BASE}/auth/me`);
            const j = await r.json();
            if (j && j.success){
                    if (loginOverlay) loginOverlay.style.display = 'none';
                    // prefer server-provided user object, but fall back to stored
                    setCurrentUser(j.user || currentUser);
                    try{ applyServerUserSettings(j.user); }catch(e){}
                    updateAdminVisibility();
                    updateAvatarUI();
                    await fetchFavorites();
                    await Promise.all([fetchTags(), fetchAssets({ search: searchInput ? searchInput.value.trim() : '', tags: Array.from(activeTags), offset:0, limit:80, append:false, sort:getIdSort(), category: activeCategory })]);
                    buildTagIndex();
            } else {
                setAuthToken(null);
            }
        }catch(e){ setAuthToken(null); }
    })();

    // Optional: wire a logout button if present in the UI
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn){
        logoutBtn.addEventListener('click', async ()=>{
            // inform backend (best effort) then clear local state and reload to show login
            try{ await authFetch(`${API_BASE}/auth/logout`, { method: 'POST' }); }catch(e){}
            setAuthToken(null);
            setCurrentUser(null);
            updateAvatarUI();
            // reload to ensure full-reset of in-memory state and show login overlay
            window.location.reload();
        });
    }
});

function buildTagIndex(){
  const set = new Set(allTags || []); // start with backend-provided tags if present
  (assets || []).forEach(a => {
    if (Array.isArray(a.tags)) a.tags.forEach(t=>{ if (t) set.add(t); });
  });
  allTags = Array.from(set).sort((a,b)=>a.localeCompare(b));
}

// Copy text to clipboard with a graceful fallback for older browsers
async function copyTextToClipboard(text){
    if (!text) return false;
    try{
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function'){
            await navigator.clipboard.writeText(text);
            return true;
        }
    }catch(e){ /* fallthrough to legacy */ }
    try{
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
    }catch(e){ return false; }
}

// show a small transient tooltip near an element (used to confirm copy)
function showCopyTooltip(targetEl, message){
    try{
        const tip = document.createElement('div');
        tip.className = 'copy-tooltip';
        tip.textContent = message || 'Copied';
        document.body.appendChild(tip);
        // position above the element if possible
        const rect = targetEl.getBoundingClientRect();
        const tipWidth = tip.offsetWidth;
        const left = Math.max(8, rect.left + (rect.width / 2) - (tipWidth / 2));
        const top = window.scrollY + rect.top - tip.offsetHeight - 8;
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
        setTimeout(()=>{ tip.classList.add('visible'); }, 10);
        setTimeout(()=>{ try{ tip.classList.remove('visible'); setTimeout(()=>tip.remove(), 220); }catch(e){} }, 1500);
    }catch(e){ /* ignore tooltip failures */ }
}

function isAssetFavorited(asset){ return favoriteAssetIds.has(asset.id); }

// Toggle favorite state for an asset (calls backend)
// If `btnEl` is provided, perform optimistic UI toggle on that element
async function toggleFavorite(asset, btnEl){
    if (!isAuthenticated()) { alert('Please sign in to use favorites.'); return; }
    const aid = asset.id;
    const already = favoriteAssetIds.has(aid);
    try{
        // optimistic toggle of UI
        if (btnEl) btnEl.classList.toggle('favorited');
        if (already){
            const res = await authFetch(`${API_BASE}/favorites/${aid}`, { method: 'DELETE' });
            const j = await res.json().catch(()=>null);
            if (res.ok && j && j.success){ favoriteAssetIds.delete(aid); }
            else {
                // revert optimistic UI
                if (btnEl) btnEl.classList.toggle('favorited');
            }
        } else {
            const res = await authFetch(`${API_BASE}/favorites`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ assetId: aid }) });
            const j = await res.json().catch(()=>null);
            if (res.ok && j && j.success){ favoriteAssetIds.add(aid); }
            else {
                if (btnEl) btnEl.classList.toggle('favorited');
            }
        }
        // No need to re-render the entire grid - optimistic UI update already handled the visual state
        // Only re-render would be needed if we're in favorites-only view and removing a favorite
        if (showOnlyFavorites && already){
            render();
        }
    }catch(e){ console.error('Favorite toggle failed', e); }
}

// Apply favorites filter: will load assets only from favorites
function applyFavoritesFilter(){
    showOnlyFavorites = true;
    hasMore = false; // disable paging for favorites view
    (async ()=>{
        const favs = await fetchFavorites();
        assets = favs || [];
        // expose total as favorites count so any UI referencing fetchAssets._total stays consistent
        fetchAssets._total = (assets || []).length;
        render();
    })();
}

let customSortDraggedCard = null;
let customSortOriginalOrder = [];
const customSortSelectedIds = new Set();

function customSortIsMultiSelect(event){
    return !!(event && (event.ctrlKey || event.metaKey));
}

function updateCustomSortSelection(card, event){
    const id = String(card.dataset.externalId || '');
    if (!id) return;
    if (customSortIsMultiSelect(event)) {
        if (customSortSelectedIds.has(id)) customSortSelectedIds.delete(id);
        else customSortSelectedIds.add(id);
    } else {
        customSortSelectedIds.clear();
        customSortSelectedIds.add(id);
    }
    grid.querySelectorAll('.card[data-external-id]').forEach(node => {
        node.classList.toggle('custom-sort-selected', customSortSelectedIds.has(String(node.dataset.externalId)));
    });
    const count = customSortSelectedIds.size;
    setCustomSortStatus(count > 1 ? `${count} assets selected — hold Ctrl/⌘ to add or remove` : '');
}

function selectedCustomSortCards(){
    return Array.from(grid.querySelectorAll('.card[data-external-id]'))
        .filter(card => customSortSelectedIds.has(String(card.dataset.externalId)));
}

function canEditCustomSort(){
    return !!(customSortEditing && currentUser && currentUser.isAdmin && lastAssetFetchWasUnfiltered && isUnfilteredAssetView() && defaultSortMode === 'custom');
}

function setCustomSortStatus(message, isError = false){
    const status = document.getElementById('customSortStatus');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('error', !!isError);
}

function renderCustomSortControls(){
    if (!controlsEl) return;
    let notice = document.getElementById('customSortNotice');
    if (!canEditCustomSort()) {
        if (notice) notice.remove();
        return;
    }
    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'customSortNotice';
        notice.className = 'custom-sort-notice';
        notice.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">drag_indicator</span><span>Custom Sort: hold Ctrl (Windows/Linux) or ⌘ (macOS) to select multiple cards, then drag one selected card to move the group.</span><span id="customSortStatus" aria-live="polite"></span><button id="customSortDone" class="btn small" type="button">Done</button>';
        controlsEl.appendChild(notice);
        notice.querySelector('#customSortDone').addEventListener('click', ()=>{
            customSortEditing = false;
            const toggle = document.getElementById('customSortToggle');
            if (toggle) toggle.checked = false;
            render();
        });
    }
}

async function saveCustomDisplayOrder(){
    if (customSortSaving || !canEditCustomSort()) return;
    const orderedExternalIds = Array.from(grid.querySelectorAll('.card[data-external-id]'))
        .map(card => Number(card.dataset.externalId))
        .filter(Number.isSafeInteger);
    if (!orderedExternalIds.length) return;

    const byExternalId = new Map((assets || []).map(asset => [Number(asset.externalId), asset]));
    const reordered = orderedExternalIds.map(id => byExternalId.get(id)).filter(Boolean);
    const present = new Set(orderedExternalIds);
    assets = reordered.concat((assets || []).filter(asset => !present.has(Number(asset.externalId))));

    customSortSaving = true;
    setCustomSortStatus('Saving…');
    grid.classList.add('custom-sort-saving');
    try{
        const response = await authFetch(`${API_BASE}/assets/display-order`, {
            method: 'PUT',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ orderedExternalIds })
        });
        const result = await response.json().catch(()=>null);
        if (!response.ok || !result || !result.success) throw new Error(result?.error || 'Could not save the order');
        setCustomSortStatus('Saved');
        setTimeout(()=>setCustomSortStatus(''), 1600);
    }catch(err){
        console.error('Failed to save custom asset order', err);
        setCustomSortStatus(err.message || 'Save failed', true);
        await fetchAssets({ offset:0, limit:Math.max(80, assets.length), append:false, sort:'custom' });
    }finally{
        customSortSaving = false;
        grid.classList.remove('custom-sort-saving');
    }
}

function enableCustomSortDrag(){
    if (!grid || grid._customSortBound) return;
    grid._customSortBound = true;

    grid.addEventListener('dragover', (event)=>{
        if (!customSortDraggedCard || !canEditCustomSort()) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const target = event.target.closest('.card[data-external-id]');
        if (!target || customSortSelectedIds.has(String(target.dataset.externalId))) return;
        const rect = target.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2 ||
            (Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height / 4 && event.clientX < rect.left + rect.width / 2);
        const moving = selectedCustomSortCards();
        const reference = before ? target : target.nextSibling;
        moving.forEach(card => card.remove());
        moving.forEach(card => grid.insertBefore(card, reference));
    });

    grid.addEventListener('drop', (event)=>{
        if (!customSortDraggedCard || !canEditCustomSort()) return;
        event.preventDefault();
        const newOrder = Array.from(grid.querySelectorAll('.card[data-external-id]')).map(card => card.dataset.externalId);
        const changed = newOrder.join(',') !== customSortOriginalOrder.join(',');
        customSortDraggedCard.classList.remove('custom-sort-dragging');
        selectedCustomSortCards().forEach(card => card.classList.remove('custom-sort-dragging'));
        customSortDraggedCard = null;
        if (changed) saveCustomDisplayOrder();
    });
}

function render(){
  grid.innerHTML = '';
  updateSortToggleUI();
  if (!assets.length){
    emptyEl.classList.remove('hidden');
  } else {
    emptyEl.classList.add('hidden');
  }
    // Determine assets to display (respect favorites filter)
    const displayAssets = showOnlyFavorites ? (assets || []).filter(a => favoriteAssetIds.has(a.id)) : assets;

    // Show count: when Favorites view is active, show number of favorite assets for the user.
    if (showOnlyFavorites) {
        countsEl.textContent = `${displayAssets.length} assets`;
    } else {
        // Show server-provided total when available, otherwise current loaded count
        const total = fetchAssets._total;
        countsEl.textContent = (typeof total === 'number') ? `${total} assets` : `${assets.length} assets`;
    }
    // Controls: show Clear Favorites button only in favorites view
    if (controlsEl) {
        const inner = controlsEl.querySelector('div');
        if (inner) {
            try{ inner.style.display = 'flex'; inner.style.alignItems = 'center'; }catch(e){}
            let right = inner.querySelector('.controls-right');
            if (showOnlyFavorites) {
                if (!right) {
                    right = document.createElement('div');
                    right.className = 'controls-right';
                    right.style.marginLeft = 'auto';
                    right.style.display = 'flex';
                    right.style.gap = '8px';
                    right.style.alignItems = 'center';
                    inner.appendChild(right);
                }
                // ensure button exists
                let btn = right.querySelector('#clearFavoritesBtn');
                if (!btn) {
                    btn = document.createElement('button');
                    btn.id = 'clearFavoritesBtn';
                    btn.className = 'top-settings';
                    btn.title = 'Clear all favorites';
                    btn.style='display:contents;';
                    btn.innerHTML = '<span class="material-symbols-outlined">delete_sweep</span>Clear favorites';
                    btn.addEventListener('click', async ()=>{ const ok = await clearAllFavorites(); if (ok) { showCopyTooltip(btn, 'Favorites cleared'); } });
                    right.appendChild(btn);
                }
            } else {
                if (right) {
                    try{ right.remove(); }catch(e){}
                }
            }
        }
    }
    renderCustomSortControls();
    displayAssets.forEach(asset=>{
	    const card = document.createElement('article');
	    card.className = 'card';
    card.dataset.assetId = asset.id;
    card.dataset.externalId = asset.externalId;
    if (canEditCustomSort()) {
        card.draggable = true;
        card.classList.add('custom-sort-card');
        card.classList.toggle('custom-sort-selected', customSortSelectedIds.has(String(asset.externalId)));
        card.title = 'Drag to change the shared display order';
        card.addEventListener('click', (event)=>{
            if (event.target.closest('button,a,input,select,textarea,video')) return;
            updateCustomSortSelection(card, event);
        });
        card.addEventListener('dragstart', (event)=>{
            if (customSortSaving) { event.preventDefault(); return; }
            if (!customSortSelectedIds.has(String(asset.externalId))) {
                customSortSelectedIds.clear();
                customSortSelectedIds.add(String(asset.externalId));
                grid.querySelectorAll('.card[data-external-id]').forEach(node => node.classList.remove('custom-sort-selected'));
            }
            customSortDraggedCard = card;
            customSortOriginalOrder = Array.from(grid.querySelectorAll('.card[data-external-id]')).map(node => node.dataset.externalId);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(asset.externalId));
            requestAnimationFrame(()=>selectedCustomSortCards().forEach(node => node.classList.add('custom-sort-dragging')));
        });
        card.addEventListener('dragend', ()=>{
            selectedCustomSortCards().forEach(node => node.classList.remove('custom-sort-dragging'));
            customSortDraggedCard = null;
        });
    }

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    
    const img = document.createElement('img');
    img.alt = asset.assetName || 'thumb';
    
    // Check if this is a video or animated asset (isVideo=1 OR isAnimated=1)
    const hasAnimatedContent = (Number(asset.isVideo) === 1 || Number(asset.isAnimated) === 1);
    
    if (hasAnimatedContent && asset.thumbnailPosterPath && asset.thumbnailPath){
        // Show poster by default, swap to WebM video on hover
        img.src = asset.thumbnailPosterPath;
        const videoUrl = asset.thumbnailPath;
        
        // Create video element for hover playback
        const video = document.createElement('video');
        video.src = videoUrl;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'none';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.display = 'none';
        
        thumb.appendChild(img);
        thumb.appendChild(video);
        
        // On hover: hide poster, show and play video
        thumb.addEventListener('mouseenter', () => {
            img.style.display = 'none';
            video.style.display = 'block';
            video.play().catch(err => console.warn('WebM playback failed:', err));
        });
        
        // On mouse leave: pause video, hide it, show poster
        thumb.addEventListener('mouseleave', () => {
            video.pause();
            video.style.display = 'none';
            img.style.display = 'block';
        });
    } else if (asset.thumbnailPath){
        img.src = asset.thumbnailPath;
        thumb.appendChild(img);
    } else if (asset.assetPath && asset.assetPath.endsWith('.png')){
        img.src = asset.assetPath;
        thumb.appendChild(img);
    } else {
        img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="100%" height="100%" fill="%230a1724"/><text x="50%" y="50%" fill="%2399a7b6" dominant-baseline="middle" text-anchor="middle" font-size="18">No Thumbnail</text></svg>';
        thumb.appendChild(img);
    }

        // Allow multi-selection when holding Shift, and clearing all when Alt+clicking a selected asset
        thumb.addEventListener('click', (e)=>{
            // If Alt is held and the clicked asset is part of selection, clear all selections
            if (e.altKey && multiSelectedAssetIds.has(asset.id)){
                multiSelectedAssetIds.clear();
                // remove visual indicators from any existing cards
                document.querySelectorAll('.card.multi-selected').forEach(c=>c.classList.remove('multi-selected'));
                return;
            }
            // Only toggle selection when Shift is held (per spec)
            if (e.shiftKey){
                // Multi-selection is allowed only for video assets (isVideo === 1)
                // asset.isVideo may be numeric or boolean; coerce to Number for a reliable check
                if (!(asset && Number(asset.isVideo) === 1)){
                    return;
                }
                // Toggle selection for allowed assets
                if (multiSelectedAssetIds.has(asset.id)){
                    multiSelectedAssetIds.delete(asset.id);
                    card.classList.remove('multi-selected');
                } else {
                    multiSelectedAssetIds.add(asset.id);
                    card.classList.add('multi-selected');
                }
                // prevent other click handlers (like opening viewer) when selecting
                e.stopPropagation();
            }
        });

    // Favorite star (top-left)
    const favBtn = document.createElement('button');
    favBtn.className = 'fav-star';
    favBtn.type = 'button';
    favBtn.title = 'Add to favorites';
    // Inline SVG bookmark: outline when not favorited, filled when .favorited is present
    favBtn.innerHTML = '<svg class="fav-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="star" d="M6 2h12a1 1 0 0 1 1 1v18l-7-3-7 3V3a1 1 0 0 1 1-1z"></path></svg>';
    if (isAssetFavorited(asset)) favBtn.classList.add('favorited');
    favBtn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleFavorite(asset, favBtn); });
    thumb.appendChild(favBtn);

    // Add a small fullscreen button to open full image
    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'thumb-zoom';
    zoomBtn.type = 'button';
    zoomBtn.title = 'Open full size';
    zoomBtn.setAttribute('aria-label', 'Open full size');
    // Use Google Material Symbols 'fullscreen' icon (Material Symbols Outlined is already loaded in index.html)
    zoomBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">fullscreen</span>';
    // Prefer full-size: for video/animated assets use GIF thumbnailPath; else fall back to assetPath if it's an image
    const fullSrc = (asset && (Number(asset.isVideo) === 1 || Number(asset.isAnimated) === 1) && asset.thumbnailPath) ? asset.thumbnailPath : ((asset.assetPath && /(\.png|\.jpg|\.jpeg|\.webp|\.gif)$/i.test(asset.assetPath)) ? asset.assetPath : (asset.thumbnailPath || img.src));
    zoomBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      openImageViewer(fullSrc, asset.assetName || 'Preview', asset);
    });
    thumb.appendChild(zoomBtn);    const meta = document.createElement('div');
    meta.className = 'meta';

    // Name immediately under the thumbnail
    const name = document.createElement('div');
    name.className = 'asset-name';
    name.textContent = asset.assetName || '(unnamed)';
    
    // Feature: Show full name on hover and hint that clicking will copy it
    const fullNameForTitle = asset.assetName || '(unnamed)';
    const titleSuffix = ' (click to copy)';
    name.title = fullNameForTitle.endsWith(titleSuffix) ? fullNameForTitle : (fullNameForTitle + titleSuffix);
    // Also provide an accessible label
    name.setAttribute('aria-label', fullNameForTitle + ' — click to copy');

    // Click the name to copy the full asset name to clipboard and show a tiny tooltip
    name.style.cursor = 'pointer';
    name.addEventListener('click', (e) => {
        e.stopPropagation();
        const fullName = asset.assetName || '(unnamed)';
        // Attempt to use modern clipboard API, fallback to textarea copy
        // No visual tooltip requested; copy silently. Keep function for reuse/fallback.
        const doTooltip = () => { /* silent copy — no tooltip */ };

        if (navigator.clipboard && navigator.clipboard.writeText){
            navigator.clipboard.writeText(fullName).then(doTooltip).catch(()=>{
                // fallback
                try{
                    const ta = document.createElement('textarea');
                    ta.value = fullName;
                    ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0';
                    document.body.appendChild(ta); ta.focus(); ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    doTooltip();
                }catch(err){ console.error('Copy failed', err); }
            });
        } else {
            try{
                const ta = document.createElement('textarea');
                ta.value = fullName;
                ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.focus(); ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                doTooltip();
            }catch(err){ console.error('Copy failed', err); }
        }
    });

    meta.appendChild(name);

    // Asset id under the name
    const assetIdTop = document.createElement('div');
    assetIdTop.className = 'asset-id';
    // inner span holds the text so hover only applies to the text itself
    const idSpan = document.createElement('span');
    idSpan.className = 'id-text';
    // Prefer externalId for display/copy; fallback to primary DB id
    const displayId = (typeof asset.externalId !== 'undefined' && asset.externalId !== null) ? asset.externalId : asset.id;
    idSpan.textContent = `#${displayId}`;
    idSpan.title = `Click to copy ID: ${displayId}`;
    idSpan.style.cursor = 'pointer';
    // copy id when clicking the visible text only
    idSpan.addEventListener('click', () => {
        const textToCopy = String(displayId);
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                const existingTooltip = card.querySelector('.copy-tooltip');
                if (existingTooltip) existingTooltip.remove();
                const tooltip = document.createElement('div');
                // no text as requested (visual marker only)
                tooltip.textContent = '';
                tooltip.className = 'copy-tooltip';
                card.appendChild(tooltip);
                setTimeout(() => { tooltip.remove(); }, 2000);
            }
        } catch (err) {
            console.error('Fallback: Unable to copy', err);
        }

        document.body.removeChild(textArea);
    });
    assetIdTop.appendChild(idSpan);
    meta.appendChild(assetIdTop);

    // Tags under the id
    const tagList = document.createElement('div');
    tagList.className = 'tag-list';
        if (Array.isArray(asset.tags)){
            const visible = asset.tags.slice(0,8);
            visible.forEach(t=>{
                    const span = document.createElement('div');
                    span.className='tag-small';
                    span.textContent=t;
                    span.style.cursor = 'pointer';
                      // Plain click: search/filter for the clicked tag. Ctrl/Meta+click: copy all tags for this asset.
                      span.addEventListener('click', async (ev)=>{
                          // Ctrl (Windows/Linux) or Meta/Command (macOS) => copy tags only
                          if (ev.ctrlKey || ev.metaKey){
                              ev.stopPropagation();
                              const tagsArr = Array.isArray(asset.tags) ? asset.tags : [];
                              const text = tagsArr.join(', ');
                              const ok = await copyTextToClipboard(text);
                              if (ok) showCopyTooltip(span, 'Copied'); else showCopyTooltip(span, 'Copy failed');
                              return;
                          }
                          // Normal click: add this tag to active filters and apply
                          ev.stopPropagation();
                          try{
                              if (typeof activeTags !== 'undefined'){
                                  activeTags.add(t);
                                  if (searchInput) searchInput.value = '';
                                  applyFilters();
                              }
                          }catch(e){ console.warn('Failed to apply tag filter', e); }
                      });
                    tagList.appendChild(span);
            });
            if (asset.tags.length > 8){
                const more = document.createElement('div'); more.className='tag-small tag-more'; more.textContent = `+${asset.tags.length - 8}`; tagList.appendChild(more);
            }
        }

        // Always append a non-clickable category-derived tag at the end of the tag list
        try{
            if (asset && asset.category){
                const catSpanEnd = document.createElement('div');
                catSpanEnd.className = 'tag-small category-tag';
                try{ catSpanEnd.textContent = (typeof readableCategoryName === 'function') ? readableCategoryName(asset.category) : asset.category; }catch(e){ catSpanEnd.textContent = asset.category; }
                catSpanEnd.setAttribute('aria-hidden','true');
                catSpanEnd.tabIndex = -1;
                tagList.appendChild(catSpanEnd);
            }
        }catch(e){}
        meta.appendChild(tagList);

    // Footer with Import button
    const foot = document.createElement('div');
    foot.className = 'card-foot';
    const btn = document.createElement('button');
    btn.addEventListener('click', () => {
      playChosiSound();
    });

    // Import buttons: only use standard btn class (sheen removed)
    // Add `import-btn` so we can toggle label when Shift is held
    btn.className = 'btn import-btn';
    btn.textContent = 'Import';

    // Click handler: behave as download when Shift is held, otherwise keep previous logging behavior.
    btn.addEventListener('click', (e)=>{
        const shiftMode = _mam_shiftDown || e.shiftKey;
        // If there is a multi-selection and this asset is part of it, either download all selected (shift) or log combined info
        if (multiSelectedAssetIds.size > 0 && multiSelectedAssetIds.has(asset.id)){
            const selected = (assets || []).filter(a => multiSelectedAssetIds.has(a.id));
            if (selected.length){
                if (shiftMode){
                    // Trigger browser downloads for each selected asset that has an assetPath
                    selected.forEach(a => {
                        try{
                            if (a && a.assetPath){
                                const url = a.assetPath;
                                const filename = (a.assetName || '').replace(/\s/g,'') || url.split('/').pop();
                                const aEl = document.createElement('a');
                                aEl.href = url;
                                aEl.download = filename;
                                aEl.style.display = 'none';
                                document.body.appendChild(aEl);
                                aEl.click();
                                document.body.removeChild(aEl);
                            }
                        }catch(err){ console.warn('Download failed for asset', a, err); }
                    });
                    return;
                } else {
                    const links = selected.map(a => a.assetPath || '').join(',');
                    const names = selected.map(a => (a.assetName||'').replace(/\s/g, '')).join(',');
                    const cats = selected.map(a => a.category || '').join(',');
                    console.log(`MosesAssetManagerServer|Import|${links} |${names} |${cats}|` + asset.isVideo);
                    return;
                }
            }
        }
        // Single asset behavior
        if (shiftMode){
            try{
                if (asset && asset.assetPath){
                    const url = asset.assetPath;
                    const filename = (asset.assetName || '').replace(/\s/g,'') || url.split('/').pop();
                    const aEl = document.createElement('a');
                    aEl.href = url;
                    aEl.download = filename;
                    aEl.style.display = 'none';
                    document.body.appendChild(aEl);
                    aEl.click();
                    document.body.removeChild(aEl);
                }
            }catch(err){ console.warn('Download failed for asset', asset, err); }
            return;
        }
        // Default: single asset import log
        console.log('MosesAssetManagerServer|Import|'+(asset.assetPath||'')+" |"+(asset.assetName||'').replace(/\s/g, '')+" |" + (asset.category||'') + "|" + asset.isVideo);
    });


    foot.appendChild(btn);

    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(foot);

    grid.appendChild(card);
  });

	  renderActiveTags();
	  enableCustomSortDrag();
  // After rendering cards, enable drag-to-scroll on all tag lists
  enableTagListDrag();
}

// Drag-to-scroll helper for horizontal tag lists
function enableTagListDrag(){
  const lists = document.querySelectorAll('.tag-list');
  lists.forEach(el=>{
  // avoid re-binding
  if (el._dragBound) return;
    // only enable drag if the tags overflow the visible container (i.e. not all tags fit)
    // use scrollWidth/clientWidth because the number of child nodes doesn't reliably indicate visual overflow
    if (el.scrollWidth <= el.clientWidth) return;
  el._dragBound = true;
  el.classList.add('draggable');
    let isDown = false; let startX; let scrollLeft;
    const onPointerDown = (e)=>{
      isDown = true; el.classList.add('dragging');
      startX = (e.touches ? e.touches[0].pageX : e.pageX) - el.getBoundingClientRect().left;
      scrollLeft = el.scrollLeft;
    };
    const onPointerMove = (e)=>{
      if (!isDown) return;
        // Append a non-clickable category-derived tag (not part of asset.tags) at the end
        try{
            if (asset && asset.category){
                const catSpanEnd = document.createElement('div');
                catSpanEnd.className = 'tag-small category-tag';
                try{ catSpanEnd.textContent = (typeof readableCategoryName === 'function') ? readableCategoryName(asset.category) : asset.category; }catch(e){ catSpanEnd.textContent = asset.category; }
                catSpanEnd.setAttribute('aria-hidden','true');
                catSpanEnd.tabIndex = -1;
                tagList.appendChild(catSpanEnd);
            }
        }catch(e){}
      const x = (e.touches ? e.touches[0].pageX : e.pageX) - el.getBoundingClientRect().left;
      const walk = (x - startX) * 1; // scroll-fast multiplier
      el.scrollLeft = scrollLeft - walk;
    };
    const onPointerUp = ()=>{ isDown = false; el.classList.remove('dragging'); };

    // Mouse
    el.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    // Touch
    el.addEventListener('touchstart', onPointerDown,{passive:true});
    el.addEventListener('touchmove', onPointerMove,{passive:false});
    el.addEventListener('touchend', onPointerUp);
  });
}

function renderActiveTags(){
    activeTagsEl.innerHTML = '';
    Array.from(activeTags).forEach(t=>{
        const chip = document.createElement('div');
        chip.className = 'tag-chip selected';
        chip.textContent = t;
        const btn = document.createElement('button');
        btn.setAttribute('aria-label', `Remove tag ${t}`);
        btn.innerHTML = '✕';
        btn.title = 'Remove tag';
        btn.addEventListener('click', ()=>{ activeTags.delete(t); applyFilters(); });
        chip.appendChild(btn);
        activeTagsEl.appendChild(chip);
    });

        // If there are 2 or more active tags, show a small "Clear tags" button
        if (activeTags.size > 1){
        const clearBtn = document.createElement('button');
    clearBtn.id = 'clearActiveTagsBtn';
    // Give the clear button the same visual classes as an active tag chip so it appears identical
    clearBtn.className = 'tag-chip selected clear-tags-btn';
        clearBtn.type = 'button';
        clearBtn.title = 'Clear all active tags';
        clearBtn.textContent = 'Clear tags';
        clearBtn.addEventListener('click', ()=>{
            activeTags.clear();
            renderActiveTags();
            applyFilters();
        });
        activeTagsEl.appendChild(clearBtn);
    }
}

// Suggestions logic: suggest tags when input is close to a known tag
function computeSuggestions(q){
  if (!q) return [];
  const ql = q.trim().toLowerCase();
  const suggestions = [];
  // tag matches only (no asset-name suggestions)
  allTags.forEach(tag=>{
    const tl = tag.toLowerCase();
    const levDist = levenshtein(ql, tl);
    if (tl.includes(ql) || levDist <= 2) {
      // Calculate relevance score for sorting
      let relevance = 0;
      if (tl === ql) {
        relevance = 4; // Exact match
      } else if (tl.startsWith(ql)) {
        relevance = 3; // Starts with query
      } else if (tl.includes(ql)) {
        relevance = 2; // Contains query
      } else {
        relevance = 1; // Fuzzy match only
      }
      suggestions.push({type:'tag', value:tag, relevance, levDist});
    }
  });
  // unique by value
  const seen = new Set();
  const uniq = suggestions.filter(s=>{
    if (seen.has(s.value)) return false; seen.add(s.value); return true;
  });
  // Sort by relevance (highest first), then by Levenshtein distance (lowest first), then alphabetically
  uniq.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    if (a.levDist !== b.levDist) return a.levDist - b.levDist;
    return a.value.localeCompare(b.value);
  });
  return uniq.slice(0,12);
}

// Default suggested tags (shown when search is focused and empty)
const DEFAULT_SUGGESTED_TAGS = ['Derakht','Gol','Boote','Koozeh','Zarf'];
function getDefaultSuggestionObjects(){ return DEFAULT_SUGGESTED_TAGS.map(t=>({ type: 'tag', value: t })); }

function showSuggestions(list, isDefault = false){
  suggestionIndex = -1;
  currentSuggestions = list;
  if (!list.length){ suggestionsEl.classList.add('hidden'); return; }
  suggestionsEl.innerHTML = '';
  
  // Add header for default suggestions only
  if (isDefault) {
    const header = document.createElement('div');
    header.className = 'suggestions-header';
    header.textContent = 'Suggested Tags';
    header.style.cssText = 'text-align:center; padding:8px 12px; font-size:13px; font-weight:600; color:#fff; border-bottom:1px solid rgba(255,255,255,0.08); pointer-events:none;';
    suggestionsEl.appendChild(header);
  }
  
  list.forEach((s, idx)=>{
    const el = document.createElement('div');
    el.className = 'suggestion';
    el.dataset.idx = idx;
    el.innerHTML = `<strong>${escapeHtml(s.value)}</strong> <span style="float:right;color:var(--muted);font-size:12px">${s.type}</span>`;
    el.addEventListener('click', ()=>{ onSuggestionClick(idx); });
    suggestionsEl.appendChild(el);
  });
  suggestionsEl.classList.remove('hidden');
}function onSuggestionClick(idx){
  const s = currentSuggestions[idx];
  if (!s) return;
  if (s.type === 'tag'){
    activeTags.add(s.value);
    // clear the search input when a tag is chosen
    searchInput.value = '';
    applyFilters();
  } else {
    searchInput.value = s.value;
    applyFilters();
  }
  suggestionsEl.classList.add('hidden');
  searchInput.focus();
}

function applyFilters(){
  const q = searchInput.value.trim();
  const tags = Array.from(activeTags);
  // Reset paging when filters change
    hasMore = true;
    showOnlyFavorites = false;
    fetchAssets({ search: q, tags, offset: 0, limit: 80, append: false, sort: getIdSort(), category: activeCategory });
}

// small helper: escape html
function escapeHtml(s){ return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[c]); }

// Levenshtein distance for fuzzy matching
function levenshtein(a,b){
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
  for(let i=0;i<=a.length;i++) dp[i][0]=i;
  for(let j=0;j<=b.length;j++) dp[0][j]=j;
  for(let i=1;i<=a.length;i++){
    for(let j=1;j<=b.length;j++){
      const cost = a[i-1]===b[j-1]?0:1;
      dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    }
  }
  return dp[a.length][b.length];
}

// Input handlers
searchInput.addEventListener('input', (e)=>{
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(()=>{
        const q = e.target.value.trim();
        if (!q) {
            // when empty, show the default suggested tags
            const defs = getDefaultSuggestionObjects();
            showSuggestions(defs, true); // true = show header
        } else {
            const sugg = computeSuggestions(q);
            showSuggestions(sugg, false); // false = no header
        }
    }, 180);
});

// Show default suggestions when the search input receives focus and is empty
searchInput.addEventListener('focus', (e)=>{
    const q = searchInput.value.trim();
    if (!q) {
        const defs = getDefaultSuggestionObjects();
        showSuggestions(defs, true); // true = show header
    }
});

// Hide suggestions when search input loses focus
searchInput.addEventListener('blur', (e)=>{
    // Use setTimeout to allow click events on suggestions to fire before hiding
    setTimeout(() => {
        suggestionsEl.classList.add('hidden');
    }, 200);
});

searchInput.addEventListener('keydown', (e)=>{
  const items = suggestionsEl.querySelectorAll('.suggestion');
  if (e.key === 'ArrowDown'){
    e.preventDefault(); suggestionIndex = Math.min(suggestionIndex+1, items.length-1); highlightSuggestion();
  } else if (e.key === 'ArrowUp'){
    e.preventDefault(); suggestionIndex = Math.max(suggestionIndex-1, 0); highlightSuggestion();
  } else if (e.key === 'Enter'){
        e.preventDefault();
        if (suggestionIndex >= 0) {
            onSuggestionClick(suggestionIndex);
        } else {
            // User pressed Enter to perform the search — hide any visible suggestions
            suggestionsEl.classList.add('hidden');
            currentSuggestions = [];
            suggestionIndex = -1;
            applyFilters();
        }
    } else if (e.key === 'Escape'){
        suggestionsEl.classList.add('hidden');
    } else {
        // any other printable key likely means the user is typing — let input handler manage suggestions
    }
});

function highlightSuggestion(){
  const nodes = suggestionsEl.querySelectorAll('.suggestion');
  nodes.forEach(n=>n.style.background='');
  const cur = nodes[suggestionIndex];
  if (cur) cur.style.background='rgba(255,255,255,0.02)';
}

// Note: do NOT fetch assets immediately based only on a stored token.
// Token presence in localStorage doesn't guarantee validity. The login
// overlay logic below validates the token with /auth/me and will
// fetch tags/assets only after successful validation or after an
// explicit user login. This avoids background fetch attempts while the
// login overlay is shown.

// Lazy load more assets on scroll (100 per load)
// Load more when the bottom of the assets grid reaches near the viewport bottom.
let scrollCheckTimer = null;
window.addEventListener('scroll', ()=>{
  if (scrollCheckTimer) return;
  scrollCheckTimer = setTimeout(()=>{
    scrollCheckTimer = null;
    if (!hasMore || isLoading) return;
    const rect = grid.getBoundingClientRect();
    // If the grid bottom is within 300px of the viewport bottom, load more
    const nearGridBottom = rect.bottom <= (window.innerHeight + 300);
    if (!nearGridBottom) return;
        const q = searchInput.value.trim();
        const tags = Array.from(activeTags);
    fetchAssets({ search: q, tags, offset: assets.length, limit: 100, append: true, sort: getIdSort(), category: activeCategory });
  }, 120);
});

// expose for debugging
window.__moses = { fetchAssets, assets, allTags, activeTags };

// Helper: require a full click (pointerdown + pointerup) on an overlay element
// before invoking the close callback. This prevents accidental closes when
// the user starts a press inside a modal and releases outside (drag-release).
function attachOverlayClickRequiresFullClick(overlayEl, onClose){
    if (!overlayEl) return;
    overlayEl._pendingClose = false;
    overlayEl.addEventListener('pointerdown', (e)=>{
        if (e.target === overlayEl){ if (typeof e.button === 'number' && e.button !== 0) return; overlayEl._pendingClose = true; } else { overlayEl._pendingClose = false; }
    });
    overlayEl.addEventListener('pointerup', (e)=>{ if (overlayEl._pendingClose && e.target === overlayEl) onClose(); overlayEl._pendingClose = false; });
    overlayEl.addEventListener('pointercancel', ()=>{ overlayEl._pendingClose = false; });
}

// Settings modal behavior (overlay modal centered on screen)
const settingsBtn = document.getElementById('settingsBtn');
const modalOverlay = document.getElementById('modalOverlay');
const modal = document.getElementById('modal');
const modalClose = document.getElementById('modalClose');
const adminPanelBtn = document.getElementById('adminPanelBtn');
const adminOverlay = document.getElementById('adminOverlay');
const adminModal = document.getElementById('adminModal');
const adminClose = document.getElementById('adminClose');
const customSortToggle = document.getElementById('customSortToggle');

if (customSortToggle){
    customSortToggle.addEventListener('change', async (event)=>{
        const enabled = !!event.target.checked;
        if (enabled && !(currentUser && currentUser.isAdmin)) {
            event.target.checked = false;
            return;
        }
        customSortEditing = enabled;
        if (!enabled) {
            render();
            return;
        }

        // Editing is intentionally restricted to the default, unfiltered list.
        // Move the admin there automatically so a filtered subset cannot replace
        // the shared global order.
        showOnlyFavorites = false;
        defaultSortMode = 'custom';
        activeCategory = null;
        activeTags.clear();
        if (searchInput) searchInput.value = '';
        updateCategoryHighlight();
        hasMore = true;
        if (adminClose) adminClose.click();
        await fetchAssets({ offset:0, limit:Math.max(80, assets.length || 0), append:false, sort:'custom' });
    });
}

// Password change modal elements
const changePasswordModalBtn = document.getElementById('changePasswordModalBtn');
const passwordModalOverlay = document.getElementById('passwordModalOverlay');
const passwordModal = document.getElementById('passwordModal');
const passwordModalClose = document.getElementById('passwordModalClose');
const currentPasswordInput = document.getElementById('currentPassword');
const newPasswordInput = document.getElementById('newPassword');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
const passwordChangeMessage = document.getElementById('passwordChangeMessage');

if (settingsBtn && modalOverlay && modal){
  // remember previous body styles so we can restore them
  let _prevBodyOverflow = '';
  let _prevBodyPaddingRight = '';

  function openModal(){
    // preserve current inline styles
    _prevBodyOverflow = document.body.style.overflow || '';
    _prevBodyPaddingRight = document.body.style.paddingRight || '';

    // compute scrollbar width to avoid layout shift when hiding overflow
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    modalOverlay.classList.remove('hidden');
    modalOverlay.setAttribute('aria-hidden','false');
    settingsBtn.setAttribute('aria-expanded','true');
    // prevent body scrolling while modal open
    document.body.style.overflow = 'hidden';
  }

  function closeModal(){
    modalOverlay.classList.add('hidden');
    modalOverlay.setAttribute('aria-hidden','true');
    settingsBtn.setAttribute('aria-expanded','false');
    // restore previous body styles
    document.body.style.overflow = _prevBodyOverflow;
    document.body.style.paddingRight = _prevBodyPaddingRight;
  }
  settingsBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openModal(); });
  modalClose && modalClose.addEventListener('click', ()=> closeModal());

  // Close when clicking outside the modal (on the overlay)
    // Close only when a full click (pointerdown + pointerup) occurs on the overlay.
    function attachOverlayClickRequiresFullClick(overlayEl, onClose){
        if (!overlayEl) return;
        overlayEl._pendingClose = false;
        overlayEl.addEventListener('pointerdown', (e)=>{
            if (e.target === overlayEl){ if (typeof e.button === 'number' && e.button !== 0) return; overlayEl._pendingClose = true; } else { overlayEl._pendingClose = false; }
        });
        overlayEl.addEventListener('pointerup', (e)=>{ if (overlayEl._pendingClose && e.target === overlayEl) onClose(); overlayEl._pendingClose = false; });
        overlayEl.addEventListener('pointercancel', ()=>{ overlayEl._pendingClose = false; });
    }

    attachOverlayClickRequiresFullClick(modalOverlay, closeModal);

  // Close on Escape key
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeModal(); });
}

// Password change handler
if (changePasswordBtn && currentPasswordInput && newPasswordInput && passwordChangeMessage) {
  // Clear error messages when user starts typing
  currentPasswordInput.addEventListener('input', () => {
    passwordChangeMessage.style.display = 'none';
  });
  newPasswordInput.addEventListener('input', () => {
    passwordChangeMessage.style.display = 'none';
  });

  changePasswordBtn.addEventListener('click', async () => {
    const currentPassword = currentPasswordInput.value.trim();
    const newPassword = newPasswordInput.value.trim();

    // Validate inputs
    if (!currentPassword || !newPassword) {
      passwordChangeMessage.textContent = 'Both fields are required';
      passwordChangeMessage.style.display = 'block';
      passwordChangeMessage.style.background = 'rgba(255, 82, 82, 0.1)';
      passwordChangeMessage.style.color = '#ff5252';
      passwordChangeMessage.style.border = '1px solid rgba(255, 82, 82, 0.3)';
      return;
    }

    if (newPassword.length < 8) {
      passwordChangeMessage.textContent = 'New password must be at least 8 characters';
      passwordChangeMessage.style.display = 'block';
      passwordChangeMessage.style.background = 'rgba(255, 82, 82, 0.1)';
      passwordChangeMessage.style.color = '#ff5252';
      passwordChangeMessage.style.border = '1px solid rgba(255, 82, 82, 0.3)';
      return;
    }

    // Show loading state
    const originalBtnText = changePasswordBtn.innerHTML;
    changePasswordBtn.disabled = true;
    changePasswordBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">hourglass_empty</span> Changing...';

    try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
      const response = await fetch(`${API_BASE}/auth/editpassword`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();

      if (response.ok) {
        // Success
        passwordChangeMessage.textContent = 'Password changed successfully!';
        passwordChangeMessage.style.display = 'block';
        passwordChangeMessage.style.background = 'rgba(76, 175, 80, 0.1)';
        passwordChangeMessage.style.color = '#4caf50';
        passwordChangeMessage.style.border = '1px solid rgba(76, 175, 80, 0.3)';
        
        // Clear inputs
        currentPasswordInput.value = '';
        newPasswordInput.value = '';
      } else {
        // Error from server
        passwordChangeMessage.textContent = data.error || 'Failed to change password';
        passwordChangeMessage.style.display = 'block';
        passwordChangeMessage.style.background = 'rgba(255, 82, 82, 0.1)';
        passwordChangeMessage.style.color = '#ff5252';
        passwordChangeMessage.style.border = '1px solid rgba(255, 82, 82, 0.3)';
      }
    } catch (error) {
      console.error('Password change error:', error);
      passwordChangeMessage.textContent = 'Network error. Please try again.';
      passwordChangeMessage.style.display = 'block';
      passwordChangeMessage.style.background = 'rgba(255, 82, 82, 0.1)';
      passwordChangeMessage.style.color = '#ff5252';
      passwordChangeMessage.style.border = '1px solid rgba(255, 82, 82, 0.3)';
    } finally {
      // Restore button state
      changePasswordBtn.disabled = false;
      changePasswordBtn.innerHTML = originalBtnText;
    }
  });
}

// Password change modal behavior
if (changePasswordModalBtn && passwordModalOverlay && passwordModal) {
  let _prevBodyOverflow_password = '';
  let _prevBodyPaddingRight_password = '';

  function openPasswordModal() {
    _prevBodyOverflow_password = document.body.style.overflow || '';
    _prevBodyPaddingRight_password = document.body.style.paddingRight || '';
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    passwordModalOverlay.classList.remove('hidden');
    passwordModalOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    // Clear any previous messages and inputs
    if (passwordChangeMessage) passwordChangeMessage.style.display = 'none';
    if (currentPasswordInput) currentPasswordInput.value = '';
    if (newPasswordInput) newPasswordInput.value = '';
  }

  function closePasswordModal() {
    passwordModalOverlay.classList.add('hidden');
    passwordModalOverlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = _prevBodyOverflow_password;
    document.body.style.paddingRight = _prevBodyPaddingRight_password;
  }

  // Open password modal when button clicked from settings
  changePasswordModalBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openPasswordModal();
  });

  // Close button
  if (passwordModalClose) {
    passwordModalClose.addEventListener('click', () => closePasswordModal());
  }

  // Cancel button
  if (cancelPasswordBtn) {
    cancelPasswordBtn.addEventListener('click', () => closePasswordModal());
  }

  // Close when clicking outside the modal
  function attachPasswordOverlayClick(overlayEl, onClose) {
    if (!overlayEl) return;
    overlayEl._pendingClose = false;
    overlayEl.addEventListener('pointerdown', (e) => {
      if (e.target === overlayEl) {
        if (typeof e.button === 'number' && e.button !== 0) return;
        overlayEl._pendingClose = true;
      } else {
        overlayEl._pendingClose = false;
      }
    });
    overlayEl.addEventListener('pointerup', (e) => {
      if (overlayEl._pendingClose && e.target === overlayEl) onClose();
      overlayEl._pendingClose = false;
    });
    overlayEl.addEventListener('pointercancel', () => {
      overlayEl._pendingClose = false;
    });
  }

  attachPasswordOverlayClick(passwordModalOverlay, closePasswordModal);

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !passwordModalOverlay.classList.contains('hidden')) {
      closePasswordModal();
    }
  });
}

// Admin panel behavior (shared behavior with settings modal)
if (adminPanelBtn && adminOverlay && adminModal){
    let _prevBodyOverflow_admin = '';
    let _prevBodyPaddingRight_admin = '';

    function openAdmin(){
        _prevBodyOverflow_admin = document.body.style.overflow || '';
        _prevBodyPaddingRight_admin = document.body.style.paddingRight || '';
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
        adminOverlay.classList.remove('hidden');
        adminOverlay.setAttribute('aria-hidden','false');
        adminPanelBtn.setAttribute('aria-expanded','true');
        document.body.style.overflow = 'hidden';
                // make sure the admin form cannot perform a native submit (attach guard here to guarantee element exists)
                try{
                    // ensure upload button is type=button (prevents implicit submission in some browsers)
                    const upBtn = document.getElementById('uploadBtn'); if (upBtn) upBtn.type = 'button';
                    // prevent Enter key inside name input from submitting (useful when inside an input)
                    const nameFld = document.getElementById('uploadAssetName'); if (nameFld && !nameFld._enterGuardAttached){ nameFld.addEventListener('keydown', (ev)=>{ if (ev.key === 'Enter') { ev.preventDefault(); } }); nameFld._enterGuardAttached = true; }
                }catch(e){ console.warn('Could not attach admin form guards', e); }
    }

    function closeAdmin(){
        adminOverlay.classList.add('hidden');
        adminOverlay.setAttribute('aria-hidden','true');
        adminPanelBtn.setAttribute('aria-expanded','false');
        document.body.style.overflow = _prevBodyOverflow_admin;
        document.body.style.paddingRight = _prevBodyPaddingRight_admin;
                // Reset admin panel UI back to the main actions view
                try{
                    const adminFormEl = document.getElementById('adminUploadForm');
                    const adminActionsEl = document.getElementById('adminActions');
                    if (adminFormEl) {
                        adminFormEl.style.display = 'none';
                        // clear form fields and status
                        const thumb = document.getElementById('uploadThumbnail'); if (thumb) thumb.value = '';
                        const file = document.getElementById('uploadFileInput'); if (file) file.value = '';
                        const nameFld = document.getElementById('uploadAssetName'); if (nameFld) nameFld.value = '';
                        const tagsFld = document.getElementById('uploadTags'); if (tagsFld) tagsFld.value = '';
                        const status = document.getElementById('uploadStatus'); if (status) status.textContent = '';
                        const upBtn = document.getElementById('uploadBtn'); if (upBtn) upBtn.disabled = false;
                    }
                    if (adminActionsEl) adminActionsEl.style.display = 'grid';
                }catch(e){ console.warn('Failed to reset admin UI', e); }
    }

    adminPanelBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openAdmin(); });
    adminClose && adminClose.addEventListener('click', ()=> closeAdmin());

    attachOverlayClickRequiresFullClick(adminOverlay, closeAdmin);
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeAdmin(); });
}

// --- Admin upload form behavior ---
async function loadCategoriesIntoSelect(){
    const sel = document.getElementById('uploadCategory');
    if (!sel) return;
    sel.innerHTML = '';
    Object.entries(categoryData).forEach(([group, cats])=>{
        const optgroup = document.createElement('optgroup');
        optgroup.label = group;
        cats.forEach(cat=>{
            const option = document.createElement('option');
            option.value = cat; // keep raw id so backend filtering can match exactly
            option.textContent = readableCategoryName(cat);
            optgroup.appendChild(option);
        });
        sel.appendChild(optgroup);
    });
}

document.addEventListener('DOMContentLoaded', ()=>{ loadCategoriesIntoSelect(); });

// adminUploadForm is now a div (not a native <form>), so native submits won't occur.
const adminForm = document.getElementById('adminUploadForm');

// Admin panel action buttons: New / Delete
const newAssetBtn = document.getElementById('newAssetBtn');
const deleteAssetBtn = document.getElementById('deleteAssetBtn');
const adminActions = document.getElementById('adminActions');
if (newAssetBtn){
    newAssetBtn.addEventListener('click', (e)=>{
        // show the upload form
        if (adminForm) adminForm.style.display = 'flex';
        if (adminActions) adminActions.style.display = 'none';
        // focus the name field
        const nameFld = document.getElementById('uploadAssetName'); if (nameFld) nameFld.focus();
        // repopulate categories in case it wasn't loaded
        loadCategoriesIntoSelect();
    });
}
// Delete left as no-op for now (placeholder)
if (deleteAssetBtn) deleteAssetBtn.addEventListener('click', ()=>{
    // show delete form
    const delForm = document.getElementById('adminDeleteForm');
    const adminActionsEl = document.getElementById('adminActions');
    if (delForm) delForm.style.display = 'flex';
    if (adminActionsEl) adminActionsEl.style.display = 'none';
    // focus input
    const delInput = document.getElementById('deleteExternalId'); if (delInput) { delInput.value = ''; delInput.focus(); }
});

// Edit Asset wiring
const editAssetBtn = document.getElementById('editAssetBtn');
const adminEditForm = document.getElementById('adminEditForm');
const editExternalId = document.getElementById('editExternalId');
const editCategory = document.getElementById('editCategory');
const editTags = document.getElementById('editTags');
const confirmEditBtn = document.getElementById('confirmEditBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const editStatus = document.getElementById('editStatus');
let editTagsRequestId = 0;
let loadedEditExternalId = null;

function setEditStatus(message, isError = false){
    if (!editStatus) return;
    editStatus.textContent = message;
    editStatus.classList.toggle('error-text', isError);
}

function parseExternalId(rawValue){
    const normalized = String(rawValue ?? '').trim();
    if (!/^\d+$/.test(normalized)) return null;
    const value = Number(normalized);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function loadEditTagsByExternalId(){
    if (!editExternalId || !editTags) return;

    const editIsAnimatedCheckbox = document.getElementById('editIsAnimated');

    const externalId = parseExternalId(editExternalId.value);
    if (externalId === null){
        editTagsRequestId++;
        loadedEditExternalId = null;
        editTags.value = '';
        if (editCategory) editCategory.selectedIndex = 0;
        if (editIsAnimatedCheckbox) editIsAnimatedCheckbox.checked = false;
        setEditStatus('Please enter a valid External ID.', true);
        return;
    }

    const requestId = ++editTagsRequestId;
    loadedEditExternalId = null;
    editTags.value = '';
    if (editCategory) editCategory.selectedIndex = 0;
    if (editIsAnimatedCheckbox) editIsAnimatedCheckbox.checked = false;
    setEditStatus('Loading asset details...');

    try{
        // Ensure categories are populated before we try to select one
        if (editCategory && editCategory.options.length === 0) {
            await loadEditCategories();
        }

        // Fetch the full asset object — guaranteed to include tags, category, and isAnimated
        const res = await authFetch(`${API_BASE}/assets/${externalId}`);
        const json = await res.json().catch(()=>null);
        if (requestId !== editTagsRequestId) return;
        if (!res.ok || !json || !json.success){
            throw new Error(json?.error || 'No asset found with that External ID.');
        }

        const asset = json.asset;
        if (!asset){
            throw new Error('No asset found with that External ID.');
        }

        // Set tags
        const tags = Array.isArray(asset.tags) ? asset.tags : [];
        editTags.value = tags.join(', ');

        // Set category in the dropdown
        const category = (typeof asset.category === 'string') ? asset.category.trim() : '';
        if (editCategory && category !== '') {
            // Check if the category exists as an option in the dropdown
            let found = false;
            for (let i = 0; i < editCategory.options.length; i++) {
                if (editCategory.options[i].value === category) {
                    found = true;
                    break;
                }
            }
            // If the category isn't in the hardcoded list, add it dynamically
            if (!found) {
                const opt = document.createElement('option');
                opt.value = category;
                opt.textContent = (typeof readableCategoryName === 'function') ? readableCategoryName(category) : category;
                editCategory.appendChild(opt);
            }
            editCategory.value = category;
        }

        // Set Animated (VAT/flipbook) checkbox state based on fetched asset data
        if (editIsAnimatedCheckbox) {
            editIsAnimatedCheckbox.checked = (asset.isAnimated === 1 || asset.isAnimated === true);
        }

        loadedEditExternalId = externalId;
        setEditStatus('Asset details loaded.');
        editTags.focus();
    }catch(err){
        if (requestId !== editTagsRequestId) return;
        loadedEditExternalId = null;
        editTags.value = '';
        if (editCategory) editCategory.selectedIndex = 0;
        if (editIsAnimatedCheckbox) editIsAnimatedCheckbox.checked = false;
        setEditStatus(err.message || 'Failed to fetch asset details.', true);
    }
}

if (editExternalId){
    editExternalId.addEventListener('keydown', (event)=>{
        if (event.key !== 'Enter') return;
        event.preventDefault();
        loadEditTagsByExternalId();
    });

    editExternalId.addEventListener('input', ()=>{
        editTagsRequestId++;
        const currentId = parseExternalId(editExternalId.value);
        if (loadedEditExternalId !== null && currentId !== loadedEditExternalId){
            loadedEditExternalId = null;
            if (editTags) editTags.value = '';
            if (editCategory) editCategory.selectedIndex = 0;
            const editIsAnimatedCheckbox = document.getElementById('editIsAnimated');
            if (editIsAnimatedCheckbox) editIsAnimatedCheckbox.checked = false;
        }
        setEditStatus('');
    });
}

// Replace Tags form elements
const replaceTagsBtn = document.getElementById('replaceTagsBtn');
const adminReplaceTagsForm = document.getElementById('adminReplaceTagsForm');
const replaceOldTag = document.getElementById('replaceOldTag');
const replaceNewTag = document.getElementById('replaceNewTag');
const doReplaceTagsBtn = document.getElementById('doReplaceTagsBtn');
const cancelReplaceTagsBtn = document.getElementById('cancelReplaceTagsBtn');
const replaceTagsStatus = document.getElementById('replaceTagsStatus');
// Backup DB button
const backupDbBtn = document.getElementById('backupDbBtn');
const databaseManagerBtn = document.getElementById('databaseManagerBtn');
const storageManagerBtn = document.getElementById('storageManagerBtn');
if (databaseManagerBtn) databaseManagerBtn.addEventListener('click', () => window.open('./admin-tools.html?view=database', '_blank'));
if (storageManagerBtn) storageManagerBtn.addEventListener('click', () => window.open('./admin-tools.html?view=storage', '_blank'));
// New User modal elements
const newUserBtn = document.getElementById('newUserBtn');
const newUserModalOverlay = document.getElementById('newUserModalOverlay');
const newUserModal = document.getElementById('newUserModal');
const newUserModalClose = document.getElementById('newUserModalClose');
const newUserUsername = document.getElementById('newUserUsername');
const newUserPassword = document.getElementById('newUserPassword');
const newUserIsAdmin = document.getElementById('newUserIsAdmin');
const createUserBtn = document.getElementById('createUserBtn');
const cancelNewUserBtn = document.getElementById('cancelNewUserBtn');
const newUserMessage = document.getElementById('newUserMessage');

// Populate edit category select when admin panel opens or on demand
async function loadEditCategories(){
    if (!editCategory) return;
    editCategory.innerHTML = '';
    Object.entries(categoryData).forEach(([group, cats])=>{
        const optgroup = document.createElement('optgroup');
        optgroup.label = group;
        cats.forEach(cat=>{
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = readableCategoryName(cat);
            optgroup.appendChild(option);
        });
        editCategory.appendChild(optgroup);
    });
}

if (editAssetBtn){
    editAssetBtn.addEventListener('click', (e)=>{
        e.stopPropagation();
        // show edit form and hide other admin forms/actions
        if (adminEditForm) adminEditForm.style.display = 'flex';
        const delForm = document.getElementById('adminDeleteForm'); if (delForm) delForm.style.display = 'none';
        const adminActionsEl = document.getElementById('adminActions'); if (adminActionsEl) adminActionsEl.style.display = 'none';
        loadEditCategories();
        // focus externalId field
        if (editExternalId) { editExternalId.value = ''; editExternalId.focus(); }
        if (editTags) editTags.value = '';
        if (editCategory) editCategory.selectedIndex = 0;
        const editIsAnimatedCheckbox = document.getElementById('editIsAnimated');
        if (editIsAnimatedCheckbox) editIsAnimatedCheckbox.checked = false;
        editTagsRequestId++;
        loadedEditExternalId = null;
        setEditStatus('');
    });
}

// Wire Replace Tags admin button
if (replaceTagsBtn && adminReplaceTagsForm){
    replaceTagsBtn.addEventListener('click', (e)=>{
        e.stopPropagation();
        // show replace form and hide other admin actions
        const adminActionsEl = document.getElementById('adminActions');
        if (adminActionsEl) adminActionsEl.style.display = 'none';
        adminReplaceTagsForm.style.display = 'flex';
        replaceOldTag.value = '';
        replaceNewTag.value = '';
        replaceTagsStatus.textContent = '';
        replaceOldTag.focus();
    });

    cancelReplaceTagsBtn && cancelReplaceTagsBtn.addEventListener('click', ()=>{
        const adminActionsEl = document.getElementById('adminActions');
        if (adminReplaceTagsForm) adminReplaceTagsForm.style.display = 'none';
        if (adminActionsEl) adminActionsEl.style.display = 'grid';
    });

    doReplaceTagsBtn && doReplaceTagsBtn.addEventListener('click', async ()=>{
        const oldTag = (replaceOldTag.value || '').trim();
        const newTag = (replaceNewTag.value || '').trim();
        if (!oldTag || !newTag){ replaceTagsStatus.textContent = 'Please provide both names.'; return; }
        replaceTagsStatus.textContent = 'Replacing tags...';
        doReplaceTagsBtn.disabled = true;
        try{
            const res = await authFetch(`${API_BASE}/admin/replace-tags`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ oldTag, newTag }) });
            const j = await res.json().catch(()=>null);
            if (!res.ok || !j || !j.success){ throw new Error(j?.error || 'Replace failed'); }
            replaceTagsStatus.textContent = `Replaced tags in ${j.updatedRows || j.rowCount || 0} assets.`;
            // refresh tags and assets
            await fetchTags(); await fetchAssets({ search: searchInput ? searchInput.value.trim() : '', tags: Array.from(activeTags), offset:0, limit:80, append:false, sort:getIdSort(), category: activeCategory });
            // hide form after short delay
            setTimeout(()=>{
                const adminActionsEl = document.getElementById('adminActions');
                if (adminReplaceTagsForm) adminReplaceTagsForm.style.display = 'none';
                if (adminActionsEl) adminActionsEl.style.display = 'grid';
                replaceTagsStatus.textContent = '';
            }, 900);
        }catch(err){
            console.error('Replace tags failed', err);
            replaceTagsStatus.textContent = 'Replace failed: ' + (err.message || 'Unknown');
        }finally{ doReplaceTagsBtn.disabled = false; }
    });
}

// Wire Backup DB button
if (backupDbBtn){
    backupDbBtn.addEventListener('click', async (e)=>{
        e.stopPropagation();
        // confirm destructive/IO action
        const ok = confirm('Create a backup of the database and all uploaded assets?');
        if (!ok) return;
        try{
            backupDbBtn.disabled = true;
            const prev = backupDbBtn.innerHTML;
            backupDbBtn.innerHTML = '<span class="material-symbols-outlined">backup</span>Backing up...';
            const res = await authFetch(`${API_BASE}/admin/backup-db`, { method: 'POST' });
            const j = await res.json().catch(()=>null);
            if (!res.ok || !j || !j.success){ throw new Error(j?.error || 'Backup failed'); }
            const link = document.createElement('a');
            link.href = `${API_BASE}${j.downloadUrl}`;
            link.download = j.filename;
            link.click();
            alert(`Backup created as ${j.filename}. The browser download has started; a copy is also in the host's data/backups folder.`);
        }catch(err){
            console.error('Backup DB failed', err);
            alert('Backup failed: ' + (err.message || 'Unknown'));
        }finally{
            backupDbBtn.disabled = false;
            backupDbBtn.innerHTML = '<span class="material-symbols-outlined">backup</span>Backup All';
        }
    });
}

// New User modal behavior
if (newUserBtn && newUserModalOverlay && newUserModal) {
  let _prevBodyOverflow_newUser = '';
  let _prevBodyPaddingRight_newUser = '';

  function openNewUserModal() {
    _prevBodyOverflow_newUser = document.body.style.overflow || '';
    _prevBodyPaddingRight_newUser = document.body.style.paddingRight || '';
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    newUserModalOverlay.classList.remove('hidden');
    newUserModalOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    // Clear any previous messages and inputs
    if (newUserMessage) newUserMessage.style.display = 'none';
    if (newUserUsername) newUserUsername.value = '';
    if (newUserPassword) newUserPassword.value = '';
    if (newUserIsAdmin) newUserIsAdmin.checked = false;
  }

  function closeNewUserModal() {
    newUserModalOverlay.classList.add('hidden');
    newUserModalOverlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = _prevBodyOverflow_newUser;
    document.body.style.paddingRight = _prevBodyPaddingRight_newUser;
  }
  if (newUserModalClose) {
    newUserModalClose.addEventListener('click', () => closeNewUserModal());
  }

  // Cancel button
  if (cancelNewUserBtn) {
    cancelNewUserBtn.addEventListener('click', () => closeNewUserModal());
  }

  // Close when clicking outside the modal
  function attachNewUserOverlayClick(overlayEl, onClose) {
    if (!overlayEl) return;
    overlayEl._pendingClose = false;
    overlayEl.addEventListener('pointerdown', (e) => {
      if (e.target === overlayEl) {
        if (typeof e.button === 'number' && e.button !== 0) return;
        overlayEl._pendingClose = true;
      } else {
        overlayEl._pendingClose = false;
      }
    });
    overlayEl.addEventListener('pointerup', (e) => {
      if (overlayEl._pendingClose && e.target === overlayEl) onClose();
      overlayEl._pendingClose = false;
    });
    overlayEl.addEventListener('pointercancel', () => {
      overlayEl._pendingClose = false;
    });
  }

  attachNewUserOverlayClick(newUserModalOverlay, closeNewUserModal);

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !newUserModalOverlay.classList.contains('hidden')) {
      closeNewUserModal();
    }
  });

  // Create user handler
  if (createUserBtn && newUserUsername && newUserPassword && newUserMessage) {
    // Clear error messages when user starts typing
    newUserUsername.addEventListener('input', () => {
      newUserMessage.style.display = 'none';
    });
    newUserPassword.addEventListener('input', () => {
      newUserMessage.style.display = 'none';
    });

    createUserBtn.addEventListener('click', async () => {
      const username = newUserUsername.value.trim();
      const password = newUserPassword.value.trim();
      const isAdmin = newUserIsAdmin.checked;

      // Validate inputs
      if (!username || !password) {
        newUserMessage.textContent = 'Both username and password are required';
        newUserMessage.style.display = 'block';
        newUserMessage.style.background = 'rgba(255, 82, 82, 0.1)';
        newUserMessage.style.color = '#ff5252';
        newUserMessage.style.border = '1px solid rgba(255, 82, 82, 0.3)';
        return;
      }

      if (password.length < 8) {
        newUserMessage.textContent = 'Password must be at least 8 characters';
        newUserMessage.style.display = 'block';
        newUserMessage.style.background = 'rgba(255, 82, 82, 0.1)';
        newUserMessage.style.color = '#ff5252';
        newUserMessage.style.border = '1px solid rgba(255, 82, 82, 0.3)';
        return;
      }

      // Show loading state
      const originalBtnText = createUserBtn.innerHTML;
      createUserBtn.disabled = true;
      createUserBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">hourglass_empty</span> Creating...';

      try {
        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        const response = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ username, password, isAdmin })
        });

        const data = await response.json();

        if (response.ok) {
          // Success
          newUserMessage.textContent = `User "${username}" created successfully!`;
          newUserMessage.style.display = 'block';
          newUserMessage.style.background = 'rgba(76, 175, 80, 0.1)';
          newUserMessage.style.color = '#4caf50';
          newUserMessage.style.border = '1px solid rgba(76, 175, 80, 0.3)';
          
          // Clear inputs
          newUserUsername.value = '';
          newUserPassword.value = '';
          newUserIsAdmin.checked = false;

          // Close modal after a short delay
          setTimeout(() => {
            closeNewUserModal();
          }, 1500);
        } else {
          // Error from server
          newUserMessage.textContent = data.error || 'Failed to create user';
          newUserMessage.style.display = 'block';
          newUserMessage.style.background = 'rgba(255, 82, 82, 0.1)';
          newUserMessage.style.color = '#ff5252';
          newUserMessage.style.border = '1px solid rgba(255, 82, 82, 0.3)';
        }
      } catch (error) {
        console.error('Create user error:', error);
        newUserMessage.textContent = 'Network error. Please try again.';
        newUserMessage.style.display = 'block';
        newUserMessage.style.background = 'rgba(255, 82, 82, 0.1)';
        newUserMessage.style.color = '#ff5252';
        newUserMessage.style.border = '1px solid rgba(255, 82, 82, 0.3)';
      } finally {
        // Restore button state
        createUserBtn.disabled = false;
        createUserBtn.innerHTML = originalBtnText;
      }
    });
  }
}

if (cancelEditBtn){
    cancelEditBtn.addEventListener('click', ()=>{
        const adminActionsEl = document.getElementById('adminActions'); if (adminActionsEl) adminActionsEl.style.display = 'grid';
        if (adminEditForm) adminEditForm.style.display = 'none';
        editTagsRequestId++;
        loadedEditExternalId = null;
        if (editCategory) editCategory.selectedIndex = 0;
        setEditStatus('');
    });
}

if (confirmEditBtn){
    confirmEditBtn.addEventListener('click', async ()=>{
        if (!editExternalId) return;
        const val = parseExternalId(editExternalId.value);
        if (val === null){ setEditStatus('Please enter a valid External ID.', true); return; }
        const category = editCategory ? editCategory.value : '';
        const tagsRaw = editTags ? editTags.value : '';
        const tagsArray = tagsRaw.split(',').map(t=>t.trim()).filter(Boolean);
        const editIsAnimatedCheckbox = document.getElementById('editIsAnimated');
        const isAnimatedFlag = (editIsAnimatedCheckbox && editIsAnimatedCheckbox.checked) ? '1' : '0';
        if (!category){ setEditStatus('Please select a category.', true); return; }
        setEditStatus('Updating...');
        confirmEditBtn.disabled = true;
        // If the edit form exposes an editable asset name, validate uniqueness before proceeding.
        try{
            const nameEl = document.getElementById('editAssetName');
            if (nameEl && String(nameEl.value || '').trim()){
                const desired = String(nameEl.value).trim();
                const unique = await isAssetNameUnique(desired, category, val);
                if (!unique){
                    if (editStatus){ editStatus.classList.add('error-text'); editStatus.textContent = 'Edit failed: Asset name already exists. Please choose a unique name.'; }
                    confirmEditBtn.disabled = false;
                    return;
                } else {
                    if (editStatus) editStatus.classList.remove('error-text');
                }
            }
        }catch(e){ /* allow edits to proceed if uniqueness check fails */ }
        try{
            // If files are present in the edit form, send multipart to replace files on the host.
            const thumbInput = document.getElementById('editThumbnail');
            const assetFileInput = document.getElementById('editAssetFile');
            let res;
            if ((thumbInput && thumbInput.files && thumbInput.files.length) || (assetFileInput && assetFileInput.files && assetFileInput.files.length)){
                const fd = new FormData();
                const thumb = thumbInput && thumbInput.files.length ? thumbInput.files[0] : null;
                if (thumb) fd.append('thumbnail', thumb);
                if (assetFileInput && assetFileInput.files.length) fd.append('assetFile', assetFileInput.files[0]);
                // include metadata as optional fields
                fd.append('category', category);
                fd.append('tags', tagsArray.join(','));
                fd.append('isAnimated', isAnimatedFlag);
                // If thumbnail is GIF or WebM and isAnimated is checked, generate poster
                if (thumb && isAnimatedFlag === '1'){
                    const thumbLower = (thumb.name||'').toLowerCase();
                    const isWebM = thumbLower.endsWith('.webm');
                    const isGif = thumbLower.endsWith('.gif');
                    if ((isWebM || isGif)){
                        try{
                            let posterBlob;
                            if (isWebM){
                                // Extract first frame from WebM video
                                posterBlob = await new Promise((resolve, reject)=>{
                                    const video = document.createElement('video');
                                    video.preload = 'metadata';
                                    video.onerror = ()=> reject(new Error('Failed loading WebM for poster generation'));
                                    video.onseeked = ()=>{
                                        try{
                                            const canvas = document.createElement('canvas');
                                            canvas.width = video.videoWidth;
                                            canvas.height = video.videoHeight;
                                            const ctx = canvas.getContext('2d');
                                            ctx.drawImage(video, 0, 0);
                                            canvas.toBlob((b)=>{ if (b) resolve(b); else reject(new Error('Canvas toBlob returned null')); }, 'image/png');
                                        }catch(err){ reject(err); }
                                    };
                                    video.src = URL.createObjectURL(thumb);
                                    video.currentTime = 0;
                                });
                            } else {
                                // Extract from GIF using FileReader + Image
                                posterBlob = await new Promise((resolve, reject)=>{
                                    const reader = new FileReader();
                                    reader.onload = ()=>{
                                        const img = new Image();
                                        img.onload = ()=>{
                                            try{
                                                const canvas = document.createElement('canvas');
                                                canvas.width = img.naturalWidth || img.width;
                                                canvas.height = img.naturalHeight || img.height;
                                                const ctx = canvas.getContext('2d');
                                                ctx.drawImage(img, 0, 0);
                                                canvas.toBlob((b)=>{ if (b) resolve(b); else reject(new Error('Canvas toBlob returned null')); }, 'image/png');
                                            }catch(err){ reject(err); }
                                        };
                                        img.onerror = ()=> reject(new Error('Failed loading GIF for poster generation'));
                                        img.src = reader.result;
                                    };
                                    reader.onerror = ()=> reject(new Error('FileReader failed'));
                                    reader.readAsDataURL(thumb);
                                });
                            }
                            const posterName = (thumb.name || 'poster').replace(/\.(gif|webm)$/i, '') + '_poster.png';
                            fd.append('thumbnailPoster', posterBlob, posterName);
                        }catch(err){ console.warn('Could not generate poster from thumbnail:', err); }
                    }
                }
                // if an asset file was provided in the edit form, set isVideo accordingly
                try{
                    const f = assetFileInput.files && assetFileInput.files[0];
                    if (f){
                        const name = f.name || '';
                        const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
                        const videoExts = new Set(['.mp4','.mov','.avi','.wmv','.mkv','.flv','.webm','.mpeg','.mpg','.m4v']);
                        fd.append('isVideo', videoExts.has(ext) ? '1' : '0');
                    }
                }catch(e){}
                const large = Array.from(fd.values()).some(value => value instanceof Blob && value.size > 128 * 1024 * 1024);
                if (large){
                    const result = await uploadInChunks(fd, editStatus, val);
                    res = { ok:true, json:async()=>result };
                } else {
                    res = await authFetch(`${API_BASE}/assets/${val}/files`, { method: 'PUT', body: fd });
                }
            } else {
                res = await authFetch(`${API_BASE}/assets/${val}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ category, tags: tagsArray, isAnimated: parseInt(isAnimatedFlag, 10) }) });
            }
            const json = await res.json().catch(()=>null);
            if (!res.ok || !json || !json.success){ throw new Error((json && json.error) ? json.error : (res.statusText || 'Update failed')); }
            setEditStatus('Updated successfully.');
            // refresh tags and assets
            await fetchTags(); await fetchAssets({ search: searchInput ? searchInput.value.trim() : '', tags: Array.from(activeTags), offset:0, limit:80, append:false, sort:getIdSort(), category: activeCategory });
            // clear file inputs if any
            try{ if (thumbInput) thumbInput.value = ''; if (assetFileInput) assetFileInput.value = ''; }catch(e){}
            // hide form after short delay (match delete timing)
            setTimeout(()=>{
                const adminActionsEl = document.getElementById('adminActions'); if (adminActionsEl) adminActionsEl.style.display = 'grid';
                if (adminEditForm) adminEditForm.style.display = 'none';
                if (editStatus) editStatus.textContent = '';
            }, 900);
        }catch(err){ console.error('Edit asset failed', err); setEditStatus('Edit failed: ' + (err.message || 'Unknown'), true); }
        finally{ confirmEditBtn.disabled = false; }
    });
}

// Delete form buttons
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
if (cancelDeleteBtn){
    cancelDeleteBtn.addEventListener('click', ()=>{
        // hide delete form, show actions
        const delForm = document.getElementById('adminDeleteForm');
        const adminActionsEl = document.getElementById('adminActions');
        if (delForm) delForm.style.display = 'none';
        if (adminActionsEl) adminActionsEl.style.display = 'grid';
        const status = document.getElementById('deleteStatus'); if (status) status.textContent = '';
    });
}

if (confirmDeleteBtn){
    confirmDeleteBtn.addEventListener('click', async ()=>{
        const status = document.getElementById('deleteStatus');
        const delInput = document.getElementById('deleteExternalId');
        if (!delInput) return;
        const val = parseInt(delInput.value, 10);
        if (Number.isNaN(val)){ if (status) status.textContent = 'Please enter a valid External ID.'; return; }
        if (status) status.textContent = 'Deleting...';
        confirmDeleteBtn.disabled = true;
        try{
            const res = await authFetch(`${API_BASE}/assets/${val}`, { method: 'DELETE' });
            const json = await res.json().catch(()=>null);
            if (!res.ok || !json || !json.success){ throw new Error((json && json.error) ? json.error : (res.statusText || 'Delete failed')); }
            if (status) status.textContent = 'Deleted successfully.';
            // refresh assets and tags
            await fetchTags(); await fetchAssets({ search: searchInput ? searchInput.value.trim() : '', tags: Array.from(activeTags), offset:0, limit:80, append:false, sort:getIdSort(), category: activeCategory }); loadCategoriesIntoSelect();
            // hide form after short delay
            setTimeout(()=>{
                const delForm = document.getElementById('adminDeleteForm');
                const adminActionsEl = document.getElementById('adminActions');
                if (delForm) delForm.style.display = 'none';
                if (adminActionsEl) adminActionsEl.style.display = 'grid';
                if (status) status.textContent = '';
            }, 900);
        }catch(err){ console.error('Delete failed', err); if (status) status.textContent = 'Delete failed: ' + (err.message || 'Unknown'); }
        finally{ confirmDeleteBtn.disabled = false; }
    });
}

const uploadBtn = document.getElementById('uploadBtn');
if (uploadBtn){
    // Auto-fill asset name when a file is chosen or dropped onto the file input
    const uploadFileInput = document.getElementById('uploadFileInput');
    const uploadAssetNameEl = document.getElementById('uploadAssetName');
    if (uploadFileInput){
        uploadFileInput.addEventListener('change', ()=>{
            const f = uploadFileInput.files && uploadFileInput.files[0];
            if (f && uploadAssetNameEl && !uploadAssetNameEl.value){
                const name = String(f.name).replace(/\.[^/.]+$/, '');
                uploadAssetNameEl.value = name;
            }
        });
        // Drag-and-drop support: try to accept dropped file and set the input.files where possible
        uploadFileInput.addEventListener('dragover', (e)=>{ e.preventDefault(); uploadFileInput.classList.add('dragover'); });
        uploadFileInput.addEventListener('dragleave', ()=>{ uploadFileInput.classList.remove('dragover'); });
        uploadFileInput.addEventListener('drop', (e)=>{
            e.preventDefault();
            uploadFileInput.classList.remove('dragover');
            const files = e.dataTransfer && e.dataTransfer.files;
            if (files && files.length){
                const f = files[0];
                // If browser allows, set input.files so the rest of the flow uses the dropped file
                try{
                    const dt = new DataTransfer();
                    dt.items.add(f);
                    uploadFileInput.files = dt.files;
                }catch(err){ /* ignore if not allowed */ }
                if (uploadAssetNameEl && !uploadAssetNameEl.value){
                    const name = String(f.name).replace(/\.[^/.]+$/, '');
                    uploadAssetNameEl.value = name;
                }
            }
        });
    }
    // support click activation and Enter/Space key activation
    const doUpload = async (e)=>{
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        const status = document.getElementById('uploadStatus');
        const thumbInput = document.getElementById('uploadThumbnail');
        const fileInput = document.getElementById('uploadFileInput');
        const nameEl = document.getElementById('uploadAssetName');
        const catEl = document.getElementById('uploadCategory');
        const tagsEl = document.getElementById('uploadTags');
        const isAnimatedCheckbox = document.getElementById('uploadIsAnimated');
    if (!fileInput || !fileInput.files.length || !thumbInput || !thumbInput.files.length){ status.textContent = 'Please choose a thumbnail and an asset file.'; return; }
        const file = fileInput.files[0];
        const thumb = thumbInput.files[0];
        let maxBytes = 50 * 1024 * 1024 * 1024;
        try{
            const config = await (await fetch(`${API_BASE}/config`)).json();
            if (Number.isSafeInteger(config.maxFileBytes)) maxBytes = config.maxFileBytes;
        }catch(_){ }
        if (file.size > maxBytes){ status.textContent = `File is too large (max ${Math.floor(maxBytes / 1024 ** 3)} GiB).`; return; }
        if (!(/\.png$|\.jpg$|\.jpeg$|\.gif$|\.webm$/.test((thumb.name||'').toLowerCase()))){ status.textContent = 'Thumbnail must be PNG, JPG, GIF, or WebM.'; return; }
        const assetName = nameEl.value.trim() || file.name.replace(/\.[^/.]+$/, '');
        // Determine category early so uniqueness is evaluated against the folder that would be created
        const category = catEl.value || 'Uncategorized';
        // Check name uniqueness before attempting upload.
        try{
            const unique = await isAssetNameUnique(assetName, category);
            if (!unique){
                status.classList.add('error-text');
                status.textContent = 'Upload failed: Asset name already exists in this category. Please choose a unique name or different category.';
                uploadBtn.disabled = false;
                return;
            } else {
                status.classList.remove('error-text');
            }
        }catch(e){ /* continue on check failure */ }
        const tags = tagsEl.value.split(',').map(t=>t.trim()).filter(Boolean);

    // determine if the uploaded asset file is a video by extension
    const videoExts = new Set(['.mp4','.mov','.avi','.wmv','.mkv','.flv','.webm','.mpeg','.mpg','.m4v']);
    const fileExt = (file.name && file.name.lastIndexOf('.') >= 0) ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
    const isVideoFlag = videoExts.has(fileExt) ? '1' : '0';
    const isAnimatedFlag = (isAnimatedCheckbox && isAnimatedCheckbox.checked) ? '1' : '0';

        status.textContent = 'Uploading file...';
        uploadBtn.disabled = true;
        try{
            const fd = new FormData();
            // Allow WebM, GIF, PNG, JPG thumbnails
            if (!(/\.png$|\.jpg$|\.jpeg$|\.gif$|\.webm$/.test((thumb.name||'').toLowerCase()))){ status.textContent = 'Thumbnail must be PNG, JPG, GIF, or WebM.'; return; }

            // If thumbnail is animated (GIF or WebM) and asset is video OR isAnimated, create a static poster PNG
            const thumbLower = (thumb.name||'').toLowerCase();
            const isWebM = thumbLower.endsWith('.webm');
            const isGif = thumbLower.endsWith('.gif');
            if ((isWebM || isGif) && (isVideoFlag === '1' || isAnimatedFlag === '1')){
                try{
                    let posterBlob;
                    if (isWebM){
                        // Extract first frame from WebM video
                        posterBlob = await new Promise((resolve, reject)=>{
                            const video = document.createElement('video');
                            video.preload = 'metadata';
                            video.onloadedmetadata = ()=>{
                                video.currentTime = 0;
                            };
                            video.onseeked = ()=>{
                                try{
                                    const canvas = document.createElement('canvas');
                                    canvas.width = video.videoWidth;
                                    canvas.height = video.videoHeight;
                                    const ctx = canvas.getContext('2d');
                                    ctx.drawImage(video, 0, 0);
                                    canvas.toBlob((b)=>{ if (b) resolve(b); else reject(new Error('Canvas toBlob returned null')); }, 'image/png');
                                    URL.revokeObjectURL(video.src);
                                }catch(err){ reject(err); }
                            };
                            video.onerror = ()=>{ URL.revokeObjectURL(video.src); reject(new Error('Failed loading WebM for poster generation')); };
                            video.src = URL.createObjectURL(thumb);
                        });
                    } else {
                        // Extract first frame from GIF
                        posterBlob = await new Promise((resolve, reject)=>{
                            const reader = new FileReader();
                            reader.onload = ()=>{
                                const img = new Image();
                                img.onload = ()=>{
                                    try{
                                        const canvas = document.createElement('canvas');
                                        canvas.width = img.naturalWidth || img.width;
                                        canvas.height = img.naturalHeight || img.height;
                                        const ctx = canvas.getContext('2d');
                                        ctx.drawImage(img, 0, 0);
                                        canvas.toBlob((b)=>{ if (b) resolve(b); else reject(new Error('Canvas toBlob returned null')); }, 'image/png');
                                    }catch(err){ reject(err); }
                                };
                                img.onerror = ()=> reject(new Error('Failed loading GIF for poster generation'));
                                img.src = reader.result;
                            };
                            reader.onerror = ()=> reject(new Error('FileReader failed'));
                            reader.readAsDataURL(thumb);
                        });
                    }
                    const ext = isWebM ? '.webm' : '.gif';
                    const posterName = (thumb.name || 'poster').replace(new RegExp(ext + '$', 'i'), '') + '_poster.png';
                    fd.append('thumbnailPoster', posterBlob, posterName);
                }catch(err){ console.warn('Could not generate poster from thumbnail:', err); }
            }

            fd.append('thumbnail', thumb, thumb.name);
            fd.append('assetFile', file, file.name);
            fd.append('assetName', assetName);
            fd.append('category', category);
            fd.append('isVideo', isVideoFlag);
            fd.append('isAnimated', isAnimatedFlag);
            fd.append('tags', tags.join(','));
            // send to backend and wait for DB create confirmation
            let upJson = null;
            if (file.size > 128 * 1024 * 1024){
                upJson = await uploadInChunks(fd, status);
            } else {
                const up = await authFetch(`${API_BASE}/upload`, { method: 'POST', body: fd });
                try{ upJson = await up.json(); }catch(e){ /* ignore json parse */ }
                if (!up.ok){ const errMsg = (upJson && upJson.error) ? upJson.error : up.statusText || 'Upload failed'; throw new Error(errMsg); }
            }
            if (!upJson || !upJson.success){ throw new Error(upJson && upJson.error ? upJson.error : 'Upload failed'); }
            status.textContent = 'Upload complete.';
            // reload assets and categories (no page refresh)
            await fetchTags(); await fetchAssets({ search: searchInput ? searchInput.value.trim() : '', tags: Array.from(activeTags), offset:0, limit:80, append:false, sort:getIdSort(), category: activeCategory }); loadCategoriesIntoSelect();
            // Clear upload form fields so the modal resets to defaults
            try{
                const adminFormEl = document.getElementById('adminUploadForm');
                const adminActionsEl = document.getElementById('adminActions');
                const thumb = document.getElementById('uploadThumbnail'); if (thumb) thumb.value = '';
                const file = document.getElementById('uploadFileInput'); if (file) file.value = '';
                const nameFld = document.getElementById('uploadAssetName'); if (nameFld) nameFld.value = '';
                const tagsFld = document.getElementById('uploadTags'); if (tagsFld) tagsFld.value = '';
                const catEl = document.getElementById('uploadCategory'); if (catEl) catEl.selectedIndex = 0;
                const animChk = document.getElementById('uploadIsAnimated'); if (animChk) animChk.checked = false;
                // hide upload form after short delay (mirror delete behavior)
                setTimeout(()=>{
                    if (adminFormEl) adminFormEl.style.display = 'none';
                    if (adminActionsEl) adminActionsEl.style.display = 'grid';
                    const statusEl = document.getElementById('uploadStatus'); if (statusEl) statusEl.textContent = '';
                }, 450);
            }catch(e){ console.warn('Failed to clear upload form fields', e); }
        }catch(err){ console.error(err); status.textContent = 'Upload failed: ' + (err.message || 'Unknown error'); }
        finally{ uploadBtn.disabled = false; }
    };
    uploadBtn.addEventListener('click', doUpload);
    uploadBtn.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' || e.key === ' ') { doUpload(e); } });
}
// Fullscreen image viewer logic
const imageViewer = document.getElementById('imageViewer');
const imageViewerImg = document.getElementById('imageViewerImg');
let _prevBodyOverflow_img = '';
let _prevBodyPaddingRight_img = '';

function openImageViewer(src, alt, asset){
  if (!imageViewer) return;
  
  // Clear previous content
  imageViewer.querySelectorAll('.image-viewer-img, .image-viewer-video').forEach(el => el.remove());
  
  // Check if this is a video or animated asset (isVideo=1 OR isAnimated=1)
  const hasAnimatedContent = asset && (Number(asset.isVideo) === 1 || Number(asset.isAnimated) === 1);
  
  if (hasAnimatedContent && asset.thumbnailPath) {
    // Render as video element for all animated/video content
    const video = document.createElement('video');
    video.className = 'image-viewer-video';
    if (asset.thumbnailPosterPath) video.poster = asset.thumbnailPosterPath;
    video.src = asset.thumbnailPath;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.controls = true;
    video.preload = 'auto';
    video.style.maxWidth = '92vw';
    video.style.maxHeight = '92vh';
    video.style.boxShadow = '0 30px 80px rgba(2,12,24,0.85), 0 12px 40px rgba(var(--accent-rgb),0.12)';
    video.style.borderRadius = '10px';
    video.style.cursor = 'zoom-out';
    
    imageViewer.querySelector('.image-viewer-content')?.appendChild(video) || imageViewer.appendChild(video);
    
    // Play video after it's added to DOM and ready
    video.addEventListener('loadedmetadata', () => {
      video.play().catch(err => console.warn('Fullscreen video autoplay failed:', err));
    });
    
    // Fallback: try to play immediately in case loadedmetadata fires before listener is attached
    video.play().catch(err => console.warn('Fullscreen video autoplay failed:', err));
    
    // Handle close on click
    video._pendingClose = false;
    video.addEventListener('pointerdown', (e)=>{ if (typeof e.button === 'number' && e.button !== 0) return; video._pendingClose = true; });
    video.addEventListener('pointerup', (e)=>{ if (video._pendingClose) closeImageViewer(); video._pendingClose = false; });
    video.addEventListener('pointercancel', ()=>{ video._pendingClose = false; });
  } else {
    // Render as image element
    const imageViewerImg = document.createElement('img');
    imageViewerImg.id = 'imageViewerImg';
    imageViewerImg.className = 'image-viewer-img';
    imageViewerImg.src = src;
    imageViewerImg.alt = alt || 'Preview';
    
    imageViewer.querySelector('.image-viewer-content')?.appendChild(imageViewerImg) || imageViewer.appendChild(imageViewerImg);
    
    // Handle close on click
    imageViewerImg._pendingClose = false;
    imageViewerImg.addEventListener('pointerdown', (e)=>{ if (typeof e.button === 'number' && e.button !== 0) return; imageViewerImg._pendingClose = true; });
    imageViewerImg.addEventListener('pointerup', (e)=>{ if (imageViewerImg._pendingClose) closeImageViewer(); imageViewerImg._pendingClose = false; });
    imageViewerImg.addEventListener('pointercancel', ()=>{ imageViewerImg._pendingClose = false; });
  }
  
  _prevBodyOverflow_img = document.body.style.overflow || '';
  _prevBodyPaddingRight_img = document.body.style.paddingRight || '';
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
  imageViewer.classList.remove('hidden');
  imageViewer.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
}

function closeImageViewer(){
  if (!imageViewer) return;
  imageViewer.classList.add('hidden');
  imageViewer.setAttribute('aria-hidden','true');
  // Clear all media content (both img and video)
  imageViewer.querySelectorAll('.image-viewer-img, .image-viewer-video').forEach(el => el.remove());
  document.body.style.overflow = _prevBodyOverflow_img;
}

// Close when clicking outside (on the overlay) and on Escape
attachOverlayClickRequiresFullClick(imageViewer, closeImageViewer);
document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeImageViewer(); });

  // Refresh button: reload assets and tags
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn){
    refreshBtn.addEventListener('click', async (e)=>{
      e.preventDefault();
      if (isLoading) return;
      refreshBtn.disabled = true;
      const prevHtml = refreshBtn.innerHTML;
      try{
        // reset paging and reload
        hasMore = true;
    await fetchTags();
    await fetchAssets({ search: searchInput.value.trim(), tags: Array.from(activeTags), offset: 0, limit: 80, append: false, sort: getIdSort(), category: activeCategory });
      }catch(err){
        console.warn('Refresh failed', err);
      }finally{
        refreshBtn.innerHTML = prevHtml;
        refreshBtn.disabled = false;
      }
    });
  }

// Accent color picker wiring
// Convert hex like #1ae9d8 or 1ae9d8 to "r,g,b" string
function hexToRgb(hex){
  if (!hex) return null;
  const h = hex.replace('#','').trim();
  if (h.length === 3){
    const r = parseInt(h[0]+h[0],16);
    const g = parseInt(h[1]+h[1],16);
    const b = parseInt(h[2]+h[2],16);
    return `${r},${g},${b}`;
  }
  if (h.length === 6){
    const r = parseInt(h.slice(0,2),16);
    const g = parseInt(h.slice(2,4),16);
    const b = parseInt(h.slice(4,6),16);
    return `${r},${g},${b}`;
  }
  return null;
}

function applyAccent(accent, strong){
  if (!accent || !strong) return;
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-strong', strong);
  // also set RGB forms used by shadows: --accent-rgb and --accent-strong-rgb
  const aRgb = hexToRgb(accent);
  const sRgb = hexToRgb(strong);
  if (aRgb) document.documentElement.style.setProperty('--accent-rgb', aRgb);
  if (sRgb) document.documentElement.style.setProperty('--accent-strong-rgb', sRgb);
}

function loadSavedAccent(){
  try{
    const raw = localStorage.getItem('moses:accent');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.accent && parsed.strong){
      applyAccent(parsed.accent, parsed.strong);
      return true;
    }
  }catch(e){/* ignore */}
  return false;
}

function initAccentPicker(){
  const swatches = document.querySelectorAll('.color-swatch');
  const resetBtn = document.getElementById('resetAccentBtn');
  const defaultVars = { accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), strong: getComputedStyle(document.documentElement).getPropertyValue('--accent-strong').trim() };

  swatches.forEach(s => {
    s.addEventListener('click', ()=>{
      const accent = s.dataset.accent;
      const strong = s.dataset.strong;
      applyAccent(accent, strong);
      swatches.forEach(x=>x.classList.remove('active'));
      s.classList.add('active');
            try{ localStorage.setItem('moses:accent', JSON.stringify({accent, strong})); }catch(e){}
            // Persist accent to server for authenticated users
            try{ saveUserSettings({ ThemeColor: accent }); }catch(e){}
    });
  });

        // Color wheel button logic (create a temporary color input on each click)
        const colorWheelBtn = document.getElementById('colorWheelBtn');
        if (colorWheelBtn) {
            colorWheelBtn.addEventListener('click', (e) => {
                // Create a fresh, temporary color input so the native picker reliably opens every time
                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                // keep visually out of flow but still clickable by programmatic click
                colorInput.style.position = 'fixed';
                colorInput.style.left = '-9999px';
                colorInput.style.width = '1px';
                colorInput.style.height = '1px';
                colorInput.id = 'customAccentInput';
                document.body.appendChild(colorInput);

                // use current accent as starting value if available
                try{
                    const cur = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
                    if (cur) colorInput.value = cur;
                }catch(e){ colorInput.value = '#19c9bd'; }

                const cleanup = () => { try{ colorInput.remove(); }catch(e){} };

                // Live preview while user manipulates the native color picker
                const onInput = () => {
                    const accent = colorInput.value;
                    // apply live preview but don't persist yet
                    applyAccent(accent, accent);
                };

                // When user finalizes selection (change), persist and cleanup
                    colorInput.addEventListener('change', () => {
                    const accent = colorInput.value;
                    // ensure final value is applied
                    applyAccent(accent, accent);
                    swatches.forEach(x=>x.classList.remove('active'));
                    colorWheelBtn.classList.add('active');
                    try{ localStorage.setItem('moses:accent', JSON.stringify({accent, strong: accent})); }catch(e){}
                    // Persist accent to server for authenticated users
                    try{ saveUserSettings({ ThemeColor: accent }); }catch(e){}
                    // remove temporary input after a short delay to allow browser to finish picker lifecycle
                    setTimeout(cleanup, 50);
                }, { once: true });

                // apply preview during interaction
                colorInput.addEventListener('input', onInput);

                // If the picker is dismissed/cancelled, remove the temporary input after blur
                colorInput.addEventListener('blur', () => { setTimeout(cleanup, 150); }, { once: true });

                // Trigger the native color picker (must be in user gesture handler)
                colorInput.click();
            });
        }

  resetBtn && resetBtn.addEventListener('click', ()=>{
    applyAccent(defaultVars.accent, defaultVars.strong);
    swatches.forEach(x=>x.classList.remove('active'));
    try{ localStorage.removeItem('moses:accent'); }catch(e){}
        // Persist removal (empty string) to server for authenticated users
        try{ saveUserSettings({ ThemeColor: '' }); }catch(e){}
  });

  // If previously saved accent exists, apply and mark active
  if (loadSavedAccent()){
    const saved = JSON.parse(localStorage.getItem('moses:accent'));
    if (saved){
      swatches.forEach(s=>{ if (s.dataset.accent === saved.accent && s.dataset.strong === saved.strong) s.classList.add('active'); });
    }
  }
    // RGB hue-rotation state and controls
    const rgbToggle = document.getElementById('accentRgbToggle');
    // internal rotation state
    let _rgbAnimId = null;
    let _rgbStart = null;
    // period (seconds) and derived speed (degrees per ms)
    let _rgbPeriodSec = 10; // default 10s per full rotation
    let _rgbSpeed = 360 / (_rgbPeriodSec * 1000); // degrees per ms

    function hslToHex(h, s, l){
        s /= 100; l /= 100;
        const k = n => (n + h/30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }

    function startRgbRotation(){
        if (_rgbAnimId) return;
        // store current accent so we can restore it later
        try{
            const cur = JSON.parse(localStorage.getItem('moses:accent'));
            if (cur) localStorage.setItem('moses:accent_before_rgb', JSON.stringify(cur));
        }catch(e){}
        _rgbStart = performance.now();
        let last = _rgbStart;
        function step(now){
            const dt = now - last; last = now;
            const elapsed = now - _rgbStart;
            const hue = (elapsed * _rgbSpeed) % 360;
            const accent = hslToHex(hue, 70, 52);
            const strong = hslToHex(hue, 80, 44);
            applyAccent(accent, strong);
            _rgbAnimId = requestAnimationFrame(step);
        }
        _rgbAnimId = requestAnimationFrame(step);
        // persist flag
        try{ localStorage.setItem('moses:accent_rgb', '1'); }catch(e){}
    }

    function stopRgbRotation(){
        if (_rgbAnimId){ cancelAnimationFrame(_rgbAnimId); _rgbAnimId = null; }
        // restore previous accent if available
        try{
            const prev = JSON.parse(localStorage.getItem('moses:accent_before_rgb'));
            if (prev && prev.accent && prev.strong){ applyAccent(prev.accent, prev.strong); try{ localStorage.setItem('moses:accent', JSON.stringify(prev)); }catch(e){} }
        }catch(e){}
        try{ localStorage.setItem('moses:accent_rgb', '0'); }catch(e){}
    }

                // Wire the toggle if present
                if (rgbToggle){
                    // initialize from stored state
                    try{
                        const stored = localStorage.getItem('moses:accent_rgb');
                        if (stored === '1'){
                            // user previously enabled RGB
                            rgbToggle.checked = true;
                            rgbToggle.disabled = false;
                            startRgbRotation();
                        } else if (stored === '0'){
                            // user previously disabled RGB
                            rgbToggle.checked = false;
                            rgbToggle.disabled = false;
                            stopRgbRotation();
                        } else {
                            // No saved preference: default to OFF and keep control disabled
                            rgbToggle.checked = false;
                            rgbToggle.disabled = true;
                            stopRgbRotation();
                        }
                    }catch(e){}
                    rgbToggle.addEventListener('change', (ev)=>{
                        if (ev.target.checked) startRgbRotation(); else stopRgbRotation();
                        // ensure speed slider enabled/disabled follows toggle state
                        try{ const s = document.getElementById('accentRgbSpeed'); if (s) s.disabled = !ev.target.checked; }catch(_){ }
                        // Persist per-user preference if authenticated
                        try{ saveUserSettings({ RGB: ev.target.checked ? 1 : 0 }); }catch(e){}
                    });
                }

        // Speed slider wiring (seconds per rotation)
        const speedSlider = document.getElementById('accentRgbSpeed');
        const speedLabel = document.getElementById('accentRgbSpeedLabel');
        if (speedSlider && speedLabel){
                // load saved period if present. We invert slider mapping so higher slider value = faster cycle.
                const MIN_RGB = 2;
                const MAX_RGB = 60;
                try{
                    const saved = parseInt(localStorage.getItem('moses:accent_rgb_speed'), 10);
                    if (!isNaN(saved) && saved >= MIN_RGB && saved <= MAX_RGB){
                        // saved value was previously stored as period (seconds); keep it as period
                        _rgbPeriodSec = saved;
                        // compute slider value so that higher slider -> faster (smaller period)
                        const sliderVal = (MAX_RGB + MIN_RGB) - _rgbPeriodSec;
                        speedSlider.value = String(sliderVal);
                    }
                }catch(e){}
                // Set slider value to the inverse of the current period so higher slider -> faster
                speedSlider.value = String((MAX_RGB + MIN_RGB) - _rgbPeriodSec);
                // label is now a static label 'RGB Speed' (do not show seconds)
                speedLabel.textContent = 'RGB Speed';
            // Disable speed slider unless RGB toggle exists and is currently checked
            try{ speedSlider.disabled = !(rgbToggle && rgbToggle.checked); }catch(e){}
            // update derived speed
            _rgbSpeed = 360 / (_rgbPeriodSec * 1000);

            function updatePeriodFromSlider(val){
                const slider = Math.max(MIN_RGB, Math.min(MAX_RGB, parseInt(val,10) || 10));
                // inverted mapping: higher slider -> faster => smaller period
                const sec = (MAX_RGB + MIN_RGB) - slider;
                _rgbPeriodSec = sec;
                _rgbSpeed = 360 / (_rgbPeriodSec * 1000);
                try{ localStorage.setItem('moses:accent_rgb_speed', String(_rgbPeriodSec)); }catch(e){}
            }

            speedSlider.addEventListener('input', (ev)=>{ updatePeriodFromSlider(ev.target.value); });
            speedSlider.addEventListener('change', (ev)=>{ updatePeriodFromSlider(ev.target.value); });
        }
}

// initialize accent picker when DOM is ready
document.addEventListener('DOMContentLoaded', ()=>{
  initAccentPicker();
});

let Chsoi = false; // Boolean to control sound, default is false

// Listen for CTRL+SHIFT+O
window.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'x') {
        Chsoi = !Chsoi;
    }
});

function playChosiSound() {
    if (Chsoi) {
        const audio = new Audio('media/ChosiChosiChosi.mp3');
        audio.play();
    } else {
    }
}
// Call playChosiSound() where you want to play the sound

// Back-to-top button behavior: show when scrolled down, hide at top, smooth scroll to top on click
(() =>{
    const btn = document.getElementById('backToTop');
    if (!btn) return;
    const showAt = 240; // pixels scrolled before showing button
    let ticking = false;
    const origTitle = btn.getAttribute('title') || '';
    // make button unfocusable by default
    btn.tabIndex = -1;
    function onScroll(){
        if (ticking) return; ticking = true;
        window.requestAnimationFrame(()=>{
            const y = window.scrollY || window.pageYOffset;
            if (y > showAt) {
                btn.classList.add('visible');
                btn.tabIndex = 0;
                btn.setAttribute('title', origTitle);
            } else {
                btn.classList.remove('visible');
                btn.tabIndex = -1;
                // remove title to avoid hover tooltip when hidden
                btn.setAttribute('title', '');
            }
            ticking = false;
        });
    }
    window.addEventListener('scroll', onScroll, {passive:true});
    // initial state
    onScroll();
    btn.addEventListener('click', ()=>{
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
})();


