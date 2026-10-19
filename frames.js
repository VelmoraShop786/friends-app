/* ============================================================================
   frames.js  —  profile picture FRAMES (the ring around an avatar) + the "Basic Info" picker popup.

   How a frame shows up: any element that carries  data-fr="<user id>"  gets the frame that person has
   equipped (class fr fr-<key>). The page just writes that attribute on the avatar; this file does the rest
   (looks the frame up once, keeps it in a cache, updates live when someone changes their frame).
   A fixed frame (for previews) is  data-fr-key="gold".

   The DATABASE decides which frames a person owns and may equip (sql-14-profile-frames.sql). Nothing here
   can give anybody a frame.

   Frames are drawn with CSS only (no images). They are light: the ring only ANIMATES on big avatars
   (96px and up, or data-fr-live), small ones in lists stay still. Respects "reduce motion".

   Public API (window.Frames):
     Frames.keyOf(userId) / Frames.set(userId, key)
     Frames.openPicker({ userId, sourceEl, onUploadPhoto, startTab })   -> the popup (Profile Photo | Profile Frame)
   ========================================================================== */
(function(root){
  'use strict';
  var KEYS = ['classic', 'gold', 'aurora', 'royal', 'flame', 'legend'];
  var STALE_MS = 5 * 60 * 1000;

  function sb(){ return (typeof supabaseClient !== 'undefined') ? supabaseClient : null; }   // top-level const in supabase-config.js
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function toast(m){ try{ if(typeof root.showToast === 'function') root.showToast(m); }catch(e){} }

  // ---------------------------------------------------------------- the frames (CSS)
  var cssDone = false;
  function injectCss(){
    if(cssDone) return; cssDone = true;
    var ring = '-webkit-mask:radial-gradient(farthest-side,transparent 84.5%,#000 86%);mask:radial-gradient(farthest-side,transparent 84.5%,#000 86%);';
    var css =
      '.fr::before,.fr::after{content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none}' +
      '.fr::before{z-index:5}' +
      '.fr::after{z-index:4;' + ring + '}' +
      '@keyframes frspin{to{transform:rotate(360deg)}}' +
      '@keyframes frtwinkle{0%,100%{opacity:.35}50%{opacity:1}}' +
      '@keyframes frflicker{from{filter:brightness(.95) saturate(1)}to{filter:brightness(1.3) saturate(1.25)}}' +
      '@keyframes frpulse{from{opacity:.5}to{opacity:1}}' +

      /* 1 Classic — emerald ring, glossy */
      '.fr-classic::after{background:conic-gradient(from 210deg,#0b8f68,#46e8b4 18%,#0b8f68 38%,#8ff7d6 52%,#0b8f68 70%,#34d6a0 85%,#0b8f68)}' +
      '.fr-classic::before{box-shadow:inset 0 0 0 1px rgba(255,255,255,.28),inset 0 0 7px rgba(15,157,116,.6)}' +

      /* 2 Golden Glory — polished gold with sparkles */
      '.fr-gold::after{background:conic-gradient(from 0deg,#7a4b00,#ffd75e 14%,#a8700a 28%,#fff1a8 42%,#c28a14 58%,#ffe082 72%,#8c5a05 86%,#7a4b00)}' +
      '.fr-gold::before{background:radial-gradient(circle at 50% 96.3%,#fff7c8 0 2.6%,#ffcf3f 3.6%,#b87a00 4.6%,transparent 5.4%),radial-gradient(circle at 90% 20%,rgba(255,255,255,.95) 0 1.5%,transparent 2.7%),radial-gradient(circle at 9% 72%,rgba(255,255,255,.9) 0 1.3%,transparent 2.5%);' +
        'box-shadow:inset 0 0 0 1px rgba(255,226,122,.55),inset 0 0 9px rgba(255,200,60,.5)}' +
      '.fr-live.fr-gold::after{animation:frspin 7s linear infinite}' +
      '.fr-live.fr-gold::before{animation:frtwinkle 2.4s ease-in-out infinite}' +

      /* 3 Aurora — flowing purple / cyan / pink light */
      '.fr-aurora::after{background:conic-gradient(from 0deg,#7b3ff2,#2bd9ff,#46f0b8,#ff5fd2,#7b3ff2)}' +
      '.fr-aurora::before{box-shadow:inset 0 0 10px rgba(120,200,255,.75),inset 0 0 0 1px rgba(255,255,255,.38)}' +
      '.fr-live.fr-aurora::after{animation:frspin 3.6s linear infinite}' +

      /* 4 Royal Gem — sapphire ring, gold trim, four jewels */
      '.fr-royal::after{background:conic-gradient(from 45deg,#1b2f8f,#4f7dff 15%,#1b2f8f 30%,#d9b44a 38%,#1b2f8f 46%,#3a5be0 62%,#1b2f8f 78%,#d9b44a 86%,#1b2f8f)}' +
      '.fr-royal::before{background:' +
        'radial-gradient(circle at 50% 3.7%,#ffd0dc 0 1.3%,#ff3d6e 2.6%,#a50f3a 3.9%,transparent 4.7%),' +
        'radial-gradient(circle at 96.3% 50%,#d8ecff 0 1.2%,#4aa8ff 2.4%,#1d5fb8 3.6%,transparent 4.4%),' +
        'radial-gradient(circle at 50% 96.3%,#d8ecff 0 1.2%,#4aa8ff 2.4%,#1d5fb8 3.6%,transparent 4.4%),' +
        'radial-gradient(circle at 3.7% 50%,#d8ecff 0 1.2%,#4aa8ff 2.4%,#1d5fb8 3.6%,transparent 4.4%);' +
        'box-shadow:inset 0 0 0 1px rgba(255,226,122,.6),inset 0 0 9px rgba(70,110,255,.55)}' +
      '.fr-live.fr-royal::after{animation:frspin 12s linear infinite}' +

      /* 5 Phoenix — living fire */
      '.fr-flame::after{background:conic-gradient(from 0deg,#ff3d00,#ff9d00 16%,#ffe14d 28%,#ff6a00 44%,#d81b00 60%,#ff9d00 76%,#ffe14d 88%,#ff3d00)}' +
      '.fr-flame::before{background:radial-gradient(circle at 50% -4%,rgba(255,236,130,.95) 0 8%,rgba(255,140,0,.55) 22%,transparent 44%);box-shadow:inset 0 0 11px rgba(255,90,0,.7)}' +
      '.fr-live.fr-flame::after{animation:frspin 5s linear infinite,frflicker 1.3s ease-in-out infinite alternate}' +
      '.fr-live.fr-flame::before{animation:frpulse 1.3s ease-in-out infinite alternate}' +

      /* 6 Legend — rainbow light with twinkling stars */
      '.fr-legend::after{background:conic-gradient(from 0deg,#ff3b6b,#ffb300,#fff200,#35e06f,#27c4ff,#6a5cff,#d94bff,#ff3b6b)}' +
      '.fr-legend::before{background:radial-gradient(circle at 50% 3.5%,#fff 0 1.8%,transparent 3%),radial-gradient(circle at 93.7% 34.1%,#fff 0 1.5%,transparent 2.7%),radial-gradient(circle at 79.9% 85.6%,#fff 0 1.7%,transparent 2.9%),radial-gradient(circle at 20.1% 85.6%,#fff 0 1.5%,transparent 2.7%),radial-gradient(circle at 6.3% 34.1%,#fff 0 1.7%,transparent 2.9%);' +
        'box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.75),inset 0 0 11px rgba(255,255,255,.4)}' +
      '.fr-live.fr-legend::after{animation:frspin 3s linear infinite}' +
      '.fr-live.fr-legend::before{animation:frtwinkle 1.6s ease-in-out infinite}' +
      '@media (prefers-reduced-motion:reduce){.fr-live::before,.fr-live::after{animation:none!important}}' +

      /* ---- the picker popup ---- */
      '.frp-back{position:fixed;inset:0;z-index:2100;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box}' +
      '.frp{width:100%;max-width:420px;max-height:88vh;display:flex;flex-direction:column;border-radius:26px;background:linear-gradient(180deg,#3ccfa6,#22a883);padding:0 8px 8px;box-shadow:0 10px 30px rgba(0,0,0,.4);font-family:Inter,system-ui,sans-serif}' +
      '.frp-head{position:relative;text-align:center;color:#fff;font-weight:800;font-size:1.4rem;padding:16px 44px 14px;text-shadow:0 2px 3px rgba(0,0,0,.25)}' +
      '.frp-x{position:absolute;right:10px;top:10px;width:36px;height:36px;border:0;border-radius:50%;background:rgba(0,0,0,.18);color:#fff;font-size:1.25rem;line-height:1;cursor:pointer}' +
      '.frp-body{overflow-y:auto;-webkit-overflow-scrolling:touch;background:#e4f3ee;border-radius:20px;padding:12px 12px 16px;color:#2e6b58}' +
      '.frp-tabs{display:flex;gap:8px;margin-bottom:12px}' +
      '.frp-tab{flex:1;border:0;border-radius:14px 14px 0 0;padding:11px 6px;font:700 .98rem Inter,system-ui,sans-serif;background:#b3cfc5;color:#4f7d6c;cursor:pointer}' +
      '.frp-tab.on{background:#fff;color:#2bb892}' +
      '.frp-top{display:flex;align-items:center;gap:12px;margin-bottom:12px}' +
      '.frp-big{width:84px;height:84px;flex:none;border-radius:50%;background:#bfe0d4 center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.6rem;color:#2e6b58}' +
      '.frp-info{flex:1;min-width:0}' +
      '.frp-title{font-weight:800;font-size:1rem;color:#2f7a63}' +
      '.frp-how{font-size:.86rem;color:#6a9c8b;margin-top:3px;line-height:1.3}' +
      '.frp-act{flex:none;border:0;border-radius:22px;padding:11px 18px;font:800 .95rem Inter,system-ui,sans-serif;background:#2bb892;color:#fff;cursor:pointer}' +
      '.frp-act[disabled]{background:#a9c9be;color:#fff;cursor:default}' +
      '.frp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 8px}' +
      '.frp-tile{border:0;background:none;padding:6px 0;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;position:relative;font-family:inherit;-webkit-tap-highlight-color:transparent}' +
      '.frp-t-av{width:76px;height:76px;border-radius:50%;background:#bfe0d4 center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-weight:700;color:#2e6b58}' +
      '.frp-tile.sel .frp-t-av{box-shadow:0 0 0 3px #2bb892,0 0 14px rgba(43,184,146,.7)}' +
      '.frp-tile.locked .frp-t-av{filter:grayscale(.85) brightness(.9);opacity:.75}' +
      '.frp-name{font-size:.8rem;font-weight:700;color:#3f7a66;text-align:center}' +
      '.frp-tick{position:absolute;top:2px;right:12px;width:22px;height:22px;border-radius:50%;background:#2bb892;color:#fff;font-size:.8rem;display:flex;align-items:center;justify-content:center;border:2px solid #fff;z-index:6}' +
      '.frp-lock{position:absolute;top:2px;right:12px;width:22px;height:22px;border-radius:50%;background:#7e8f89;color:#fff;font-size:.72rem;display:flex;align-items:center;justify-content:center;border:2px solid #fff;z-index:6}' +
      '.frp-photo{display:flex;flex-direction:column;align-items:center;gap:16px;padding:10px 0 6px}' +
      '.frp-photo .frp-big{width:132px;height:132px;font-size:2.4rem}' +
      '.frp-note{text-align:center;color:#6a9c8b;font-size:.85rem;padding:4px 10px}';
    var st = document.createElement('style');
    st.id = 'frames-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- who has which frame (cache + loading)
  var cache = {};          // uid -> { k: key|null, t: time }
  var inflight = {};
  var timer = null;
  var channel = null;

  function entry(uid){ return cache[uid]; }
  function keyOf(uid){ var e = cache[uid]; return e ? e.k : null; }

  function apply(el){
    var key = el.getAttribute('data-fr-key');
    if(!key){
      var uid = el.getAttribute('data-fr');
      var e = uid ? cache[uid] : null;
      key = e ? e.k : null;
    }
    var ok = key && KEYS.indexOf(key) >= 0;
    for(var i = 0; i < KEYS.length; i++) el.classList.remove('fr-' + KEYS[i]);
    if(!ok){ el.classList.remove('fr', 'fr-live'); return; }
    if(!el.hasAttribute('data-fr-pos')){
      el.setAttribute('data-fr-pos', '1');
      try{ if(getComputedStyle(el).position === 'static') el.style.position = 'relative'; }catch(e){}
    }
    el.classList.add('fr', 'fr-' + key);
    var big = el.hasAttribute('data-fr-live') || el.offsetWidth >= 96;
    el.classList.toggle('fr-live', !!big);
  }

  function scan(){
    timer = null;
    injectCss();
    var els = document.querySelectorAll('[data-fr],[data-fr-key]');
    var need = [], now = Date.now();
    for(var i = 0; i < els.length; i++){
      var el = els[i], uid = el.getAttribute('data-fr');
      if(uid && !el.getAttribute('data-fr-key')){
        var e = cache[uid];
        if((!e || now - e.t > STALE_MS) && !inflight[uid] && need.indexOf(uid) < 0) need.push(uid);
      }
      apply(el);
    }
    var stale = document.querySelectorAll('.fr:not([data-fr]):not([data-fr-key])');
    for(var j = 0; j < stale.length; j++){
      for(var q = 0; q < KEYS.length; q++) stale[j].classList.remove('fr-' + KEYS[q]);
      stale[j].classList.remove('fr', 'fr-live');
    }
    if(need.length) load(need);
  }
  function schedule(){ if(timer) return; timer = setTimeout(scan, 30); }

  function load(uids){
    var c = sb(); if(!c || !c.from) return;
    uids.forEach(function(u){ inflight[u] = true; });
    // only ask once there is a login session (otherwise the answer would be empty and wrongly remembered)
    Promise.resolve(c.auth.getSession()).then(function(r){
      var ok = r && r.data && r.data.session;
      if(!ok){ uids.forEach(function(u){ delete inflight[u]; }); setTimeout(schedule, 900); return; }
      var chunks = [];
      for(var i = 0; i < uids.length; i += 80) chunks.push(uids.slice(i, i + 80));
      return Promise.all(chunks.map(function(ch){
        return Promise.resolve(c.from('user_equipped_frame').select('user_id, frame_key').in('user_id', ch)).then(function(res){
          if(res && res.error){ ch.forEach(function(u){ delete inflight[u]; }); return; }
          var got = {};
          ((res && res.data) || []).forEach(function(row){ got[row.user_id] = row.frame_key; });
          ch.forEach(function(u){ cache[u] = { k: got[u] || null, t: Date.now() }; delete inflight[u]; });
        }, function(){ ch.forEach(function(u){ delete inflight[u]; }); });
      })).then(function(){ schedule(); });
    }, function(){ uids.forEach(function(u){ delete inflight[u]; }); });
  }

  function set(uid, key){ cache[uid] = { k: key || null, t: Date.now() }; schedule(); }

  function start(){
    injectCss();
    schedule();
    try{
      new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-fr', 'data-fr-key'] });
    }catch(e){}
    var c = sb();
    if(c && c.channel){
      try{
        channel = c.channel('frames-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'user_equipped_frame' }, function(p){
            var row = (p && (p.new && p.new.user_id ? p.new : p.old)) || null;
            if(row && row.user_id) set(row.user_id, p.eventType === 'DELETE' ? null : row.frame_key);
          }).subscribe();
      }catch(e){}
    }
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) schedule(); });
  }

  // ---------------------------------------------------------------- the picker popup (Profile Photo | Profile Frame)
  var picker = null;
  function sourceStyle(src){
    var bg = '', txt = '';
    if(src){
      try{ bg = src.style.backgroundImage || ''; txt = bg ? '' : (src.textContent || '').trim(); }catch(e){}
    }
    return { bg: bg, txt: txt };
  }
  function avatarAttrs(s){ return (s.bg ? ' style="background-image:' + esc(s.bg) + '"' : ''); }

  function closePicker(){
    if(!picker) return;
    document.removeEventListener('keydown', onKey);
    if(picker.back.parentNode) picker.back.parentNode.removeChild(picker.back);
    picker = null;
  }
  function onKey(e){ if(e.key === 'Escape') closePicker(); }

  function openPicker(opts){
    opts = opts || {};
    injectCss();
    closePicker();
    var src = sourceStyle(opts.sourceEl);
    var back = document.createElement('div');
    back.className = 'frp-back';
    back.innerHTML = '<div class="frp" role="dialog" aria-label="Basic Info"><div class="frp-head">Basic Info<button type="button" class="frp-x" aria-label="Close">✕</button></div>' +
      '<div class="frp-body"><div class="frp-tabs"><button type="button" class="frp-tab" data-t="photo">Profile Photo</button><button type="button" class="frp-tab" data-t="frame">Profile Frame</button></div><div class="frp-pane"></div></div></div>';
    document.body.appendChild(back);
    picker = { back: back, pane: back.querySelector('.frp-pane'), tab: opts.startTab || 'photo', data: null, sel: null };
    back.addEventListener('click', function(e){ if(e.target === back) closePicker(); });      // tap outside closes it
    back.querySelector('.frp-x').addEventListener('click', closePicker);
    back.querySelectorAll('.frp-tab').forEach(function(b){ b.addEventListener('click', function(){ picker.tab = b.getAttribute('data-t'); render(); }); });
    document.addEventListener('keydown', onKey);

    function currentKey(){ return picker && picker.data ? picker.data.equipped : keyOf(opts.userId); }

    function render(){
      if(!picker) return;
      back.querySelectorAll('.frp-tab').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-t') === picker.tab); });
      var pane = picker.pane;
      if(picker.tab === 'photo'){
        var ek = currentKey();
        pane.innerHTML = '<div class="frp-photo"><div class="frp-big' + '" data-fr-key="' + esc(ek || '') + '" data-fr-live' + avatarAttrs(src) + '>' + esc(src.txt) + '</div>' +
          '<button type="button" class="frp-act" id="frp-up">Upload new photo</button></div>' +
          '<div class="frp-note">Choose a picture from your phone. You can crop it before saving.</div>';
        pane.querySelector('#frp-up').addEventListener('click', function(){
          closePicker();
          if(typeof opts.onUploadPhoto === 'function') opts.onUploadPhoto();
        });
        return;
      }
      // frame tab
      if(!picker.data){
        pane.innerHTML = '<div class="frp-note">Loading...</div>';
        return;
      }
      var frames = picker.data.frames || [], equipped = picker.data.equipped;
      if(!picker.sel) picker.sel = equipped || (frames[0] && frames[0].key);
      var f = frames.filter(function(x){ return x.key === picker.sel; })[0] || frames[0];
      var isOwned = f && f.owned, isOn = f && f.key === equipped;
      var how = f ? (f.owned ? f.how : (f.unlock_level != null ? 'Reach level ' + f.unlock_level + ' to get this frame.' : f.how)) : '';
      var html = '<div class="frp-top"><div class="frp-big" data-fr-key="' + esc(f ? f.key : '') + '" data-fr-live' + avatarAttrs(src) + '>' + esc(src.txt) + '</div>' +
        '<div class="frp-info"><div class="frp-title">' + esc(f ? f.name : '') + '</div><div class="frp-how">' + esc(how) + '</div></div>' +
        '<button type="button" class="frp-act" id="frp-use"' + ((isOn || !isOwned) ? ' disabled' : '') + '>' + (isOn ? 'Active' : (isOwned ? 'Use' : 'Locked')) + '</button></div>' +
        '<div class="frp-grid">' + frames.map(function(x){
          return '<button type="button" class="frp-tile' + (x.key === picker.sel ? ' sel' : '') + (x.owned ? '' : ' locked') + '" data-k="' + esc(x.key) + '">' +
            (x.key === equipped ? '<span class="frp-tick">✓</span>' : (x.owned ? '' : '<span class="frp-lock">🔒</span>')) +
            '<div class="frp-t-av" data-fr-key="' + esc(x.key) + '"' + avatarAttrs(src) + '>' + esc(src.txt) + '</div>' +
            '<div class="frp-name">' + esc(x.name) + (x.owned ? '' : (x.unlock_level != null ? ' · Lv ' + x.unlock_level : '')) + '</div></button>';
        }).join('') + '</div>';
      pane.innerHTML = html;
      pane.querySelectorAll('.frp-tile').forEach(function(t){ t.addEventListener('click', function(){ picker.sel = t.getAttribute('data-k'); render(); }); });
      var use = pane.querySelector('#frp-use');
      if(use && !use.disabled) use.addEventListener('click', function(){
        use.disabled = true; use.textContent = '...';
        var c = sb();
        Promise.resolve(c.rpc('equip_frame', { p_key: f.key })).then(function(r){
          if(!picker) return;
          if(r && r.error){ toast('Could not change frame'); render(); return; }
          picker.data.equipped = f.key;
          set(opts.userId, f.key);
          toast('Frame changed');
          render();
        }, function(){ toast('Could not change frame'); render(); });
      });
    }
    render();

    var c = sb();
    if(c){
      Promise.resolve(c.rpc('get_my_frames')).then(function(r){
        if(!picker) return;
        if(r && r.data){ picker.data = r.data; if(r.data.equipped) set(opts.userId, r.data.equipped); }
        else picker.data = { equipped: keyOf(opts.userId), frames: [] };
        render();
      }, function(){ if(picker){ picker.data = { equipped: keyOf(opts.userId), frames: [] }; render(); } });
    }
  }

  root.Frames = { keys: KEYS, keyOf: keyOf, set: set, refresh: schedule, openPicker: openPicker, start: start };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);
