/*
  image-editor.js — shared photo editor for every image upload in the app.

  Flow: user picks a photo from the gallery -> this editor opens -> they drag to move,
  pinch / slider / +/- buttons to zoom -> "Done" returns the cropped image as a Blob.

  Usage:
    const blob = await openImageEditor(file, IMAGE_PRESETS.avatar);
    if(!blob) return;                       // user cancelled
    const url = await uploadImageBlob(blob, 'avatars');   // -> public URL in the Media bucket
*/
(function(){
  const PRESETS = {
    // Round profile picture
    avatar: { shape: 'circle',  aspect: 1,      outWidth: 512,  title: 'Profile picture' },
    // Room picture (rounded square)
    room:   { shape: 'rounded', aspect: 1,      outWidth: 512,  title: 'Room picture' },
    // Full-screen phone background (app theme, room theme, default room theme)
    theme:  { shape: 'rect',    aspect: 9 / 19, outWidth: 1080, title: 'Background' }
  };
  window.IMAGE_PRESETS = PRESETS;

  const CSS = `
  .ie-overlay{ position:fixed; inset:0; z-index:9999; display:flex; flex-direction:column;
    background:#0c1a16; color:#fff; font-family:'Inter',system-ui,sans-serif; touch-action:none; }
  .ie-title{ padding:16px 18px 6px; font-weight:600; font-size:1rem; text-align:center; }
  .ie-stage{ position:relative; flex:1; min-height:0; overflow:hidden; touch-action:none; cursor:grab; }
  .ie-stage:active{ cursor:grabbing; }
  .ie-canvas{ position:absolute; left:50%; top:50%; max-width:none; transform-origin:50% 50%;
    pointer-events:none; -webkit-user-select:none; user-select:none; will-change:transform; }
  .ie-frame{ position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    border:2px solid rgba(255,255,255,0.92); box-shadow:0 0 0 100vmax rgba(6,16,13,0.68);
    pointer-events:none; box-sizing:border-box; }
  .ie-frame.circle{ border-radius:50%; }
  .ie-frame.rounded{ border-radius:20%; }
  .ie-frame.rect{ border-radius:8px; }
  .ie-controls{ padding:10px 18px calc(16px + env(safe-area-inset-bottom,0px)); display:flex; flex-direction:column; gap:12px; }
  .ie-hint{ font-size:0.78rem; color:rgba(255,255,255,0.7); text-align:center; }
  .ie-zoom-row{ display:flex; align-items:center; gap:12px; }
  .ie-zbtn{ width:40px; height:40px; border-radius:50%; border:1.5px solid rgba(255,255,255,0.35);
    background:transparent; color:#fff; font-size:1.3rem; line-height:1; cursor:pointer; flex-shrink:0; }
  .ie-zbtn:active{ background:rgba(255,255,255,0.15); }
  .ie-range{ flex:1; accent-color:var(--teal,#06D6A0); height:32px; }
  .ie-actions{ display:flex; gap:10px; }
  .ie-actions button{ flex:1; padding:13px; border-radius:12px; font-family:inherit; font-weight:600;
    font-size:0.92rem; cursor:pointer; border:none; }
  .ie-cancel{ background:rgba(255,255,255,0.12); color:#fff; }
  .ie-done{ background:var(--teal-deep,#05846a); color:#fff; }
  .ie-done:disabled{ opacity:0.6; }
  .ie-overlay button:focus-visible, .ie-range:focus-visible{ outline:2px solid #fff; outline-offset:2px; }
  `;

  function injectCss(){
    if(document.getElementById('ie-style')) return;
    const st = document.createElement('style');
    st.id = 'ie-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function loadImage(file){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }

  function toast(msg){
    if(typeof window.showToast === 'function') window.showToast(msg);
  }

  const MAX_WORK_SIDE = 2400; // big camera photos are scaled down once so dragging stays smooth

  window.openImageEditor = async function(file, options){
    if(!file) return null;
    const opts = Object.assign({ shape:'circle', aspect:1, outWidth:512, title:'Adjust photo', quality:0.9 }, options || {});
    injectCss();

    let img;
    try{ img = await loadImage(file); }
    catch(err){ toast('Could not open that image. Try a different photo.'); return null; }

    const ratio = Math.min(1, MAX_WORK_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const work = document.createElement('canvas');
    work.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    work.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    work.getContext('2d').drawImage(img, 0, 0, work.width, work.height);
    work.className = 'ie-canvas';
    work.style.width = work.width + 'px';
    work.style.height = work.height + 'px';

    const overlay = document.createElement('div');
    overlay.className = 'ie-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', opts.title);
    overlay.innerHTML = `
      <div class="ie-title"></div>
      <div class="ie-stage"><div class="ie-frame ${opts.shape}"></div></div>
      <div class="ie-controls">
        <div class="ie-hint">Drag to move. Pinch or use the slider to zoom.</div>
        <div class="ie-zoom-row">
          <button type="button" class="ie-zbtn" data-z="out" aria-label="Zoom out">&minus;</button>
          <input type="range" class="ie-range" min="0" max="100" step="0.5" value="0" aria-label="Zoom">
          <button type="button" class="ie-zbtn" data-z="in" aria-label="Zoom in">+</button>
        </div>
        <div class="ie-actions">
          <button type="button" class="ie-cancel">Cancel</button>
          <button type="button" class="ie-done">Done</button>
        </div>
      </div>`;
    overlay.querySelector('.ie-title').textContent = opts.title;
    const stage = overlay.querySelector('.ie-stage');
    const frame = overlay.querySelector('.ie-frame');
    const range = overlay.querySelector('.ie-range');
    stage.insertBefore(work, frame);

    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(overlay);

    // ---- state ----
    let fw = 0, fh = 0;      // frame size in CSS px
    let minS = 1, maxS = 6;  // allowed scale range (image px -> screen px)
    let s = 1;               // current scale
    let cx = 0, cy = 0;      // image centre, relative to frame centre (screen px)
    let laidOut = false;

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    function clampPos(){
      const maxX = Math.max(0, (work.width * s - fw) / 2);
      const maxY = Math.max(0, (work.height * s - fh) / 2);
      cx = clamp(cx, -maxX, maxX);
      cy = clamp(cy, -maxY, maxY);
    }
    function render(){
      work.style.transform = `translate(-50%,-50%) translate(${cx}px,${cy}px) scale(${s})`;
      range.value = String(100 * Math.log(s / minS) / Math.log(maxS / minS));
    }
    function setScale(next){
      next = clamp(next, minS, maxS);
      const k = next / s;
      cx *= k; cy *= k;   // keep whatever sits under the frame centre in place
      s = next;
      clampPos();
      render();
    }
    function layout(){
      const r = stage.getBoundingClientRect();
      const maxW = Math.max(120, r.width - 32);
      const maxH = Math.max(120, r.height - 32);
      fw = Math.min(maxW, maxH * opts.aspect);
      fh = fw / opts.aspect;
      frame.style.width = fw + 'px';
      frame.style.height = fh + 'px';
      minS = Math.max(fw / work.width, fh / work.height);
      maxS = minS * 6;
      if(!laidOut){ s = minS; cx = 0; cy = 0; laidOut = true; }
      s = clamp(s, minS, maxS);
      clampPos();
      render();
    }
    layout();
    window.addEventListener('resize', layout);

    // ---- gestures: one finger drags, two fingers pinch ----
    const pts = new Map();
    let lastDist = null;
    stage.addEventListener('pointerdown', e => {
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastDist = null;
    });
    stage.addEventListener('pointermove', e => {
      if(!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if(pts.size === 1){
        cx += e.clientX - prev.x;
        cy += e.clientY - prev.y;
        clampPos();
        render();
      } else if(pts.size === 2){
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if(lastDist) setScale(s * d / lastDist);
        lastDist = d;
      }
    });
    function releasePointer(e){ pts.delete(e.pointerId); lastDist = null; }
    stage.addEventListener('pointerup', releasePointer);
    stage.addEventListener('pointercancel', releasePointer);
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      setScale(s * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });

    range.addEventListener('input', () => {
      setScale(minS * Math.pow(maxS / minS, parseFloat(range.value) / 100));
    });
    overlay.querySelector('[data-z="in"]').addEventListener('click', () => setScale(s * 1.15));
    overlay.querySelector('[data-z="out"]').addEventListener('click', () => setScale(s / 1.15));

    // ---- finish ----
    return new Promise(resolve => {
      function close(result){
        window.removeEventListener('resize', layout);
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        document.documentElement.style.overflow = prevOverflow;
        resolve(result);
      }
      function onKey(e){
        if(e.key === 'Escape') close(null);
        else if(e.key === '+' || e.key === '=') setScale(s * 1.15);
        else if(e.key === '-') setScale(s / 1.15);
        else if(e.key === 'ArrowLeft'){ cx -= 12; clampPos(); render(); }
        else if(e.key === 'ArrowRight'){ cx += 12; clampPos(); render(); }
        else if(e.key === 'ArrowUp'){ cy -= 12; clampPos(); render(); }
        else if(e.key === 'ArrowDown'){ cy += 12; clampPos(); render(); }
      }
      document.addEventListener('keydown', onKey);

      overlay.querySelector('.ie-cancel').addEventListener('click', () => close(null));
      const doneBtn = overlay.querySelector('.ie-done');
      doneBtn.addEventListener('click', () => {
        doneBtn.disabled = true;
        const outW = opts.outWidth;
        const outH = Math.round(outW / opts.aspect);
        const out = document.createElement('canvas');
        out.width = outW; out.height = outH;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, outW, outH);
        ctx.imageSmoothingQuality = 'high';
        const k = outW / fw;                       // frame px -> output px
        const dw = work.width * s * k;
        const dh = work.height * s * k;
        ctx.drawImage(work, outW / 2 + cx * k - dw / 2, outH / 2 + cy * k - dh / 2, dw, dh);
        out.toBlob(blob => {
          if(!blob){ doneBtn.disabled = false; toast('Could not save the photo. Try again.'); return; }
          close(blob);
        }, 'image/jpeg', opts.quality);
      });
      doneBtn.focus();
    });
  };

  // Uploads an edited image to the public Media bucket and returns its public URL.
  // Uses generated file names so spaces / unusual characters in the original name can't break the upload.
  window.uploadImageBlob = async function(blob, folder){
    const path = folder + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
    const { error } = await supabaseClient.storage.from('Media').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if(error) throw error;
    const { data } = supabaseClient.storage.from('Media').getPublicUrl(path);
    return data.publicUrl;
  };
})();
