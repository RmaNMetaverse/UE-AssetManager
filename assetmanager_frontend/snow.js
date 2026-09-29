// snow.js — falling snow with temporary accumulation on the footer
(function(){
  const FLAKE_COUNT = 80; // initial concurrent flakes
  const WIND = 0.5; // base horizontal drift multiplier
  const GRAVITY = 0.6; // fall speed multiplier
  const FOOTER_COLUMNS = 60; // columns across footer to accumulate into
  const DECAY_MS = 7000; // how long until accumulation begins to decay

  let snowLayer = document.getElementById('snowLayer');
  const footer = document.getElementById('siteFooter');
  const accumEl = document.getElementById('snowAccum');

  function createLayer(){
    const el = document.createElement('div'); el.id = 'snowLayer'; document.body.appendChild(el); return el;
  }

  // state
  let columns = new Array(FOOTER_COLUMNS).fill(0);
  let flakes = [];
  let rafId = null;
  let decayInterval = null;
  let accelInterval = null;
  let resizeHandler = null;
  let running = false;

  function randRange(a,b){return a + Math.random()*(b-a)}
  function debounce(fn, t){let id; return (...args)=>{clearTimeout(id); id=setTimeout(()=>fn(...args), t)}}

  function ensureElements(){
    if (!snowLayer) snowLayer = createLayer();
    if (!footer || !accumEl || !snowLayer) return false;
    return true;
  }

  function refreshColumns(){
    if (!ensureElements()) return;
    const rect = footer.getBoundingClientRect();
    const colW = Math.max(2, Math.floor(rect.width / FOOTER_COLUMNS));
    accumEl.style.height = '0px';
    accumEl.innerHTML = '';
    for (let i=0;i<FOOTER_COLUMNS;i++){
      const c = document.createElement('div');
      c.className = 'snow-column';
      c.style.width = colW + 'px';
      c.style.left = (i*colW) + 'px';
      c.style.height = '0px';
      accumEl.appendChild(c);
    }
  }

  function renderColumns(){
    if (!accumEl) return;
    const nodes = accumEl.children;
    for (let i=0;i<nodes.length;i++){
      const n = nodes[i]; const h = Math.round(columns[i]||0);
      n.style.height = h + 'px';
      n.classList.add('fade');
      n.style.opacity = h>0 ? '0.95' : '0';
    }
  }

  function createFlake(){
    const el = document.createElement('div');
    el.className = 'snowflake';
    const size = randRange(4, 12);
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el._x = Math.random() * window.innerWidth;
    el._y = - (Math.random() * window.innerHeight * 0.6);
    el._vx = randRange(-0.6, 0.6) * WIND;
    el._vy = randRange(0.6, 1.6) * GRAVITY;
    el._sway = Math.random() * 2 + 0.5;
    el._size = size;
    el.style.transform = `translate(${el._x}px, ${el._y}px)`;
    snowLayer.appendChild(el);
    return el;
  }

  function resetFlake(f){
    const size = randRange(4, 12);
    f.style.width = size + 'px'; f.style.height = size + 'px'; f._size = size;
    f._x = Math.random() * window.innerWidth;
    f._y = -10 - Math.random()*80;
    f._vx = randRange(-0.6, 0.6) * WIND;
    f._vy = randRange(0.6, 1.6) * GRAVITY;
    f._sway = Math.random() * 2 + 0.5;
  }

  function step(){
    if (!footer) return;
    const footerRect = footer.getBoundingClientRect();
    for (let i=0;i<flakes.length;i++){
      const f = flakes[i];
      f._x += f._vx + Math.sin((Date.now()+i*37)/1000) * (f._sway*0.2);
      f._y += f._vy;
      f.style.transform = `translate(${f._x}px, ${f._y}px) rotate(${(f._x%360)}deg)`;
      if (f._y > window.innerHeight + 50 || f._x < -50 || f._x > window.innerWidth + 50){
        resetFlake(f);
        continue;
      }
      if (f._y + f._size >= footerRect.top){
        const relX = Math.max(0, Math.min(window.innerWidth-1, f._x));
        const colIndex = Math.floor(relX / (window.innerWidth / FOOTER_COLUMNS));
        if (colIndex >=0 && colIndex < columns.length){
          columns[colIndex] = Math.min(40, (columns[colIndex]||0) + Math.max(1, Math.round(f._size/2)));
          renderColumns();
          lastLanding = Date.now();
        }
        resetFlake(f);
      }
    }
    rafId = requestAnimationFrame(step);
  }

  // decay and landing tracking
  let lastLanding = Date.now();
  function startDecayLoops(){
    decayInterval = setInterval(()=>{
      let changed=false;
      columns = columns.map(h => {
        const nh = Math.max(0, h - 1);
        if (nh !== h) changed=true;
        return nh;
      });
      if (changed) renderColumns();
    }, 180);

    accelInterval = setInterval(()=>{
      if (Date.now() - lastLanding > DECAY_MS){
        columns = columns.map(h => Math.max(0, h - 2));
        renderColumns();
      }
    }, 1000);
  }

  function stopDecayLoops(){
    clearInterval(decayInterval); decayInterval = null;
    clearInterval(accelInterval); accelInterval = null;
  }

  function startSnow(){
    if (running) return; if (!ensureElements()) return;
    running = true;
    refreshColumns();
    // create flakes
    flakes = [];
    for (let i=0;i<FLAKE_COUNT;i++) flakes.push(createFlake());
    // start loops
    startDecayLoops();
    resizeHandler = debounce(refreshColumns, 300);
    window.addEventListener('resize', resizeHandler);
    rafId = requestAnimationFrame(step);
  }

  function stopSnow(){
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId); rafId = null;
    stopDecayLoops();
    window.removeEventListener('resize', resizeHandler);
    // remove flakes
    for (let f of flakes) if (f && f.parentNode) f.parentNode.removeChild(f);
    flakes = [];
    // clear accumulation
    columns = new Array(FOOTER_COLUMNS).fill(0);
    if (accumEl) accumEl.innerHTML = '';
  }

  // persistence and UI binding
  function getStored(){
    try { const v = localStorage.getItem('snowEnabled'); return v === null ? false : v === '1'; } catch(e){ return false; }
  }
  function setStored(val){ try { localStorage.setItem('snowEnabled', val ? '1' : '0'); } catch(e){} }

  // expose API
  window.SnowEffect = {
    isEnabled: () => getStored(),
    setEnabled: (enabled) => {
      setStored(enabled);
      if (enabled) startSnow(); else stopSnow();
      // keep checkbox in sync if present
      const cb = document.getElementById('snowToggle'); if (cb) cb.checked = !!enabled;
    },
    toggle: () => { const e = !getStored(); window.SnowEffect.setEnabled(e); return e; }
  };

  // wire checkbox if present
  function bindUI(){
    const cb = document.getElementById('snowToggle');
    if (!cb) return;
    cb.checked = getStored();
    cb.addEventListener('change', ()=>{
      window.SnowEffect.setEnabled(cb.checked);
    });
  }

  // initialize based on stored preference (start only if enabled)
  const initial = getStored();
  bindUI();
  if (initial) startSnow();

})();
