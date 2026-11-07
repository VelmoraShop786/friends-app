/* ============================================================================
   track.js  —  Track Friend: which of my friends is in a room right now, and a way to follow them in.
   Needs sql-20-track-friend.sql (friends_in_rooms()). If it is missing, nothing is shown and nothing breaks.

   Track.start()        : begin checking (right away, every 20 seconds while the page is open, and when you come back to it)
   Track.get(userId)    : { room_id, room_name } if that friend is in a room, otherwise null
   Track.onChange(fn)   : called only when the picture actually changes
   Track.go(roomId)     : enter that room (the normal way: asks first if you must leave a kept room)
   Blocked people (either way) are never shown.
   ============================================================================ */
(function(root){
  'use strict';
  var map = {}, sig = '', subs = [], timer = null, started = false, busy = false, dead = false;
  function sb(){ return (typeof supabaseClient !== 'undefined') ? supabaseClient : null; }

  function refresh(){
    var c = sb();
    if(!c || busy || dead) return;
    busy = true;
    Promise.resolve(c.rpc('friends_in_rooms')).then(function(r){
      busy = false;
      if(!r) return;
      if(r.error){ if(/friends_in_rooms|does not exist|schema cache/i.test(r.error.message || '')) dead = true; return; }
      var next = {};
      (r.data || []).forEach(function(row){
        var id = String(row.user_id);
        try{ if(root.Safety && (Safety.isBlocked(id) || Safety.isBlockedBy(id))) return; }catch(e){}
        next[id] = { room_id: String(row.room_id), room_name: row.room_name || 'Room' };
      });
      var s = JSON.stringify(Object.keys(next).sort().map(function(k){ return [k, next[k].room_id, next[k].room_name]; }));
      if(s === sig) return;
      sig = s; map = next;
      subs.slice().forEach(function(fn){ try{ fn(); }catch(e){} });
    }, function(){ busy = false; });
  }

  function start(){
    if(started) return; started = true;
    refresh();
    timer = setInterval(function(){ if(!document.hidden) refresh(); }, 20000);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) refresh(); });
    try{ if(root.Safety && Safety.onChange) Safety.onChange(function(){ sig = ''; refresh(); }); }catch(e){}
  }
  function get(uid){ return map[String(uid)] || null; }
  function onChange(fn){ if(typeof fn === 'function') subs.push(fn); }
  function go(roomId){
    if(roomId == null || roomId === '') return;
    if(root.RoomKeeper) RoomKeeper.openRoom(roomId);
    else location.href = 'chatroom.html?room=' + encodeURIComponent(roomId);
  }
  root.Track = { start: start, refresh: refresh, get: get, onChange: onChange, go: go };
})(typeof window !== 'undefined' ? window : globalThis);
