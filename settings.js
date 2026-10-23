/* ============================================================================
   settings.js  —  Settings: Change password, Notifications, Privacy (home.html > Settings tab).

   Change password : checks the CURRENT password, then sets the new one (8+ characters, letters AND numbers).
   Notifications   : which red numbers / dots you want (friend messages, friend requests, System messages).
                     Saved on your account (profiles.notify_*) and remembered on this phone for notify.js.
   Privacy         : who can send you friend requests (Everyone / Nobody, enforced by the database) and whether
                     your birthday / country / gender are shown to other people.
   Needs sql-17-settings.sql. Uses levels.js for the green popup.

   Settings.openPassword() / openNotifications() / openPrivacy() / sync()
   ========================================================================== */
(function(root){
  'use strict';
  function sb(){ return (typeof supabaseClient !== 'undefined') ? supabaseClient : null; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function toast(m){ try{ if(typeof root.showToast === 'function') root.showToast(m); }catch(e){} }

  var cssDone = false;
  function injectCss(){
    if(cssDone) return; cssDone = true;
    var st = document.createElement('style');
    st.textContent =
      '.st-row{display:flex;align-items:center;gap:12px;padding:13px 2px;border-bottom:1px solid #cfe3dc}' +
      '.st-row:last-of-type{border-bottom:0}' +
      '.st-txt{flex:1;min-width:0}' +
      '.st-name{font-weight:700;font-size:.98rem;color:#2f7a63}' +
      '.st-sub{font-size:.82rem;color:#6a9c8b;margin-top:2px;line-height:1.3}' +
      '.st-sw{position:relative;flex:none;width:50px;height:30px;border:0;border-radius:15px;background:#9db3ab;cursor:pointer;padding:0;transition:background .2s}' +
      '.st-sw::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .2s}' +
      '.st-sw.on{background:#2bb892}.st-sw.on::after{transform:translateX(20px)}' +
      '.st-sw[disabled]{opacity:.5;cursor:default}' +
      '.st-seg{display:flex;flex:none;border-radius:16px;background:#cfe3dc;padding:3px}' +
      '.st-seg button{border:0;background:none;border-radius:13px;padding:7px 14px;font:700 .86rem Inter,system-ui,sans-serif;color:#4f7d6c;cursor:pointer}' +
      '.st-seg button.on{background:#2bb892;color:#fff}' +
      '.st-note{margin:14px 4px 4px;font-size:.82rem;color:#7aa797;line-height:1.4}' +
      '.st-in{width:100%;box-sizing:border-box;margin:6px 0 12px;padding:12px 14px;border:2px solid #cfe3dc;border-radius:14px;font:500 1rem Inter,system-ui,sans-serif;background:#fff;color:#1a2b26;outline:none}' +
      '.st-in:focus{border-color:#2bb892}' +
      '.st-lab{font-weight:700;font-size:.88rem;color:#2f7a63}' +
      '.st-err{min-height:1.2em;font-size:.86rem;color:#b1362f;margin:2px 0 8px}' +
      '.st-ok{color:#1f8a6a}' +
      '.st-btn{width:100%;border:0;border-radius:24px;padding:14px;font:800 1rem Inter,system-ui,sans-serif;background:#2bb892;color:#fff;cursor:pointer}' +
      '.st-btn[disabled]{background:#a9c9be;cursor:default}';
    document.head.appendChild(st);
  }

  // ---- my settings row (profiles.*) ------------------------------------------------
  var COLS = 'notify_messages, notify_requests, notify_system, allow_requests, show_birthday, show_country, show_gender';
  var DEFAULTS = { notify_messages: true, notify_requests: true, notify_system: true, allow_requests: true, show_birthday: true, show_country: true, show_gender: true };
  var mine = null;

  function myId(){
    var c = sb(); if(!c) return Promise.resolve(null);
    return Promise.resolve(c.auth.getSession()).then(function(r){ var u = r && r.data && r.data.session && r.data.session.user; return u ? u.id : null; }, function(){ return null; });
  }
  function storePrefs(row){
    try{
      localStorage.setItem('notify-prefs-v1', JSON.stringify({ messages: row.notify_messages !== false, requests: row.notify_requests !== false, system: row.notify_system !== false }));
    }catch(e){}
    try{ if(root.Notify && Notify.applyPrefs) Notify.applyPrefs(); }catch(e){}
  }
  function load(){
    var c = sb(); if(!c) return Promise.resolve(Object.assign({}, DEFAULTS));
    return myId().then(function(id){
      if(!id) return Object.assign({}, DEFAULTS);
      return Promise.resolve(c.from('profiles').select(COLS).eq('id', id).maybeSingle()).then(function(r){
        var row = r && !r.error && r.data ? r.data : null;
        mine = Object.assign({}, DEFAULTS, row || {});
        mine.__id = id;
        mine.__ok = !!row;                   // false = the columns do not exist yet (sql-17 not run)
        storePrefs(mine);
        return mine;
      }, function(){ return Object.assign({}, DEFAULTS); });
    });
  }
  function save(patch){
    var c = sb();
    return load().then(function(cur){
      if(!cur.__id || !cur.__ok) return { error: { message: 'Settings are not ready yet. Please try again in a moment.' } };
      return Promise.resolve(c.from('profiles').update(patch).eq('id', cur.__id)).then(function(r){
        if(r && r.error) return r;
        Object.assign(mine, patch);
        storePrefs(mine);
        try{ if(root.ProfileExtras && ProfileExtras.forget) ProfileExtras.forget({ userId: cur.__id }); }catch(e){}
        return { error: null };
      });
    });
  }

  function sw(key, on){ return '<button type="button" class="st-sw' + (on ? ' on' : '') + '" data-k="' + key + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"></button>'; }
  function wireSwitches(body){
    body.querySelectorAll('.st-sw').forEach(function(b){
      b.addEventListener('click', function(){
        var k = b.getAttribute('data-k'), want = !b.classList.contains('on');
        b.classList.toggle('on', want); b.setAttribute('aria-checked', want ? 'true' : 'false'); b.disabled = true;
        var p = {}; p[k] = want;
        save(p).then(function(r){
          b.disabled = false;
          if(r && r.error){ b.classList.toggle('on', !want); b.setAttribute('aria-checked', !want ? 'true' : 'false'); toast(r.error.message || 'Could not save'); }
        });
      });
    });
  }

  // ---- Notifications ------------------------------------------------------------------
  function openNotifications(){
    injectCss();
    Levels.openPage('Notifications', function(body, alive){
      body.innerHTML = '<div class="st-note">Loading...</div>';
      load().then(function(s){
        if(!alive()) return;
        body.innerHTML =
          '<div class="st-row"><div class="st-txt"><div class="st-name">Friend messages</div><div class="st-sub">Red number on chats, the Message tab and the Social icon</div></div>' + sw('notify_messages', s.notify_messages) + '</div>' +
          '<div class="st-row"><div class="st-txt"><div class="st-name">Friend requests</div><div class="st-sub">Red number when someone wants to be your friend</div></div>' + sw('notify_requests', s.notify_requests) + '</div>' +
          '<div class="st-row"><div class="st-txt"><div class="st-name">System messages</div><div class="st-sub">XP, new frames, report results and other messages from System</div></div>' + sw('notify_system', s.notify_system) + '</div>' +
          '<div class="st-note">Turning one off only hides its red number. The messages are still there when you open them. Notifications while the app is closed (push) will come later.</div>';
        wireSwitches(body);
      });
    });
  }

  // ---- Privacy ------------------------------------------------------------------------
  function openPrivacy(){
    injectCss();
    Levels.openPage('Privacy', function(body, alive){
      body.innerHTML = '<div class="st-note">Loading...</div>';
      load().then(function(s){
        if(!alive()) return;
        body.innerHTML =
          '<div class="st-row"><div class="st-txt"><div class="st-name">Friend requests</div><div class="st-sub">Who can send you a friend request</div></div>' +
            '<div class="st-seg"><button type="button" data-r="1" class="' + (s.allow_requests ? 'on' : '') + '">Everyone</button><button type="button" data-r="0" class="' + (s.allow_requests ? '' : 'on') + '">Nobody</button></div></div>' +
          '<div class="st-row"><div class="st-txt"><div class="st-name">Show my birthday</div><div class="st-sub">Day and month on your profile</div></div>' + sw('show_birthday', s.show_birthday) + '</div>' +
          '<div class="st-row"><div class="st-txt"><div class="st-name">Show my country</div><div class="st-sub">The flag on your profile and in lists</div></div>' + sw('show_country', s.show_country) + '</div>' +
          '<div class="st-row"><div class="st-txt"><div class="st-name">Show my gender</div><div class="st-sub">The gender icon on your profile and in lists</div></div>' + sw('show_gender', s.show_gender) + '</div>' +
          '<div class="st-note">Hidden details are not shown to other people in the app. You always see your own. People you have already added stay your friends. To stop one person, use Block.</div>';
        wireSwitches(body);
        body.querySelectorAll('.st-seg button').forEach(function(b){
          b.addEventListener('click', function(){
            var want = b.getAttribute('data-r') === '1';
            var seg = b.parentNode;
            seg.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', x === b); });
            save({ allow_requests: want }).then(function(r){
              if(r && r.error){ seg.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', (x.getAttribute('data-r') === '1') === !want); }); toast(r.error.message || 'Could not save'); }
            });
          });
        });
      });
    });
  }

  // ---- Change password ----------------------------------------------------------------
  function passwordProblem(p){
    if(p.length < 8) return 'The new password must be at least 8 characters.';
    if(!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'The new password must have both letters and numbers.';
    return '';
  }
  function openPassword(){
    injectCss();
    Levels.openPage('Change password', function(body){
      body.innerHTML =
        '<div class="st-lab">Current password</div><input class="st-in" id="st-cur" type="password" autocomplete="current-password">' +
        '<div class="st-lab">New password</div><input class="st-in" id="st-new" type="password" autocomplete="new-password" placeholder="8+ characters, letters and numbers">' +
        '<div class="st-lab">Confirm new password</div><input class="st-in" id="st-conf" type="password" autocomplete="new-password">' +
        '<div class="st-err" id="st-err"></div><button type="button" class="st-btn" id="st-go">Change password</button>';
      var err = body.querySelector('#st-err'), go = body.querySelector('#st-go');
      function fail(m){ err.className = 'st-err'; err.textContent = m; go.disabled = false; go.textContent = 'Change password'; }
      go.addEventListener('click', function(){
        var cur = body.querySelector('#st-cur').value, nw = body.querySelector('#st-new').value, cf = body.querySelector('#st-conf').value;
        err.textContent = '';
        if(!cur) return fail('Enter your current password.');
        var prob = passwordProblem(nw); if(prob) return fail(prob);
        if(nw === cur) return fail('The new password must be different from the current one.');
        if(nw !== cf) return fail('The two new passwords do not match.');
        var c = sb(); if(!c) return fail('Please try again in a moment.');
        go.disabled = true; go.textContent = 'Please wait...';
        Promise.resolve(c.auth.getSession()).then(function(r){
          var u = r && r.data && r.data.session && r.data.session.user;
          if(!u) return fail('Please log in again.');
          var who = u.email ? { email: u.email } : { phone: u.phone };
          // prove it is really you: the current password has to be right
          return Promise.resolve(c.auth.signInWithPassword(Object.assign({ password: cur }, who))).then(function(a){
            if(a && a.error) return fail('The current password is wrong.');
            return Promise.resolve(c.auth.updateUser({ password: nw })).then(function(b){
              if(b && b.error) return fail(b.error.message || 'Could not change the password.');
              err.className = 'st-err st-ok'; err.textContent = 'Password changed.';
              go.textContent = 'Done';
              toast('Password changed');
              setTimeout(function(){ try{ Levels.closePage(); }catch(e){} }, 1100);
            });
          });
        }).catch(function(){ fail('Could not change the password. Check your internet and try again.'); });
      });
    });
  }

  // ---- Delete account -----------------------------------------------------------------
  function openDelete(){
    injectCss();
    Levels.openPage('Delete account', function(body){
      body.innerHTML =
        '<div class="st-note" style="margin-top:0;color:#8a3a33;"><b>This cannot be undone.</b> Your account will be deleted for good:</div>' +
        '<ul style="margin:8px 0 12px 20px;font-size:.88rem;color:#2f6b58;line-height:1.5">' +
          '<li>your profile, picture, friends and chats</li><li>your XP, level and frames</li><li>the room you own, if you have one</li>' +
        '</ul>' +
        '<div class="st-note" style="margin-top:0">Some safety records (for example reports and suspensions) may be kept, as written in the Privacy Policy.</div>' +
        '<div class="st-lab" style="margin-top:14px">Your password</div><input class="st-in" id="dl-pw" type="password" autocomplete="current-password">' +
        '<div class="st-lab">Type DELETE to confirm</div><input class="st-in" id="dl-word" type="text" autocapitalize="characters" autocomplete="off" placeholder="DELETE">' +
        '<div class="st-err" id="dl-err"></div><button type="button" class="st-btn" id="dl-go" style="background:#c0392b">Delete my account</button>';
      var err = body.querySelector('#dl-err'), go = body.querySelector('#dl-go');
      function fail(m){ err.textContent = m; go.disabled = false; go.textContent = 'Delete my account'; }
      go.addEventListener('click', function(){
        var pw = body.querySelector('#dl-pw').value, word = body.querySelector('#dl-word').value.trim();
        err.textContent = '';
        if(!pw) return fail('Enter your password.');
        if(word !== 'DELETE') return fail('Type DELETE (in capital letters) to confirm.');
        var c = sb(); if(!c) return fail('Please try again in a moment.');
        go.disabled = true; go.textContent = 'Please wait...';
        Promise.resolve(c.auth.getSession()).then(function(r){
          var u = r && r.data && r.data.session && r.data.session.user;
          if(!u) return fail('Please log in again.');
          var who = u.email ? { email: u.email } : { phone: u.phone };
          return Promise.resolve(c.auth.signInWithPassword(Object.assign({ password: pw }, who))).then(function(a){
            if(a && a.error) return fail('The password is wrong.');
            // my picture file (best effort), then leave any room, then delete everything in the database
            return Promise.resolve(c.from('profiles').select('avatar_url').eq('id', u.id).maybeSingle()).then(function(pr){
              try{
                var url = pr && pr.data && pr.data.avatar_url, m = url && url.match(/\/Media\/(.+)$/);
                if(m) return c.storage.from('Media').remove([decodeURIComponent(m[1])]);
              }catch(e){}
            }).catch(function(){}).then(function(){
              return Promise.resolve(c.rpc('room_leave_all')).catch(function(){});
            }).then(function(){
              return Promise.resolve(c.rpc('delete_my_account', { p_confirm: 'DELETE' }));
            }).then(function(d){
              if(d && d.error) return fail(d.error.message || 'Could not delete the account. Please try again.');
              try{ localStorage.clear(); sessionStorage.clear(); }catch(e){}
              return Promise.resolve(c.auth.signOut({ scope: 'local' })).catch(function(){}).then(function(){
                var url = 'index.html?deleted=1';
                try{ if(root.top !== root && root.top.AppShell){ root.top.AppShell.closeRoom(url); return; } }catch(e){}
                location.replace(url);
              });
            });
          });
        }).catch(function(){ fail('Could not delete the account. Check your internet and try again.'); });
      });
    });
  }

  root.Settings = { openPassword: openPassword, openNotifications: openNotifications, openPrivacy: openPrivacy, openDelete: openDelete, sync: load };
})(window);
