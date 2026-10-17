/* ============================================================================
   levels.js  —  the Level row (shield + tap-to-open XP bar) used on profiles.

   The DATABASE decides XP and level (sql-11-xp-and-levels.sql). This file only SHOWS what the
   database returns: { total_xp, level, level_xp, next_xp }.  next_xp is null at level 20
   (levels above 20 are not defined yet).

   Display text:  (level) totalXP/nextLevelXP      e.g.  (5) 623/750      level 20:  (20) 25300
   Tap the level number -> the bar opens; tap it again -> it closes. The bar shows progress
   INSIDE the current level:  (total - level_xp) / (next_xp - level_xp).

   Public API (window.Levels):
     Levels.format(info)          -> "(5) 623/750"
     Levels.percent(info)         -> 15.33...
     Levels.mount(host)           -> controller { update(info), open(), close() }   (draws the row into host)
     Levels.startMine(userId, ctl)-> daily check-in (bonus / login XP), live updates, keeps ctl up to date
     Levels.showFor(host, userId) -> draws another person's level (read only) into host
   ========================================================================== */
(function(root){
  'use strict';

  function sb(){ return (typeof supabaseClient !== 'undefined') ? supabaseClient : null; }   // top-level const in supabase-config.js

  // ---- numbers ----------------------------------------------------------------
  function format(info){
    if(!info) return '(0) 0/150';
    var t = Number(info.total_xp) || 0, lv = Number(info.level) || 0;
    return info.next_xp == null ? '(' + lv + ') ' + t : '(' + lv + ') ' + t + '/' + info.next_xp;
  }
  function percent(info){
    if(!info) return 0;
    if(info.next_xp == null) return 100;                       // top defined level: full bar
    var lo = Number(info.level_xp) || 0, hi = Number(info.next_xp), t = Number(info.total_xp) || 0;
    if(hi <= lo) return 100;
    return Math.max(0, Math.min(100, (t - lo) / (hi - lo) * 100));
  }

  // ---- look -------------------------------------------------------------------
  var cssDone = false;
  function injectCss(){
    if(cssDone) return; cssDone = true;
    var st = document.createElement('style');
    st.textContent =
      '.lv-card{ width:100%; max-width:340px; box-sizing:border-box; background:var(--card,#fff); border:1px solid var(--line,#e3ece8); border-radius:14px; padding:12px 18px; margin-bottom:12px; }' +
      '.lv-row{ display:flex; align-items:center; justify-content:space-between; min-height:44px; }' +
      '.lv-label{ font-weight:700; font-size:0.95rem; color:var(--ink,#123b2e); }' +
      '.lv-shield{ position:relative; width:44px; height:48px; padding:0; border:0; background:none; cursor:pointer; -webkit-tap-highlight-color:transparent; }' +
      '.lv-shield svg{ width:100%; height:100%; display:block; filter:drop-shadow(0 1px 2px rgba(0,0,0,.35)); }' +
      '.lv-shield b{ position:absolute; left:0; right:0; top:50%; transform:translateY(-52%); text-align:center; color:#fff; font:800 15px/1 Inter,system-ui,sans-serif; text-shadow:0 1px 2px rgba(0,0,0,.6); pointer-events:none; }' +
      '.lv-shield:active{ transform:scale(.94); }' +
      '.lv-barwrap{ overflow:hidden; max-height:0; opacity:0; transition:max-height .28s ease, opacity .22s ease, margin .28s ease; margin-top:0; }' +
      '.lv-card.open .lv-barwrap{ max-height:46px; opacity:1; margin-top:8px; }' +
      '.lv-bar{ position:relative; height:28px; border-radius:14px; background:#dfe7e4; overflow:hidden; box-shadow:inset 0 1px 3px rgba(0,0,0,.12); }' +
      '.lv-fill{ position:absolute; left:0; top:0; bottom:0; width:0; border-radius:14px; background:linear-gradient(180deg,#8ad0ff,#3f9df0); transition:width .5s ease; }' +
      '.lv-text{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#fff; font:700 14px/1 Inter,system-ui,sans-serif; text-shadow:0 1px 2px rgba(0,0,0,.45); letter-spacing:.3px; }';
    document.head.appendChild(st);
  }
  function shieldSvg(){
    return '<svg viewBox="0 0 44 48" aria-hidden="true"><defs>' +
      '<linearGradient id="lvG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a3fd1"/><stop offset="1" stop-color="#2b0f57"/></linearGradient>' +
      '<linearGradient id="lvB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#d49a1c"/></linearGradient></defs>' +
      '<path d="M22 2 L41 8 V25 C41 36 32 43 22 46 C12 43 3 36 3 25 V8 Z" fill="url(#lvG)" stroke="url(#lvB)" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M22 2 L22 8" stroke="url(#lvB)" stroke-width="3"/></svg>';
  }

  // ---- the row ----------------------------------------------------------------
  function mount(host){
    injectCss();
    host.className = (host.className ? host.className + ' ' : '') + 'lv-card';
    host.innerHTML =
      '<div class="lv-row"><span class="lv-label">Level</span>' +
      '<button type="button" class="lv-shield" aria-expanded="false" aria-label="Level, tap to show XP progress">' + shieldSvg() + '<b>0</b></button></div>' +
      '<div class="lv-barwrap"><div class="lv-bar"><div class="lv-fill"></div><div class="lv-text">(0) 0/150</div></div></div>';
    var btn = host.querySelector('.lv-shield'), num = host.querySelector('.lv-shield b'),
        fill = host.querySelector('.lv-fill'), txt = host.querySelector('.lv-text');
    var ctl = {
      info: null,
      update: function(info){
        if(!info) return;
        ctl.info = info;
        num.textContent = String(info.level);
        txt.textContent = format(info);
        fill.style.width = percent(info) + '%';
      },
      open:  function(){ host.classList.add('open');    btn.setAttribute('aria-expanded', 'true'); },
      close: function(){ host.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); },
      toggle: function(){ host.classList.contains('open') ? ctl.close() : ctl.open(); }
    };
    btn.addEventListener('click', function(e){ e.stopPropagation(); ctl.toggle(); });
    return ctl;
  }

  // ---- my own level: check-in + live updates ------------------------------------
  var mine = { id: null, ctls: [], channel: null, started: false };
  function paintMine(info){
    if(!info) return;
    try{ localStorage.setItem('xp-cache-' + mine.id, JSON.stringify(info)); }catch(e){}
    mine.ctls.forEach(function(c){ c.update(info); });
  }
  function refreshMine(){
    var c = sb(); if(!c || !mine.id) return Promise.resolve();
    return Promise.resolve(c.rpc('get_xp')).then(function(r){ if(r && r.data) paintMine(r.data); }, function(){});
  }
  function startMine(userId, ctl){
    mine.id = userId;
    if(ctl && mine.ctls.indexOf(ctl) < 0) mine.ctls.push(ctl);
    try{ var cached = JSON.parse(localStorage.getItem('xp-cache-' + userId) || 'null'); if(cached) paintMine(cached); }catch(e){}
    var c = sb(); if(!c || mine.started) return Promise.resolve();
    mine.started = true;
    // daily bonus / login XP are decided by the database; calling this again the same day adds nothing
    var done = Promise.resolve(c.rpc('xp_checkin')).then(function(r){ if(r && r.data) paintMine(r.data); }, function(){});
    try{
      mine.channel = c.channel('xp-' + userId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_xp', filter: 'user_id=eq.' + userId }, refreshMine)
        .subscribe();
    }catch(e){}
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) refreshMine(); });
    window.addEventListener('pageshow', refreshMine);
    return done;
  }

  // ---- someone else's level (read only) -----------------------------------------
  function showFor(host, userId){
    var c = sb(); if(!c || !userId){ host.style.display = 'none'; return Promise.resolve(); }
    return Promise.resolve(c.rpc('get_xp', { p_user: userId })).then(function(r){
      if(!r || !r.data){ host.style.display = 'none'; return; }
      host.style.display = '';
      var ctl = host.__lv || (host.__lv = mount(host));
      if(host.__lvUser !== userId){ ctl.close(); host.__lvUser = userId; }   // a new person: start closed
      ctl.update(r.data);
    }, function(){ host.style.display = 'none'; });
  }

  root.Levels = { format: format, percent: percent, mount: mount, startMine: startMine, refreshMine: refreshMine, showFor: showFor };
})(typeof window !== 'undefined' ? window : globalThis);
