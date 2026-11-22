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
  var KEYS = ['classic', 'gold', 'aurora', 'royal', 'flame', 'legend', 'gold_wings', 'crown_wings'];
  var IMG = { gold_wings: 1, crown_wings: 1 };     // frames that are a picture (frames/<key>_256.webp and _512.webp) instead of a code ring
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

      /* ---- picture frames (gold_wings, crown_wings): a painted frame that reaches outside the photo, with a shine that sweeps over it ---- */
      '@keyframes frsweep{0%{background-position:160% 0}55%,100%{background-position:-70% 0}}' +
      '@keyframes frglow{from{filter:drop-shadow(0 2px 4px rgba(0,0,0,.35)) drop-shadow(0 0 3px rgba(255,214,90,.35))}to{filter:drop-shadow(0 2px 4px rgba(0,0,0,.35)) drop-shadow(0 0 9px rgba(255,214,90,.85))}}' +
      '.fr.fr-i::after{inset:calc((1 - var(--fr-s,1.9)) / 2 * 100%);border-radius:0;-webkit-mask:none;mask:none;background:var(--fr-body) center/100% 100% no-repeat;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}' +
      '.fr.fr-i::before{inset:calc((1 - var(--fr-s,1.9)) / 2 * 100%);border-radius:0;box-shadow:none;background:none;-webkit-mask:var(--fr-img) center/100% 100% no-repeat;mask:var(--fr-img) center/100% 100% no-repeat}' +
      '.fr.fr-i.fr-live::before{background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.9) 50%,transparent 60%) 160% 0/260% 100% no-repeat;animation:frsweep 3.8s ease-in-out infinite}' +
      '.fr.fr-i.fr-live::after{animation:frglow 2.4s ease-in-out infinite alternate}' +
      '.fr-gold_wings{--fr-img:url(/gold_wings_256.webp);--fr-body:url(/gold_wings_body.webp);--fr-wl:url(/gold_wings_wl.webp);--fr-wr:url(/gold_wings_wr.webp);--fr-oy:77.7%;--fl-sx:1.025;--fl-sy:1.045;--fl-r:1.6deg}.fr-gold_wings.fr-live{--fr-img:url(/gold_wings_512.webp)}' +
      '.fr-crown_wings{--fr-img:url(/crown_wings_256.webp);--fr-body:url(/crown_wings_body.webp);--fr-wl:url(/crown_wings_wl.webp);--fr-wr:url(/crown_wings_wr.webp);--fr-oy:65.4%;--fl-sx:1.035;--fl-sy:1.07;--fl-r:2.5deg}.fr-crown_wings.fr-live{--fr-img:url(/crown_wings_512.webp)}' +
      /* the two wings are their own layers (made by splitting the picture): they open and close like a bird, hinged where the wing meets the ring */
      '@keyframes frflapl{0%,100%{transform:none}34%{transform:scale(var(--fl-sx),var(--fl-sy)) rotate(calc(var(--fl-r) * -1))}68%{transform:none}}' +
      '@keyframes frflapr{0%,100%{transform:none}34%{transform:scale(var(--fl-sx),var(--fl-sy)) rotate(var(--fl-r))}68%{transform:none}}' +
      '@keyframes frember{0%{opacity:0;transform:translate(0,0) scale(.45)}14%{opacity:1}100%{opacity:0;transform:translate(var(--dx,0),-620%) scale(.12)}}' +
      '@keyframes frtw{0%,100%{opacity:0;transform:scale(.3) rotate(0deg)}45%{opacity:1;transform:scale(1.05) rotate(45deg)}70%{opacity:.15;transform:scale(.5) rotate(70deg)}}' +
      '.fr-i>.fr-wl,.fr-i>.fr-wr{position:absolute;inset:calc((1 - var(--fr-s,1.9)) / 2 * 100%);z-index:3;pointer-events:none;background-size:100% 100%;background-repeat:no-repeat;will-change:transform;animation-duration:2.5s;animation-timing-function:cubic-bezier(.45,.05,.35,1);animation-iteration-count:infinite}' +
      '.fr-i>.fr-wl{background-image:var(--fr-wl);transform-origin:21.1% var(--fr-oy);animation-name:frflapl}' +
      '.fr-i>.fr-wr{background-image:var(--fr-wr);transform-origin:78.9% var(--fr-oy);animation-name:frflapr}' +
      '.fr-i>.fr-sp{position:absolute;inset:calc((1 - var(--fr-s,1.9)) / 2 * 100%);z-index:6;pointer-events:none}' +
      '.fr-i.fr-sm>.fr-sp i.fr-e{display:none}' +
      '.fr-sp i{position:absolute;display:block;pointer-events:none}' +
      '.fr-sp i.fr-e{width:4.6%;height:4.6%;margin:-2.3% 0 0 -2.3%;border-radius:50%;background:radial-gradient(circle,#fff 0,#ffe68a 28%,#ff9c1a 56%,rgba(255,110,0,0) 72%);opacity:0;animation:frember 2.9s ease-out infinite;animation-delay:var(--d,0s)}' +
      '.fr-sp i.fr-t{width:11%;height:11%;margin:-5.5% 0 0 -5.5%;background:radial-gradient(circle,#fff 0 16%,rgba(255,255,255,0) 56%),linear-gradient(#fff,#fff) center/9% 100% no-repeat,linear-gradient(#fff,#fff) center/100% 9% no-repeat;-webkit-mask:radial-gradient(circle,#000 22%,transparent 68%);mask:radial-gradient(circle,#000 22%,transparent 68%);opacity:0;animation:frtw 2.4s ease-in-out infinite;animation-delay:var(--d,0s)}' +
      '.you-avatar.fr-i{margin:34px 0 36px}' +
      '.frp-big.fr-i{margin:30px 14px 30px 30px}.frp-photo .frp-big.fr-i{margin:58px 0 40px}' +
      '.frp-grid{padding-top:8px}.frp-tile:has(.fr-i){margin-bottom:26px}.frp-tile:has(.fr-i) .frp-t-av{margin-top:22px}' +
      '@media (prefers-reduced-motion:reduce){.fr-live::before,.fr-live::after,.fr-i>.fr-wl,.fr-i>.fr-wr,.fr-sp i{animation:none!important}.fr-sp i{display:none!important}}' +

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
  function eff(e){ if(!e) return null; if(e.k && e.x && Date.parse(e.x) <= Date.now()) return 'classic'; return e.k; }
  function keyOf(uid){ return eff(cache[uid]); }

  // ember positions (percent of the frame box) around the wings + glints on the jewels, per picture frame
  var SPARKS = {
    crown_wings: { e: [[13,30],[19,46],[9,50],[16,22]], t: [[50.2,13.7],[50,79]] },
    gold_wings:  { e: [[14,36],[19,52],[12,24],[22,14]], t: [[50.3,7.4],[49.8,83]] }
  };
  function ensureKids(el, key){
    var have = el.getAttribute('data-fr-kids');
    var ok = have === key && el.querySelector(':scope > .fr-wl') && el.querySelector(':scope > .fr-wr') && el.querySelector(':scope > .fr-sp');
    if(ok) return;
    removeKids(el);
    var cfg = SPARKS[key]; if(!cfg) return;
    var h = '<span class="fr-wl"></span><span class="fr-wr"></span><span class="fr-sp">';
    for(var i = 0; i < cfg.e.length; i++){
      var p = cfg.e[i];
      h += '<i class="fr-e" style="left:' + p[0] + '%;top:' + p[1] + '%;--dx:-170%;--d:' + (i * 0.7).toFixed(1) + 's"></i>';
      h += '<i class="fr-e" style="left:' + (100 - p[0]) + '%;top:' + p[1] + '%;--dx:170%;--d:' + (i * 0.7 + 0.35).toFixed(2) + 's"></i>';
    }
    for(var j = 0; j < cfg.t.length; j++){
      h += '<i class="fr-t" style="left:' + cfg.t[j][0] + '%;top:' + cfg.t[j][1] + '%;--d:' + (j * 1.1).toFixed(1) + 's"></i>';
    }
    h += '</span>';
    el.insertAdjacentHTML('beforeend', h);
    el.setAttribute('data-fr-kids', key);
  }
  function removeKids(el){
    var k = el.querySelectorAll(':scope > .fr-wl, :scope > .fr-wr, :scope > .fr-sp');
    for(var i = 0; i < k.length; i++) k[i].parentNode.removeChild(k[i]);
    el.removeAttribute('data-fr-kids');
  }

  function apply(el){
    var key = el.getAttribute('data-fr-key');
    if(!key){
      var uid = el.getAttribute('data-fr');
      var e = uid ? cache[uid] : null;
      key = e ? eff(e) : null;
    }
    var ok = key && KEYS.indexOf(key) >= 0;
    for(var i = 0; i < KEYS.length; i++) el.classList.remove('fr-' + KEYS[i]);
    if(!ok){
      el.classList.remove('fr', 'fr-live', 'fr-i', 'fr-sm');
      if(el.hasAttribute('data-fr-kids')) removeKids(el);
      if(el.hasAttribute('data-fr-ov')){ var ov0 = el.getAttribute('data-fr-ov'); el.style.overflow = (ov0 === '-') ? '' : ov0; el.removeAttribute('data-fr-ov'); el.style.removeProperty('--fr-s'); }
      return;
    }
    if(!el.hasAttribute('data-fr-pos')){
      el.setAttribute('data-fr-pos', '1');
      try{ if(getComputedStyle(el).position === 'static') el.style.position = 'relative'; }catch(e){}
    }
    el.classList.add('fr', 'fr-' + key);
    var big = el.hasAttribute('data-fr-live') || el.offsetWidth >= 96;
    el.classList.toggle('fr-live', !!big);
    // a picture frame reaches outside the photo: the avatar must not clip it, and the frame is a little smaller on small avatars
    var isImg = !!IMG[key];
    el.classList.toggle('fr-i', isImg);
    if(isImg){
      var w = el.offsetWidth || 44;
      el.style.setProperty('--fr-s', w >= 96 ? '1.9' : (w >= 56 ? '1.7' : '1.5'));
      if(!el.hasAttribute('data-fr-ov')){ el.setAttribute('data-fr-ov', el.style.overflow || '-'); }
      el.style.overflow = 'visible';
      el.classList.toggle('fr-sm', w < 56);
      ensureKids(el, key);
    } else if(el.hasAttribute('data-fr-ov')){
      var ov = el.getAttribute('data-fr-ov'); el.style.overflow = (ov === '-') ? '' : ov; el.removeAttribute('data-fr-ov'); el.style.removeProperty('--fr-s');
    }
    if(!isImg){ el.classList.remove('fr-sm'); if(el.hasAttribute('data-fr-kids')) removeKids(el); }
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
      stale[j].classList.remove('fr', 'fr-live', 'fr-i', 'fr-sm');
      if(stale[j].hasAttribute('data-fr-kids')) removeKids(stale[j]);
    }
    if(need.length) load(need);
  }
  function schedule(){ if(timer) return; timer = setTimeout(scan, 30); }
  function daysLeft(ts, short){
    var d = Math.ceil((Date.parse(ts) - Date.now()) / 86400000);
    if(d <= 0) return short ? 'ended' : 'ended';
    if(d === 1) return short ? '1 day' : 'ends today or tomorrow';
    return short ? d + ' days' : d + ' days left';
  }

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
        return Promise.resolve(c.from('user_equipped_frame').select('user_id, frame_key, expires_at').in('user_id', ch)).then(function(res){
          if(res && res.error){ ch.forEach(function(u){ delete inflight[u]; }); return; }
          var got = {}, gotX = {};
          ((res && res.data) || []).forEach(function(row){ got[row.user_id] = row.frame_key; gotX[row.user_id] = row.expires_at || null; });
          ch.forEach(function(u){ cache[u] = { k: got[u] || null, x: gotX[u] || null, t: Date.now() }; delete inflight[u]; });
        }, function(){ ch.forEach(function(u){ delete inflight[u]; }); });
      })).then(function(){ schedule(); });
    }, function(){ uids.forEach(function(u){ delete inflight[u]; }); });
  }

  function set(uid, key, exp){ cache[uid] = { k: key || null, x: exp || null, t: Date.now() }; schedule(); }

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
            if(row && row.user_id) set(row.user_id, p.eventType === 'DELETE' ? null : row.frame_key, row.expires_at);
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
      if(f && f.owned && f.expires_at){ how += ' (' + daysLeft(f.expires_at, false) + ')'; }
      var html = '<div class="frp-top"><div class="frp-big" data-fr-key="' + esc(f ? f.key : '') + '" data-fr-live' + avatarAttrs(src) + '>' + esc(src.txt) + '</div>' +
        '<div class="frp-info"><div class="frp-title">' + esc(f ? f.name : '') + '</div><div class="frp-how">' + esc(how) + '</div></div>' +
        '<button type="button" class="frp-act" id="frp-use"' + ((isOn || !isOwned) ? ' disabled' : '') + '>' + (isOn ? 'Active' : (isOwned ? 'Use' : 'Locked')) + '</button></div>' +
        '<div class="frp-grid">' + frames.map(function(x){
          return '<button type="button" class="frp-tile' + (x.key === picker.sel ? ' sel' : '') + (x.owned ? '' : ' locked') + '" data-k="' + esc(x.key) + '">' +
            (x.key === equipped ? '<span class="frp-tick">✓</span>' : (x.owned ? '' : '<span class="frp-lock">🔒</span>')) +
            '<div class="frp-t-av" data-fr-key="' + esc(x.key) + '"' + avatarAttrs(src) + '>' + esc(src.txt) + '</div>' +
            '<div class="frp-name">' + esc(x.name) + (x.owned ? (x.expires_at ? ' · ' + daysLeft(x.expires_at, true) : '') : (x.unlock_level != null ? ' · Lv ' + x.unlock_level : '')) + '</div></button>';
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
