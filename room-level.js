/* ============================================================================
   room-level.js  —  Room Level card + "About Room Level" popup (the room's own level, 0 to 100).

   The DATABASE decides everything (sql-15-room-level.sql). This file only shows:
     get_room_xp(room)   -> { total_xp, level, level_xp, next_xp, remaining }   (next_xp null at level 100)
     room_xp_levels()    -> [{ level, xp }, ... 0..100 ]
     get_my_seat_today() -> { minutes_used, cap_minutes }
   Room XP never resets on a level-up; the bar only SUBTRACTS for drawing, nothing is written back.

   Uses levels.js for the card (shield + bar) and the green popup.
     RoomLevel.attach(hostElement, roomId)    -> draws the card, keeps it live
     RoomLevel.openAbout()                    -> the popup
   ========================================================================== */
(function(root){
  'use strict';
  var st = { roomId: null, ctl: null, info: null, channel: null };

  function sb(){ return (typeof supabaseClient !== 'undefined') ? supabaseClient : null; }
  function n(x){ return Number(x || 0).toLocaleString('en-US'); }

  function paint(info){
    if(!info) return;
    st.info = info;
    try{ localStorage.setItem('room-xp-cache-' + st.roomId, JSON.stringify(info)); }catch(e){}
    if(st.ctl) st.ctl.update(info);
  }
  function refresh(){
    var c = sb(); if(!c || !st.roomId) return Promise.resolve();
    return Promise.resolve(c.rpc('get_room_xp', { p_room: String(st.roomId) })).then(function(r){ if(r && r.data) paint(r.data); }, function(){});
  }

  function attach(host, roomId){
    st.roomId = String(roomId);
    st.ctl = Levels.mount(host, { onTap: openAbout });
    try{ var cached = JSON.parse(localStorage.getItem('room-xp-cache-' + st.roomId) || 'null'); if(cached) paint(cached); }catch(e){}
    refresh();
    var c = sb();
    if(c && c.channel && !st.channel){
      try{
        st.channel = c.channel('room-xp-' + st.roomId)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'room_xp', filter: 'room_id=eq.' + st.roomId }, refresh)
          .subscribe();
      }catch(e){}
      document.addEventListener('visibilitychange', function(){ if(!document.hidden) refresh(); });
    }
    return st.ctl;
  }

  function render(body, data){
    var info = data.info || st.info, lv = data.levels || [], t = data.today || { minutes_used: 0, cap_minutes: 150 };
    var cap = t.cap_minutes || 150, used = Math.min(cap, t.minutes_used || 0);
    var html = '<h4>Ways to Level Up</h4><div class="lvab-sub">(Refresh at 00:00 (GMT+5) daily)</div>';
    if(info){
      html += '<div class="lvab-item"><div class="lvab-line"><span>Level ' + info.level + '</span><span>Total Exp: ' + n(info.total_xp) + '</span></div>' +
        (info.next_xp == null
          ? '<div class="lvab-note">Maximum level reached</div>'
          : '<div class="lvab-note">Next Level: ' + (info.level + 1) + ' &nbsp;·&nbsp; Remaining Exp: ' + n(info.remaining) + '</div>') + '</div>';
    }
    html += '<div class="lvab-sec">Seat activity <em>(per member, daily limit: </em><b>' + cap + '</b><em> minutes)</em></div>' +
      Levels.barHtml('Your seat time today', used, cap, 'Every minute you sit on a seat = 24 Exp for this room') +
      '<div class="lvab-note">Mic on or off does not matter, you only need to be on a seat.<br>One member can give at most ' + n(cap * 24) + ' Exp a day to the rooms (all rooms together).</div>';
    if(lv.length){
      var me = info ? info.level : -1;
      html += '<div class="lvab-sec">Levels</div><table class="lvab-table"><tr><th>Level</th><th>Total Exp needed</th></tr>' +
        lv.map(function(r){ return '<tr' + (r.level === me ? ' class="me"' : '') + '><td>' + r.level + '</td><td>' + n(r.xp) + '</td></tr>'; }).join('') + '</table>';
    }
    html += '<div class="lvab-foot">More ways to level up the room (tasks, diamonds, gold) will be added soon.</div>';
    body.innerHTML = html;
  }

  function openAbout(){
    Levels.openPage('About Room Level', function(body, alive){
      var data = { info: st.info, levels: null, today: null };
      render(body, data);
      var c = sb(); if(!c) return;
      Promise.all([
        Promise.resolve(c.rpc('get_room_xp', { p_room: String(st.roomId) })).then(function(r){ return r && r.data; }, function(){ return null; }),
        Promise.resolve(c.rpc('room_xp_levels')).then(function(r){ return r && r.data; }, function(){ return null; }),
        Promise.resolve(c.rpc('get_my_seat_today')).then(function(r){ return r && r.data; }, function(){ return null; })
      ]).then(function(res){
        if(!alive()) return;
        if(res[0]){ data.info = res[0]; paint(res[0]); }
        if(res[1]) data.levels = res[1];
        if(res[2]) data.today = res[2];
        render(body, data);
      });
    });
  }

  root.RoomLevel = { attach: attach, refresh: refresh, openAbout: openAbout };
})(typeof window !== 'undefined' ? window : globalThis);
