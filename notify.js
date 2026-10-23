/* ============================================================================
   notify.js  —  the red numbers (unread friend messages, friend requests, System notifications)

   One call (get_unread_summary) gives everything; it is refreshed when something arrives (live),
   when the app comes back to the front, and every 45 seconds as a safety net.
   Used by home.html (nav badge, Messages list), chatroom.html (message icon) and inbox.html (marks chats read).
   Needs: supabase-config.js + sql-8-notifications-and-unread.sql  (without the SQL every number is simply 0).
   ========================================================================== */
(function(root){
  'use strict';
  var state = { messages: {}, system: 0, requests: 0, latestSystem: null, messageTotal: 0, total: 0, ready: false };
  var raw = { system: 0, requests: 0 };                       // what the database says; state.* below is what the person chose to see
  // Settings > Notifications saves {messages, requests, system} here (false = do not show those red numbers)
  function prefs(){ try{ return JSON.parse(localStorage.getItem('notify-prefs-v1') || '{}') || {}; }catch(err){ return {}; } }
  var listeners = [];
  var myId = null;
  var timer = null;

  function sb(){ return root.supabaseClient || (typeof supabaseClient !== "undefined" ? supabaseClient : null); }   // supabase-config.js declares it with const, so it is NOT on window
  function recompute(){
    var pf = prefs(), n = 0;
    if(pf.messages !== false) Object.keys(state.messages).forEach(function(k){ n += Number(state.messages[k]) || 0; });
    state.messageTotal = n;
    state.system = pf.system === false ? 0 : (Number(raw.system) || 0);
    state.requests = pf.requests === false ? 0 : (Number(raw.requests) || 0);
    state.total = n + state.system + state.requests;
  }
  function emit(){ listeners.forEach(function(fn){ try{ fn(state); }catch(err){} }); }
  function onChange(fn){ listeners.push(fn); }

  function me(){
    if(myId) return Promise.resolve(myId);
    if(!sb()) return Promise.resolve(null);
    return sb().auth.getSession().then(function(r){
      var u = r && r.data && r.data.session && r.data.session.user;
      myId = u ? u.id : null;
      return myId;
    }, function(){ return null; });
  }

  function refresh(){
    return me().then(function(id){
      if(!id || !sb().rpc) return;
      return sb().rpc('get_unread_summary').then(function(res){
        if(!res || res.error || !res.data) return;
        var d = res.data;
        state.messages = d.messages || {};
        raw.system = Number(d.system) || 0;
        raw.requests = Number(d.requests) || 0;
        state.latestSystem = d.latest_system || null;
        state.ready = true;
        recompute();
        emit();
      });
    }).catch(function(){});
  }
  function later(){ clearTimeout(timer); timer = setTimeout(refresh, 300); }   // many events at once -> one call

  function markChatRead(friendId){
    if(!friendId) return Promise.resolve();
    if(state.messages[friendId]){ delete state.messages[friendId]; recompute(); emit(); }   // the number drops at once
    return me().then(function(){ return sb().rpc('mark_chat_read', { p_friend: friendId }); }).then(later, later);
  }
  function markSystemRead(){
    if(raw.system){ raw.system = 0; recompute(); emit(); }
    return me().then(function(){ return sb().rpc('mark_notifications_read'); }).then(later, later);
  }

  function start(){
    me().then(function(id){
      if(!id) return;
      refresh();
      try{
        sb().channel('notify-' + id)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages', filter: 'receiver_id=eq.' + id }, later)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'user_notifications', filter: 'user_id=eq.' + id }, later)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: 'to_user=eq.' + id }, later)
          .subscribe();
      }catch(err){}
      setInterval(function(){ if(!document.hidden) refresh(); }, 45000);
      document.addEventListener('visibilitychange', function(){ if(!document.hidden) refresh(); });
    });
  }

  root.Notify = {
    state: state, onChange: onChange, refresh: refresh,
    applyPrefs: function(){ recompute(); emit(); },           // Settings > Notifications calls this after a change
    markChatRead: markChatRead, markSystemRead: markSystemRead,
    unreadFor: function(friendId){ return prefs().messages === false ? 0 : (Number(state.messages[friendId]) || 0); },
    badgeText: function(n){ n = Number(n) || 0; return n > 99 ? '99+' : String(n); }
  };
  start();
})(window);
