/* ============================================================================
   levels.js  —  the Level card (shield + always-visible XP bar) and the "About Level" page.

   The DATABASE decides XP and level (sql-11 / sql-12). This file only SHOWS what it returns:
     get_xp / xp_checkin -> { total_xp, level, level_xp, next_xp }   (next_xp is null at level 20)
     xp_today            -> { login, sms, seat, ...caps }            (today's progress)
     xp_levels           -> [{ level, xp }, ...]                     (the approved level table)

   Bar text:  (level) totalXP/nextLevelXP      e.g.  (5) 623/750      level 20:  (20) 25300
   The bar shows progress INSIDE the current level: (total - level_xp) / (next_xp - level_xp).
   Tap the level number (shield) on your own card -> the "About Level" page opens.

   Public API (window.Levels):
     Levels.format(info) / Levels.percent(info)
     Levels.mount(host, { about:true })  -> controller { update(info) }
     Levels.startMine(userId, ctl)       -> daily check-in, live updates, keeps ctl up to date
     Levels.showFor(host, userId)        -> someone else's level (read only, no About page)
     Levels.openAbout()                  -> opens the About Level page
   ========================================================================== */
(function(root){
  'use strict';

  function sb(){ return (typeof supabaseClient !== 'undefined') ? supabaseClient : null; }   // top-level const in supabase-config.js
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }

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
      /* card + bar (always visible) */
      '.lv-card{ width:100%; max-width:340px; box-sizing:border-box; background:var(--card,#fff); border:1px solid var(--line,#e3ece8); border-radius:14px; padding:10px 14px; margin-bottom:12px; }' +
      '.lv-row{ display:flex; align-items:center; gap:0; min-height:48px; }' +
      '.lv-label{ font-weight:700; font-size:0.95rem; color:var(--ink,#123b2e); flex:none; width:56px; }' +
      '.lv-shield{ position:relative; flex:none; width:44px; height:48px; padding:0; border:0; background:none; cursor:default; z-index:2; margin-right:-16px; -webkit-tap-highlight-color:transparent; }' +
      '.lv-shield.lv-tap{ cursor:pointer; }' +
      '.lv-shield.lv-tap:active{ transform:scale(.94); }' +
      '.lv-shield svg{ width:100%; height:100%; display:block; filter:drop-shadow(0 1px 2px rgba(0,0,0,.35)); }' +
      '.lv-shield b{ position:absolute; left:0; right:0; top:50%; transform:translateY(-52%); text-align:center; color:#fff; font:800 15px/1 Inter,system-ui,sans-serif; text-shadow:0 1px 2px rgba(0,0,0,.6); pointer-events:none; }' +
      '.lv-bar{ position:relative; flex:1; height:26px; border-radius:13px; background:#b4c6c0; overflow:hidden; box-shadow:inset 0 1px 3px rgba(0,0,0,.18); }' +
      '.lv-fill{ position:absolute; left:0; top:0; bottom:0; width:0; border-radius:13px; background:linear-gradient(180deg,#8ad0ff,#3f9df0); transition:width .5s ease; }' +
      '.lv-text{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding-left:14px; color:#fff; font:700 13.5px/1 Inter,system-ui,sans-serif; text-shadow:0 1px 2px rgba(0,0,0,.6); letter-spacing:.3px; }' +
      /* About Level page */
      '.lvab-back{ position:fixed; inset:0; z-index:2000; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding:16px; box-sizing:border-box; }' +
      '.lvab{ width:100%; max-width:420px; max-height:84vh; display:flex; flex-direction:column; border-radius:26px; background:linear-gradient(180deg,#3ccfa6,#22a883); padding:0 8px 8px; box-shadow:0 10px 30px rgba(0,0,0,.4); }' +
      '.lvab-head{ position:relative; text-align:center; color:#fff; font:800 1.45rem/1 Inter,system-ui,sans-serif; padding:16px 44px 14px; text-shadow:0 2px 3px rgba(0,0,0,.25); }' +
      '.lvab-x{ position:absolute; right:10px; top:10px; width:36px; height:36px; border:0; border-radius:50%; background:rgba(0,0,0,.18); color:#fff; font-size:1.3rem; line-height:1; cursor:pointer; }' +
      '.lvab-body{ overflow-y:auto; -webkit-overflow-scrolling:touch; background:#e4f3ee; border-radius:20px; padding:14px 14px 18px; color:#2e6b58; font-family:Inter,system-ui,sans-serif; }' +
      '.lvab h4{ margin:0 0 4px; text-align:center; font-size:1.15rem; color:#2f7a63; }' +
      '.lvab .lvab-sub{ text-align:center; font-size:.85rem; color:#5f9b86; margin-bottom:12px; }' +
      '.lvab .lvab-sec{ font-weight:700; font-size:.98rem; margin:14px 0 8px; color:#2f7a63; }' +
      '.lvab .lvab-sec em{ font-style:normal; font-weight:500; color:#6a9c8b; }' +
      '.lvab .lvab-sec b{ color:#e0802b; }' +
      '.lvab-item{ margin-bottom:12px; }' +
      '.lvab-line{ display:flex; justify-content:space-between; font-weight:700; font-size:.95rem; color:#2f7a63; }' +
      '.lvab-line span:last-child{ color:#5f9b86; }' +
      '.lvab-track{ height:12px; border-radius:6px; background:#9db3ab; margin:6px 0 4px; overflow:hidden; }' +
      '.lvab-track i{ display:block; height:100%; width:0; border-radius:6px; background:linear-gradient(180deg,#8ad0ff,#3f9df0); transition:width .5s ease; }' +
      '.lvab-note{ font-size:.85rem; color:#7aa797; }' +
      '.lvab-table{ width:100%; border-collapse:separate; border-spacing:0; border-radius:14px; overflow:hidden; margin-top:6px; font-size:.92rem; }' +
      '.lvab-table th{ background:#5c9e85; color:#fff; padding:10px 6px; font-weight:700; }' +
      '.lvab-table td{ text-align:center; padding:9px 6px; background:#eaf6f2; color:#6b6f6e; font-weight:700; border-top:2px solid #cfe3dc; }' +
      '.lvab-table tr:nth-child(even) td{ background:#d6eae3; }' +
      '.lvab-table tr.me td{ background:#bfe6ff; color:#1d5d8f; }' +
      '.lvab-foot{ margin-top:12px; font-size:.82rem; color:#7aa797; text-align:center; }';
    document.head.appendChild(st);
  }
  function shieldSvg(){
    return '<svg viewBox="0 0 44 48" aria-hidden="true"><defs>' +
      '<linearGradient id="lvG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a3fd1"/><stop offset="1" stop-color="#2b0f57"/></linearGradient>' +
      '<linearGradient id="lvB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#d49a1c"/></linearGradient></defs>' +
      '<path d="M22 2 L41 8 V25 C41 36 32 43 22 46 C12 43 3 36 3 25 V8 Z" fill="url(#lvG)" stroke="url(#lvB)" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M22 2 L22 8" stroke="url(#lvB)" stroke-width="3"/></svg>';
  }

  // ---- the card ---------------------------------------------------------------
  function mount(host, opts){
    opts = opts || {};
    var tap = opts.onTap || (opts.about ? openAbout : null);
    injectCss();
    if((' ' + host.className + ' ').indexOf(' lv-card ') < 0) host.className = (host.className ? host.className + ' ' : '') + 'lv-card';
    host.innerHTML =
      '<div class="lv-row"><span class="lv-label">Level</span>' +
      '<' + (tap ? 'button type="button"' : 'span') + ' class="lv-shield' + (tap ? ' lv-tap' : '') + '"' + (tap ? ' aria-label="About Level"' : '') + '>' + shieldSvg() + '<b>0</b></' + (tap ? 'button' : 'span') + '>' +
      '<div class="lv-bar"><div class="lv-fill"></div><div class="lv-text">(0) 0/150</div></div></div>';
    var btn = host.querySelector('.lv-shield'), num = host.querySelector('.lv-shield b'),
        fill = host.querySelector('.lv-fill'), txt = host.querySelector('.lv-text');
    var ctl = {
      info: null,
      update: function(info){
        if(!info) return;
        ctl.info = info;
        num.textContent = String(info.level);
        num.style.fontSize = String(info.level).length >= 3 ? '11px' : '15px';      // level 100 has three digits
        txt.textContent = format(info);
        fill.style.width = percent(info) + '%';
      }
    };
    if(tap) btn.addEventListener('click', function(e){ e.stopPropagation(); tap(); });
    return ctl;
  }

  // ---- About Level page ---------------------------------------------------------
  var about = null;
  function bar(title, got, cap, note){
    var pc = cap ? Math.min(100, got / cap * 100) : 0;
    return '<div class="lvab-item"><div class="lvab-line"><span>' + esc(title) + '</span><span>' + got + '/' + cap + '</span></div>' +
           '<div class="lvab-track"><i style="width:' + pc + '%"></i></div><div class="lvab-note">' + esc(note) + '</div></div>';
  }
  function renderAbout(data){
    var t = data.today || {}, lv = data.levels || [], me = data.info ? Number(data.info.level) : -1;
    var html =
      '<h4>Ways to Level Up</h4><div class="lvab-sub">(Refresh at 00:00 (GMT+5) daily)</div>' +
      '<div class="lvab-sec">Daily activities <em>(Daily Upper Limit: </em><b>' + (t.daily_cap || 85) + '</b><em> Exp)</em></div>' +
      bar('Daily login', t.login || 0, t.login_cap || 15, 'Open the app once a day / 15 Exp') +
      bar('Send messages to friends', t.sms || 0, t.sms_cap || 40, '1 message / 2 Exp') +
      bar('Sit on a seat in a room', t.seat || 0, t.seat_cap || 30, '1 minute / 3 Exp') +
      '<div class="lvab-note">Account creation bonus: 100 Exp (one time only)</div>' +
      '<div class="lvab-sec">Levels</div>';
    if(lv.length){
      html += '<table class="lvab-table"><tr><th>Level</th><th>Total Exp needed</th></tr>' +
        lv.map(function(r){ return '<tr' + (r.level === me ? ' class="me"' : '') + '><td>' + r.level + '</td><td>' + r.xp + '</td></tr>'; }).join('') + '</table>';
    }
    html += '<div class="lvab-foot">More ways to level up (games, gifts) will be added soon.</div>';
    about.body.innerHTML = html;
  }
  // the green popup shell: title, X, tap outside closes. Returns { back, body }.
  function buildPage(title){
    injectCss();
    if(about) closeAbout();
    var back = document.createElement('div');
    back.className = 'lvab-back';
    back.innerHTML = '<div class="lvab" role="dialog" aria-label="' + esc(title) + '"><div class="lvab-head">' + esc(title) + '<button type="button" class="lvab-x" aria-label="Close">✕</button></div><div class="lvab-body"></div></div>';
    document.body.appendChild(back);
    about = { back: back, body: back.querySelector('.lvab-body') };
    back.addEventListener('click', function(e){ if(e.target === back) closeAbout(); });   // tap outside closes it
    back.querySelector('.lvab-x').addEventListener('click', closeAbout);
    document.addEventListener('keydown', onKey);
    return about;
  }
  function openPage(title, render){
    var pg = buildPage(title);
    render(pg.body, function(){ return about === pg; });      // second argument: "is this popup still open?"
    return pg;
  }

  function openAbout(){
    buildPage('About Level');
    var data = { info: (mine.ctls[0] && mine.ctls[0].info) || null, today: null, levels: [] };
    renderAbout(data);
    var c = sb(); if(!c) return;
    Promise.all([
      Promise.resolve(c.rpc('xp_today')).then(function(r){ return r && r.data; }, function(){ return null; }),
      Promise.resolve(c.rpc('xp_levels')).then(function(r){ return r && r.data; }, function(){ return null; }),
      Promise.resolve(c.rpc('get_xp')).then(function(r){ return r && r.data; }, function(){ return null; })
    ]).then(function(res){
      if(!about) return;
      if(res[0]) data.today = res[0];
      if(res[1]) data.levels = res[1];
      if(res[2]) data.info = res[2];
      renderAbout(data);
    });
  }
  function onKey(e){ if(e.key === 'Escape') closeAbout(); }
  function closeAbout(){
    if(!about) return;
    document.removeEventListener('keydown', onKey);
    if(about.back.parentNode) about.back.parentNode.removeChild(about.back);
    about = null;
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
      var ctl = host.__lv || (host.__lv = mount(host, { about: false }));
      ctl.update(r.data);
    }, function(){ host.style.display = 'none'; });
  }

  root.Levels = { format: format, percent: percent, mount: mount, startMine: startMine, refreshMine: refreshMine, showFor: showFor, openAbout: openAbout, openPage: openPage, closePage: closeAbout, barHtml: bar, esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
