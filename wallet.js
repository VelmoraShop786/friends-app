/* ============================================================================
   wallet.js  —  the person's own coins + diamonds.
   Needs sql-21-wallet.sql. If it was not run, nothing shows and nothing breaks.

   Wallet.start(userId)  : gives today's daily coins / welcome bonus (the database decides), then keeps the numbers live
   Wallet.onChange(fn)   : fn({ coins, diamonds }) runs now (if known) and whenever the numbers change
   Wallet.get()          : { coins, diamonds } or null while unknown
   Wallet.chips()        : small html for two chips (coin + diamond)
   Wallet.fmt(n)         : 1234 -> "1,234"   |   Wallet.short(n) : 1500 -> "1.5K", 100000000 -> "100M"
   ============================================================================ */
(function(root){
  'use strict';
  var state = null, subs = [], started = false, uid = null, channel = null;
  function sb(){ return (typeof supabaseClient !== 'undefined') ? supabaseClient : null; }
  function fmt(n){ return Number(n || 0).toLocaleString('en-US'); }
  // short form for the small chips: 999, 1.5K, 12.3K, 1.2M, 100M, 2.5B, 1T (cut, never rounded up)
  function short(n){
    n = Math.floor(Number(n || 0));
    if(n < 1000) return String(n);
    var u = [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]];
    for(var i = 0; i < u.length; i++){
      if(n >= u[i][1]){ var v = Math.floor(n / u[i][1] * 10) / 10; return String(v).replace(/\.0$/, '') + u[i][0]; }
    }
    return String(n);
  }

  var COIN = '<svg class="wl-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#f5b50a"/><circle cx="12" cy="12" r="7.2" fill="#ffd84d" stroke="#c98a00" stroke-width="1.4"/><path d="M12 7.6v8.8M9.6 10.2c0-1 1-1.6 2.4-1.6s2.4.6 2.4 1.5c0 2-4.8 1.1-4.8 3.2 0 .9 1 1.5 2.4 1.5s2.4-.6 2.4-1.5" fill="none" stroke="#a56d00" stroke-width="1.3" stroke-linecap="round"/></svg>';
  var GEM  = '<svg class="wl-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z" fill="#35b8ff"/><path d="M2 9h20M9 3l-2 6 5 12M15 3l2 6-5 12" fill="none" stroke="#0b7fc4" stroke-width="1.2" stroke-linejoin="round"/><path d="M6 3l3 6h6l3-6z" fill="#8fdcff"/></svg>';

  function paint(info){
    if(!info) return;
    state = { coins: Number(info.coins || 0), diamonds: Number(info.diamonds || 0) };
    try{ localStorage.setItem('wallet-cache-' + uid, JSON.stringify(state)); }catch(e){}
    subs.slice().forEach(function(fn){ try{ fn(state); }catch(e){} });
  }
  function refresh(){
    var c = sb(); if(!c || !uid) return Promise.resolve();
    return Promise.resolve(c.rpc('get_wallet')).then(function(r){ if(r && r.data) paint(r.data); }, function(){});
  }
  function start(userId){
    uid = userId;
    try{ var cached = JSON.parse(localStorage.getItem('wallet-cache-' + userId) || 'null'); if(cached) paint(cached); }catch(e){}
    var c = sb(); if(!c || started) return Promise.resolve();
    started = true;
    // welcome bonus / daily coins / level rewards are decided by the database; calling again the same day adds nothing
    var done = Promise.resolve(c.rpc('wallet_checkin')).then(function(r){ if(r && r.data) paint(r.data); }, function(){});
    try{
      channel = c.channel('wallet-' + userId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: 'user_id=eq.' + userId }, refresh)
        .subscribe();
    }catch(e){}
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) refresh(); });
    window.addEventListener('pageshow', refresh);
    return done;
  }
  function onChange(fn){ if(typeof fn !== 'function') return; subs.push(fn); if(state) fn(state); }
  function get(){ return state; }
  function chips(){
    if(!state) return '';
    return '<span class="wl-chip">' + COIN + '<b>' + short(state.coins) + '</b></span><span class="wl-chip">' + GEM + '<b>' + short(state.diamonds) + '</b></span>';
  }
  root.Wallet = { start: start, refresh: refresh, onChange: onChange, get: get, chips: chips, fmt: fmt, short: short, coinSvg: COIN, gemSvg: GEM };
})(typeof window !== 'undefined' ? window : globalThis);
