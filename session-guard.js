/* ============================================================================
   session-guard.js  —  an account works on ONE device at a time.

   How: the device that logs in (or opens the app first after this feature was added) "claims" the account in
   the database with a random code kept on that device only. Any other device that sees a different code logs
   itself out at once (live) and lands on the login page with a message. The new device also asks Supabase to
   cancel the old device's login (signOut scope 'others').

   Needs sql-16-single-device.sql. Loaded on home, chatroom and inbox (not on the login page).
   ========================================================================== */
(function(root){
  'use strict';
  var KEY = 'device-token';
  var started = false, ended = false, uid = null;
  var pollMs = 45000;

  function sb(){ return (typeof supabaseClient !== 'undefined') ? supabaseClient : null; }   // top-level const in supabase-config.js
  function getToken(){ try{ return localStorage.getItem(KEY); }catch(e){ return null; } }
  function setToken(t){ try{ localStorage.setItem(KEY, t); }catch(e){} }
  function newToken(){
    try{ if(root.crypto && crypto.randomUUID) return crypto.randomUUID() + '-' + Date.now().toString(36); }catch(e){}
    return 'd' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function deviceName(){
    var ua = (navigator.userAgent || '').replace(/\s+/g, ' ');
    var os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Device';
    var br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return os + ' · ' + br;
  }

  // this device becomes the active one
  function claim(existing){
    var c = sb(); if(!c) return Promise.resolve();
    var t = existing || newToken();
    setToken(t);
    return Promise.resolve(c.rpc('claim_session', { p_token: t, p_device: deviceName() })).then(function(r){
      if(r && r.error) return;                                      // could not claim: stay as we are
      try{ return Promise.resolve(c.auth.signOut({ scope: 'others' })).catch(function(){}); }catch(e){}   // cancel the other devices' logins at Supabase
    }, function(){});
  }

  // another device took over: leave everything and go to the login page
  function kicked(){
    if(ended) return; ended = true;
    var c = sb();
    var url = 'index.html?kicked=1';
    Promise.resolve(c ? c.rpc('room_leave_all') : null).catch(function(){}).then(function(){
      try{ localStorage.removeItem(KEY); }catch(e){}
      try{ sessionStorage.removeItem('kr_kept'); sessionStorage.removeItem('kr_entry'); }catch(e){}
      return c ? Promise.resolve(c.auth.signOut({ scope: 'local' })).catch(function(){}) : null;
    }).then(function(){
      try{ if(root.top !== root && root.top.AppShell){ root.top.AppShell.closeRoom(url); return; } }catch(e){}   // also closes a kept room (voice stops)
      location.replace(url);
    });
  }

  function check(){
    var c = sb(); if(!c || ended || !uid) return Promise.resolve();
    var t = getToken();
    if(!t) return claim();                                           // first time on this device (or just logged in)
    return Promise.resolve(c.rpc('session_status', { p_token: t })).then(function(r){
      if(!r || r.error) return;                                      // no answer (offline): do nothing
      if(r.data === 'other') kicked();
      else if(r.data === 'none') claim(t);                           // nobody has claimed yet: keep my code
    }, function(){});
  }

  function start(){
    var c = sb(); if(!c || started) return;
    Promise.resolve(c.auth.getSession()).then(function(r){
      var s = r && r.data && r.data.session;
      if(!s || started) return;
      started = true; uid = s.user.id;
      check();
      try{
        c.channel('session-' + uid)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'active_session', filter: 'user_id=eq.' + uid }, function(p){
            var row = p && p.new;
            if(row && row.token && row.token !== getToken()) kicked();   // someone else claimed it
          }).subscribe();
      }catch(e){}
      setInterval(check, root.__sessionGuardPollMs || pollMs);          // safety net if the live signal is missed
      document.addEventListener('visibilitychange', function(){ if(!document.hidden) check(); });
      root.addEventListener('pageshow', check);
      root.addEventListener('online', check);
    }, function(){});
  }

  root.SessionGuard = { start: start, check: check, claim: claim, kicked: kicked };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);
