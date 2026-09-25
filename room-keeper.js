/*
  room-keeper.js — Back-button rules, "Keep" (Kept Room card) and room presence.

  Included on every page. What it does:
   - On the ROOM page: the phone's Back button does nothing (the person stays in the room).
   - On every OTHER page: 1st Back shows "press Back again", 2nd Back goes back normally.
   - KEEP: the person leaves the room screen but stays in the room (seat, presence, chat kept).
     A floating "Kept Room" card appears on the other pages; tapping it returns to the same room.
   - While a room is kept, this page sends a heartbeat so the server knows the website is still open.
     If the website/tab is closed the heartbeat stops and the server frees the seat and clears the chat.
   - A brand-new visit to the website (new tab/session) never resumes an old room.
   - NETWORK WATCH (every page). Clock starts at the first bad check:
       * 6 s   : inside the room a "Loading..." screen covers it; on other pages every button/link shows
                 "Please check your network connection" instead of acting.
       * 15 s  : the person's SEAT is freed (still in the room; back on the seat only if the net returned before this).
       * 30 s  : the person leaves the ROOM completely (presence gone, chat view cleared). Coming back = a fresh entry
                 through the Room card, no message, no seat.
     The server enforces the same 15 s / 30 s when the heartbeat goes silent (website closed, phone offline).
   - Closing the website/tab: the page says "goodbye" on the way out; unless the next page announces itself within
     6 seconds the server removes the person from seat AND room at once (no 15/30 s wait).
   - The room page is only ever entered through openRoom() (Room card or Kept Room card),
     so the browser's Back/Forward can never reopen a room by itself.
*/
(function(){
  'use strict';

  var K_ENTRY = 'kr_entry';   // the room this tab is allowed to be inside right now
  var K_KEPT  = 'kr_kept';    // JSON {id,name,picture,seat} while a room is kept
  var K_INIT  = 'kr_init';    // set once this tab-session has done its start-up cleanup
  var HEARTBEAT_MS = 4000;
  var BACK_WINDOW_MS = 2500;
  var BACK_MSG = 'ایک بار پھر Back دبائیں، website سے باہر جانے کے لیے۔';
  var isRoomPage = /(^|\/)chatroom\.html$/.test(location.pathname);

  function ssGet(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } }
  function ssSet(k, v){ try{ sessionStorage.setItem(k, v); }catch(e){} }
  function ssDel(k){ try{ sessionStorage.removeItem(k); }catch(e){} }
  function getKept(){ try{ return JSON.parse(ssGet(K_KEPT) || 'null'); }catch(e){ return null; } }
  // supabaseClient is a top-level const in supabase-config.js (not a window property), so look it up by name
  function client(){ try{ return (typeof supabaseClient !== 'undefined') ? supabaseClient : null; }catch(e){ return null; } }

  // ---------- small UI pieces (toast + confirm) ----------
  var CSS = '' +
    '#kr-toast{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:100000;max-width:88vw;' +
    'background:rgba(20,32,28,0.94);color:#fff;padding:11px 18px;border-radius:14px;font-size:0.9rem;line-height:1.5;' +
    'direction:rtl;text-align:center;opacity:0;pointer-events:none;transition:opacity .2s;' +
    'font-family:"Noto Nastaliq Urdu","Noto Naskh Arabic","Jameel Noori Nastaleeq",system-ui,sans-serif;}' +
    '#kr-toast.show{opacity:1;}' +
    '#kr-card{position:fixed;z-index:99990;width:132px;padding:20px 8px 8px;border-radius:16px;cursor:pointer;touch-action:none;' +
    'background:linear-gradient(160deg,#0d4a3b 0%,#0a2f27 100%);border:1.5px solid rgba(60,220,170,0.55);' +
    'box-shadow:0 8px 24px rgba(0,0,0,0.35);color:#fff;font-family:Inter,system-ui,sans-serif;user-select:none;-webkit-user-select:none;}' +
    '#kr-card .kr-x{position:absolute;top:-9px;right:-9px;width:26px;height:26px;border-radius:50%;border:none;cursor:pointer;' +
    'background:#0a2f27;color:#fff;font-size:14px;line-height:1;border:1.5px solid rgba(255,255,255,0.75);padding:0;}' +
    '#kr-card .kr-row{display:flex;align-items:center;justify-content:center;gap:6px;height:58px;}' +
    '#kr-card .kr-img{width:56px;height:56px;border-radius:14px;overflow:hidden;flex-shrink:0;background:rgba(255,255,255,0.12);' +
    'display:flex;align-items:center;justify-content:center;font-size:26px;border:1.5px solid rgba(255,255,255,0.35);}' +
    '#kr-card .kr-img img{width:100%;height:100%;object-fit:cover;display:block;}' +
    '#kr-card .kr-bars{display:flex;align-items:center;gap:2px;height:26px;}' +
    '#kr-card .kr-bars i{display:block;width:3px;border-radius:2px;background:#3cdcaa;height:8px;animation:krbar 1s ease-in-out infinite;}' +
    '#kr-card .kr-bars i:nth-child(2){animation-delay:.2s;}#kr-card .kr-bars i:nth-child(3){animation-delay:.4s;}' +
    '@keyframes krbar{0%,100%{height:6px;}50%{height:22px;}}' +
    '@media (prefers-reduced-motion:reduce){#kr-card .kr-bars i{animation:none;}}' +
    '#kr-card .kr-name{margin-top:6px;text-align:center;font-weight:700;font-size:0.8rem;color:#ffd24d;' +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '#kr-card .kr-sub{text-align:center;font-size:0.66rem;color:rgba(255,255,255,0.75);margin-top:1px;' +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '#kr-card .kr-live{position:absolute;top:5px;left:10px;font-size:0.58rem;font-weight:700;letter-spacing:.04em;color:#3cdcaa;}' +
    '#kr-net-toast{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:100003;width:max-content;max-width:86vw;' +
    'background:rgba(15,20,18,0.88);color:#fff;font-weight:700;font-size:1.02rem;line-height:1.4;text-align:center;' +
    'padding:16px 22px;border-radius:14px;opacity:0;pointer-events:none;transition:opacity .15s;font-family:Inter,system-ui,sans-serif;}' +
    '#kr-net-toast.show{opacity:1;}' +
    '#kr-loading{position:fixed;inset:0;z-index:100002;background:rgba(6,16,13,0.76);display:none;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:14px;color:#fff;font-family:Inter,system-ui,sans-serif;font-weight:600;font-size:1rem;}' +
    '#kr-loading.show{display:flex;}' +
    '#kr-loading .kr-spin{width:38px;height:38px;border-radius:50%;border:4px solid rgba(255,255,255,0.25);border-top-color:#3cdcaa;animation:krspin .8s linear infinite;}' +
    '@keyframes krspin{to{transform:rotate(360deg);}}' +
    '@media (prefers-reduced-motion:reduce){#kr-loading .kr-spin{animation-duration:2.4s;}}' +
    '#kr-dialog{position:fixed;inset:0;z-index:100001;background:rgba(10,25,20,0.6);display:none;align-items:center;justify-content:center;padding:24px;}' +
    '#kr-dialog.show{display:flex;}' +
    '#kr-dialog .kr-box{width:100%;max-width:330px;background:#fff;color:#1a2b26;border-radius:16px;padding:20px;font-family:Inter,system-ui,sans-serif;}' +
    '#kr-dialog h3{margin:0 0 8px;font-size:1.05rem;}' +
    '#kr-dialog p{margin:0;font-size:0.86rem;line-height:1.45;color:#5b6e68;}' +
    '#kr-dialog .kr-actions{display:flex;gap:10px;margin-top:16px;}' +
    '#kr-dialog button{flex:1;border:none;border-radius:12px;padding:12px;font-weight:600;font-size:0.9rem;cursor:pointer;font-family:inherit;}' +
    '#kr-dialog .kr-no{background:#eef3f1;color:#5b6e68;}#kr-dialog .kr-yes{background:#05846a;color:#fff;}';

  function injectCss(){
    if(document.getElementById('kr-style')) return;
    var st = document.createElement('style');
    st.id = 'kr-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  var toastTimer = null;
  function showBackToast(){
    injectCss();
    var t = document.getElementById('kr-toast');
    if(!t){ t = document.createElement('div'); t.id = 'kr-toast'; document.body.appendChild(t); }
    t.textContent = BACK_MSG;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.classList.remove('show'); }, BACK_WINDOW_MS);
  }

  function ask(title, text, yesLabel){
    injectCss();
    return new Promise(function(resolve){
      var d = document.getElementById('kr-dialog');
      if(!d){
        d = document.createElement('div');
        d.id = 'kr-dialog';
        d.innerHTML = '<div class="kr-box" role="dialog" aria-modal="true"><h3></h3><p></p>' +
          '<div class="kr-actions"><button type="button" class="kr-no">Cancel</button><button type="button" class="kr-yes"></button></div></div>';
        document.body.appendChild(d);
      }
      d.querySelector('h3').textContent = title;
      d.querySelector('p').textContent = text;
      d.querySelector('.kr-yes').textContent = yesLabel || 'OK';
      function done(v){ d.classList.remove('show'); resolve(v); }
      d.querySelector('.kr-no').onclick = function(){ done(false); };
      d.querySelector('.kr-yes').onclick = function(){ done(true); };
      d.onclick = function(e){ if(e.target === d) done(false); };
      d.classList.add('show');
    });
  }

  // ---------- Back button: every page except the room ----------
  var lastBackAt = 0;
  function startPageBackGuard(){
    var s = history.state;
    if(!(s && s.kr === 'top')){
      history.replaceState({ kr: 'base' }, '');
      history.pushState({ kr: 'top' }, '');
    }
    window.addEventListener('popstate', function(e){
      var st = e.state;
      if(!st || st.kr !== 'base') return;            // moved onto our own top entry, or not ours
      var now = Date.now();
      if(now - lastBackAt < BACK_WINDOW_MS){         // second press: a normal Back
        lastBackAt = 0;
        history.back();
        return;
      }
      lastBackAt = now;                              // first press: warn and stay
      showBackToast();
      history.pushState({ kr: 'top' }, '');
    });
  }

  // ---------- Back button: inside the room (does nothing) ----------
  var leavingRoomPage = false;
  var pendingUrl = null;
  function startRoomBackGuard(){
    var s = history.state;
    if(!(s && s.kr === 'room-top')){
      history.replaceState({ kr: 'room-base' }, '');
      history.pushState({ kr: 'room-top' }, '');
    }
    window.addEventListener('popstate', function(e){
      if(leavingRoomPage){
        var u = pendingUrl; pendingUrl = null;
        if(u) location.replace(u);
        return;
      }
      var st = e.state;
      if(!st || st.kr !== 'room-top') history.pushState({ kr: 'room-top' }, '');   // swallow the Back press
    });
  }

  // Leave the room page without leaving the room's history entries behind, so Back can never reopen it.
  function navigateAwayFromRoom(url){
    leavingRoomPage = true;
    pendingUrl = url;
    var s = history.state;
    if(s && s.kr === 'room-top'){
      history.back();                                   // drop our top entry; the popstate handler then replaces the base entry
      setTimeout(function(){ if(pendingUrl){ var u = pendingUrl; pendingUrl = null; location.replace(u); } }, 500);
    } else {
      pendingUrl = null;
      location.replace(url);
    }
  }

  // ---------- entering / leaving rooms ----------
  function serverLeave(roomId){
    var c = client();
    if(!c) return Promise.resolve();
    return Promise.resolve(c.rpc('room_leave', { p_room: String(roomId) })).catch(function(){});
  }

  function openRoom(roomId){
    if(netBad){ showNetToast(); return Promise.resolve(); }
    var id = String(roomId == null || roomId === '' ? '111' : roomId);
    var kept = getKept();
    var go = function(){
      ssSet(K_ENTRY, id);
      ssDel(K_KEPT);
      location.replace('chatroom.html?room=' + encodeURIComponent(id));
    };
    if(kept && String(kept.id) !== id){
      return ask('You are already in another room',
        'Leave "' + (kept.name || 'your kept room') + '" and join this one? You will give up your seat there.',
        'Leave & join').then(function(yes){
          if(!yes) return;
          return serverLeave(kept.id).then(function(){ ssDel(K_KEPT); removeCard(); go(); });
        });
    }
    go();
    return Promise.resolve();
  }

  // room page: is this tab allowed to be here?
  function enterGuard(roomId){
    if(ssGet(K_ENTRY) === String(roomId)) return true;
    location.replace('home.html');
    return false;
  }

  // KEEP: stay in the room, leave the screen
  function keepAndLeave(info, url){
    ssSet(K_KEPT, JSON.stringify({ id: String(info.id), name: info.name || '', picture: info.picture || '', seat: info.seat || null }));
    ssDel(K_ENTRY);
    navigateAwayFromRoom(url || 'home.html');
  }

  // EXIT: leave completely
  function exitAndLeave(url){
    ssDel(K_ENTRY);
    ssDel(K_KEPT);
    navigateAwayFromRoom(url || 'home.html');
  }

  // ---------- Kept Room card ----------
  function removeCard(){
    var c = document.getElementById('kr-card');
    if(c && c.parentNode) c.parentNode.removeChild(c);
  }
  function endKept(){
    ssDel(K_KEPT);
    removeCard();
  }

  function loadPos(){
    try{ return JSON.parse(localStorage.getItem('kr_pos') || 'null'); }catch(e){ return null; }
  }
  function placeCard(card, x, y){
    var w = card.offsetWidth || 132, h = card.offsetHeight || 110;
    x = Math.min(Math.max(6, x), window.innerWidth - w - 6);
    y = Math.min(Math.max(6, y), window.innerHeight - h - 6);
    card.style.left = x + 'px';
    card.style.top = y + 'px';
    return { x: x, y: y };
  }

  function renderCard(){
    var kept = getKept();
    if(!kept){ removeCard(); return; }
    injectCss();
    var card = document.getElementById('kr-card');
    if(!card){
      card = document.createElement('div');
      card.id = 'kr-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.innerHTML =
        '<button type="button" class="kr-x" aria-label="Leave this room">✕</button>' +
        '<div class="kr-live">● LIVE</div>' +
        '<div class="kr-row"><div class="kr-bars"><i></i><i></i><i></i></div><div class="kr-img"></div><div class="kr-bars"><i></i><i></i><i></i></div></div>' +
        '<div class="kr-name"></div><div class="kr-sub"></div>';
      document.body.appendChild(card);

      var pos = loadPos();
      var startX = pos ? pos.x : 10;
      var startY = pos ? pos.y : Math.max(90, window.innerHeight - 250);
      placeCard(card, startX, startY);

      // tap = go back to the room, drag = move the card
      var drag = null;
      card.addEventListener('pointerdown', function(e){
        if(e.target.closest && e.target.closest('.kr-x')) return;
        drag = { sx: e.clientX, sy: e.clientY, cx: card.offsetLeft, cy: card.offsetTop, moved: false };
        try{ card.setPointerCapture(e.pointerId); }catch(err){}
      });
      card.addEventListener('pointermove', function(e){
        if(!drag) return;
        var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if(!drag.moved && Math.abs(dx) + Math.abs(dy) < 8) return;
        drag.moved = true;
        placeCard(card, drag.cx + dx, drag.cy + dy);
      });
      function finish(e){
        if(!drag) return;
        var d = drag; drag = null;
        if(d.moved){
          try{ localStorage.setItem('kr_pos', JSON.stringify({ x: card.offsetLeft, y: card.offsetTop })); }catch(err){}
        } else if(!(e.target.closest && e.target.closest('.kr-x'))){
          var k = getKept();
          if(k) openRoom(k.id);
        }
      }
      card.addEventListener('pointerup', finish);
      card.addEventListener('pointercancel', function(){ drag = null; });
      card.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){ var k = getKept(); if(k) openRoom(k.id); }
      });
      card.querySelector('.kr-x').addEventListener('click', function(e){
        e.stopPropagation();
        ask('Leave this room?', 'You will leave your seat and the chat you saw here will be cleared. You can join again any time.', 'Leave room')
          .then(function(yes){
            if(!yes) return;
            var k = getKept();
            var done = function(){ endKept(); };
            if(k) serverLeave(k.id).then(done); else done();
          });
      });
    }
    card.querySelector('.kr-name').textContent = kept.name || 'Room';
    card.querySelector('.kr-sub').textContent = 'ID ' + kept.id + (kept.seat ? ' · Seat ' + kept.seat : ' · Tap to return');
    var img = card.querySelector('.kr-img');
    img.textContent = '';
    if(kept.picture){
      var im = document.createElement('img');
      im.alt = '';
      im.src = kept.picture;
      img.appendChild(im);
    } else {
      img.textContent = '👥';
    }
  }

  // refresh the card's name/picture/seat from the database (best effort)
  function refreshKeptInfo(){
    var c = client(), kept = getKept();
    if(!c || !kept) return;
    Promise.resolve(c.from('rooms').select('name, picture_url').eq('id', String(kept.id)).maybeSingle()).then(function(r){
      var room = r && r.data;
      var cur = getKept();
      if(room && cur && String(cur.id) === String(kept.id)){   // (the kept room may have ended while we were asking)
        cur.name = room.name || cur.name;
        cur.picture = room.picture_url || '';
        ssSet(K_KEPT, JSON.stringify(cur));
        renderCard();
      }
    }).catch(function(){});
    c.auth.getSession().then(function(res){
      var uid = res && res.data && res.data.session && res.data.session.user.id;
      if(!uid) return null;
      return c.from('room_seats').select('seat_number').eq('room_id', String(kept.id)).eq('occupied_by', uid).limit(1);
    }).then(function(r){
      if(!r) return;
      var k = getKept();
      if(!k) return;
      k.seat = (r.data && r.data[0]) ? r.data[0].seat_number : null;
      ssSet(K_KEPT, JSON.stringify(k));
      renderCard();
    }).catch(function(){});
  }

  // heartbeat while a room is kept: tells the server "the website is still open"
  var beatCount = 0;
  function beat(){
    var kept = getKept(), c = client();
    if(!kept || !c) return;
    Promise.resolve(c.rpc('room_heartbeat', { p_room: String(kept.id), p_status: 'kept' })).then(function(r){
      if(r && r.error) return;                       // network / function not installed: keep trying
      if(r && r.data === false){                      // server already ended this room session (no signal for a while)
        endKept();                                    // silent: coming back = Room card, a fresh entry
        return;
      }
      beatCount++;
      if(beatCount % 4 === 0) refreshKeptInfo();
    }).catch(function(){});
  }

  // ---------- a brand-new visit never resumes an old room ----------
  function clearLocalChatCaches(){
    try{
      for(var i = localStorage.length - 1; i >= 0; i--){
        var k = localStorage.key(i);
        if(k && k.indexOf('room-messages-cache-') === 0) localStorage.removeItem(k);
      }
    }catch(e){}
  }
  function freshSessionCleanup(){
    var c = client();
    if(!c || ssGet(K_INIT)) return Promise.resolve();
    return c.auth.getSession().then(function(res){
      var session = res && res.data && res.data.session;
      if(!session) return;                            // not logged in yet — try again on the next page
      ssSet(K_INIT, '1');
      if(getKept() || ssGet(K_ENTRY)) return;
      clearLocalChatCaches();
      return c.rpc('room_leave_all');
    }).catch(function(){});
  }

  // ---------- network watch ----------
  // Every few seconds a tiny request to the server measures the connection. A check is "bad" when there is no
  // answer or it takes longer than 2.5 s. The outage clock starts at the first bad check and ends after two
  // good checks in a row.
  var NET_PROBE_EVERY = 3000, NET_SLOW_MS = 2500, NET_TIMEOUT_MS = 5000;
  var LOADING_AT_MS = 6000, SEAT_AT_MS = 15000, EXIT_AT_MS = 30000;
  var NET_MSG = 'Please check your network connection';
  var netBad = false;                 // true once the outage is 6 s old (this is what shows "Loading..." / blocks buttons)
  var outageStart = 0, goodStreak = 0, probeBusy = false, netListeners = [];
  var seatFreedThisOutage = false, exitedThisOutage = false;

  function outageMs(){ return outageStart ? Date.now() - outageStart : 0; }

  var netToastTimer = null;
  function showNetToast(msg){
    injectCss();
    var t = document.getElementById('kr-net-toast');
    if(!t){ t = document.createElement('div'); t.id = 'kr-net-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg || NET_MSG;
    t.classList.add('show');
    clearTimeout(netToastTimer);
    netToastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2400);
  }

  function showLoading(on){
    injectCss();
    var o = document.getElementById('kr-loading');
    if(!o){
      if(!on) return;
      o = document.createElement('div');
      o.id = 'kr-loading';
      o.setAttribute('role', 'status');
      o.setAttribute('aria-live', 'polite');
      o.innerHTML = '<div class="kr-spin"></div><div>Loading...</div>';
      document.body.appendChild(o);
    }
    o.classList.toggle('show', !!on);
  }

  function notifyNet(bad, duration){
    netListeners.slice().forEach(function(fn){ try{ fn({ bad: bad, duration: duration || 0 }); }catch(e){} });
  }

  function setBadUi(bad){
    if(bad === netBad) return;
    netBad = bad;
    if(isRoomPage) showLoading(bad);                       // in the room: cover it with "Loading..."
  }

  function record(ok){
    if(ok){
      goodStreak++;
      if(outageStart && goodStreak >= 2){                  // the outage is over
        var total = Date.now() - outageStart;
        outageStart = 0; seatFreedThisOutage = false; exitedThisOutage = false;
        var wasBad = netBad;
        setBadUi(false);
        notifyNet(false, total);                           // (short blips under 6 s change nothing on screen)
        if(!wasBad && total < LOADING_AT_MS) return;
      }
    } else {
      goodStreak = 0;
      if(!outageStart) outageStart = Date.now();
    }
  }

  function slowType(){
    var c = navigator.connection;
    return !!(c && (c.effectiveType === 'slow-2g' || c.effectiveType === '2g'));
  }

  function probe(){
    if(probeBusy) return;
    if(navigator.onLine === false){ record(false); return; }
    var base = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : null;
    if(!base) return;
    var key = (typeof SUPABASE_ANON_KEY !== 'undefined') ? SUPABASE_ANON_KEY : '';
    probeBusy = true;
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function(){ if(ctrl) ctrl.abort(); }, NET_TIMEOUT_MS);
    var t0 = Date.now();
    fetch(base + '/auth/v1/health?apikey=' + encodeURIComponent(key) + '&_=' + t0,
          { mode: 'no-cors', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function(){ record((Date.now() - t0) <= NET_SLOW_MS && !slowType()); })
      .catch(function(){ record(false); })
      .then(function(){ clearTimeout(timer); probeBusy = false; });
  }

  // outside the room: while the network is bad no button/link/form does anything — it just says so
  function interceptClicks(){
    document.addEventListener('click', function(e){
      if(!netBad) return;
      var el = e.target && e.target.closest
        ? e.target.closest('button,a,[onclick],[role="button"],select,summary,label,input[type="submit"],input[type="checkbox"],input[type="radio"],input[type="file"]')
        : null;
      if(!el) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      showNetToast();
    }, true);
    document.addEventListener('submit', function(e){
      if(!netBad) return;
      e.preventDefault(); e.stopPropagation();
      showNetToast();
    }, true);
  }

  // A kept room on another page follows the same 15 s / 30 s rules while the network is down
  function keptRoomOutageRules(ms){
    var kept = getKept(), c = client();
    if(!kept || !c) return;
    if(ms >= SEAT_AT_MS && !seatFreedThisOutage){
      seatFreedThisOutage = true;
      c.auth.getSession().then(function(res){
        var uid = res && res.data && res.data.session && res.data.session.user.id;
        if(uid) return c.from('room_seats').update({ occupied_by: null }).eq('room_id', String(kept.id)).eq('occupied_by', uid);
      }).catch(function(){});
      kept.seat = null; ssSet(K_KEPT, JSON.stringify(kept)); renderCard();
    }
    if(ms >= EXIT_AT_MS && !exitedThisOutage){
      exitedThisOutage = true;
      serverLeave(kept.id);
      endKept();                                            // the card goes; coming back = Room card, fresh entry
    }
  }

  var netStarted = false;
  function startNet(){
    if(netStarted) return;
    netStarted = true;
    window.addEventListener('offline', function(){ goodStreak = 0; if(!outageStart) outageStart = Date.now(); });
    window.addEventListener('online', probe);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) probe(); });
    if(navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener('change', probe);
    setInterval(function(){ if(!document.hidden) probe(); }, NET_PROBE_EVERY);
    // one-second clock: turns the outage age into "Loading..." (6 s) and the kept-room rules (15 s / 30 s)
    setInterval(function(){
      var ms = outageMs();
      if(!ms) return;
      if(ms >= LOADING_AT_MS && !netBad){ setBadUi(true); notifyNet(true, 0); }
      if(!isRoomPage) keptRoomOutageRules(ms);
    }, 1000);
    if(navigator.onLine === false){ goodStreak = 0; outageStart = Date.now(); }
    probe();
  }

  // ---------- "goodbye" when the page goes away ----------
  // Runs on any page unload (tab closed, website closed, or a move to another page). The server only acts on it if
  // the next page does not announce itself (heartbeat / room_enter) within 6 seconds — so a normal move between
  // pages is harmless, while a closed website frees the seat and the room right away.
  function cacheToken(){
    var c = client();
    if(!c) return;
    c.auth.getSession().then(function(res){
      var s = res && res.data && res.data.session;
      if(s) ssSet('kr_tok', s.access_token);
    }).catch(function(){});
  }
  function sendGoodbye(){
    var kept = getKept();
    var room = ssGet(K_ENTRY) || (kept && kept.id);
    var tok = ssGet('kr_tok');
    if(!room || !tok || typeof SUPABASE_URL === 'undefined') return;
    try{
      fetch(SUPABASE_URL + '/rest/v1/rpc/room_grace', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', 'apikey': (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : ''), 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ p_room: String(room) })
      }).catch(function(){});
    }catch(e){}
  }
  var goodbyeStarted = false;
  function startGoodbye(){
    if(goodbyeStarted) return;
    goodbyeStarted = true;
    cacheToken();
    setInterval(cacheToken, 30000);
    window.addEventListener('pagehide', sendGoodbye);
  }

  // ---------- start-up ----------
  function initPage(){
    startPageBackGuard();
    startNet();
    startGoodbye();
    interceptClicks();
    ssDel('kr_notice');
    // if this tab still says it is "inside" a room but we are on another page, it left without Keep/Exit
    if(ssGet(K_ENTRY)) ssDel(K_ENTRY);
    var c = client();
    if(c){
      freshSessionCleanup().then(function(){
        if(getKept()){ renderCard(); refreshKeptInfo(); beat(); }
      });
    }
    setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) beat(); });
    window.addEventListener('resize', function(){
      var card = document.getElementById('kr-card');
      if(card) placeCard(card, card.offsetLeft, card.offsetTop);
    });
    // the card also appears right after Keep when this page is loaded from cache/back-forward
    window.addEventListener('pageshow', function(e){ if(e.persisted) renderCard(); });
  }

  window.RoomKeeper = {
    openRoom: openRoom,
    enterGuard: enterGuard,
    startRoomBackGuard: startRoomBackGuard,
    keepAndLeave: keepAndLeave,
    exitAndLeave: exitAndLeave,
    getKept: getKept,
    isRoomPage: isRoomPage,
    net: {
      isBad: function(){ return netBad; },
      outageMs: outageMs,
      onChange: function(fn){ netListeners.push(fn); },
      toast: showNetToast
    }
  };

  if(isRoomPage){
    var startRoomWatch = function(){ startNet(); startGoodbye(); };
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startRoomWatch);
    else startRoomWatch();
  } else {
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPage);
    else initPage();
  }
})();
