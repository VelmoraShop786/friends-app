/* ============================================================================
   safety.js  —  Block, Unblock and Report (shared by home.html, chatroom.html, inbox.html)

   Block  : the blocked person can no longer message you or send you a friend request.
            The old chat stays exactly where it is, but nobody can write in it any more (the
            message bar is replaced by a notice — on BOTH sides, so the blocked person knows).
            You do not see their messages in rooms, you do not hear their voice, and they are
            marked for you (only you) in rooms. (The database enforces the messaging part.)
   Report : choose a reason (+ optional note, max 200 characters); the app owner sees it in
            Owner Panel -> Reports.

   Needs: supabase-config.js (supabaseClient) and text-policy.js. Database: sql-5-block-and-report.sql
   ========================================================================== */
(function(root){
  'use strict';

  var REASONS = [
    ['spam',          'Spam or scam'],
    ['abuse',         'Abuse or harassment'],
    ['inappropriate', 'Inappropriate content'],
    ['fake',          'Fake account / pretending to be someone'],
    ['other',         'Something else']
  ];
  var REASON_LABEL = {};
  REASONS.forEach(function(r){ REASON_LABEL[r[0]] = r[1]; });

  var blocked = new Set();     // people I blocked
  var blockedBy = new Set();   // people who blocked me
  var listeners = [];
  var renders = [];
  var myId = null;

  function sb(){ return root.supabaseClient || (typeof supabaseClient !== "undefined" ? supabaseClient : null); }   // supabase-config.js declares it with const, so it is NOT on window
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function toast(msg){ if(typeof root.showToast === 'function') root.showToast(msg); else alert(msg); }

  function me(){
    if(myId) return Promise.resolve(myId);
    if(!sb()) return Promise.resolve(null);
    return sb().auth.getSession().then(function(r){
      var u = r && r.data && r.data.session && r.data.session.user;
      myId = u ? u.id : null;
      return myId;
    }, function(){ return null; });
  }

  function emit(){
    listeners.forEach(function(fn){ try{ fn(); }catch(err){} });
    renders = renders.filter(function(r){ return r.el.isConnected; });
    renders.forEach(function(r){ paintButtons(r.el, r.o); });
  }
  function onChange(fn){ listeners.push(fn); }
  function isBlocked(id){ return !!id && blocked.has(String(id)); }          // I blocked them
  function isBlockedBy(id){ return !!id && blockedBy.has(String(id)); }      // they blocked me

  // ---- load / block / unblock -------------------------------------------------
  function load(){
    return me().then(function(id){
      if(!id) return;
      return sb().from('user_blocks').select('blocker_id, blocked_id')
        .or('blocker_id.eq.' + id + ',blocked_id.eq.' + id).then(function(res){
          if(res && !res.error && res.data){
            blocked = new Set(res.data.filter(function(r){ return String(r.blocker_id) === String(id); }).map(function(r){ return String(r.blocked_id); }));
            blockedBy = new Set(res.data.filter(function(r){ return String(r.blocked_id) === String(id); }).map(function(r){ return String(r.blocker_id); }));
            emit();
          }
          listen(id);
        });
    }).catch(function(){});
  }

  // when someone blocks / unblocks me (or I do it on another phone) the screen follows within a moment
  var listening = false;
  function listen(id){
    if(listening || !sb() || !sb().channel) return;
    listening = true;
    try{
      sb().channel('safety-blocks-' + id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_blocks' }, function(){ load(); })
        .subscribe();
    }catch(err){}
  }

  function doBlock(userId, name){
    return me().then(function(id){
      return sb().from('user_blocks').insert({ blocked_id: userId }).then(function(res){
        if(res.error && res.error.code !== '23505'){
          toast('Could not block: ' + String(res.error.message || '').slice(0, 90));
          return false;
        }
        blocked.add(String(userId));
        return true;   // the friendship and the old chat stay; only writing is switched off
      });
    }).then(function(ok){
      if(ok){ toast((name || 'This person') + ' is blocked'); emit(); }
      return ok;
    });
  }
  function block(userId, name){
    name = name || 'this person';
    return confirmDialog({
      title: 'Block ' + name + '?',
      text: "You and " + name + " won't be able to send each other messages or friend requests. Your old chat stays, but nobody can write in it. In rooms you won't see their messages or hear their voice, and they will be marked for you. You can unblock them any time.",
      ok: 'Block', danger: true
    }).then(function(yes){ return yes ? doBlock(userId, name) : false; });
  }
  function unblock(userId, name){
    return me().then(function(id){
      return sb().from('user_blocks').delete().eq('blocker_id', id).eq('blocked_id', userId);
    }).then(function(res){
      if(res && res.error){ toast('Could not unblock.'); return false; }
      blocked.delete(String(userId));
      toast((name || 'This person') + ' is unblocked');
      emit();
      return true;
    });
  }

  function listBlocked(){
    return me().then(function(id){
      if(!id) return [];
      return sb().from('user_blocks').select('blocked_id, created_at').eq('blocker_id', id)
        .order('created_at', { ascending: false }).then(function(res){
          var rows = (res && !res.error && res.data) || [];
          if(!rows.length) return [];
          var ids = rows.map(function(r){ return r.blocked_id; });
          return sb().from('profiles').select('id, name, avatar_url, id_number').in('id', ids).then(function(p){
            var by = {};
            ((p && p.data) || []).forEach(function(x){ by[x.id] = x; });
            return ids.map(function(i){ return by[i] || { id: i, name: 'Unknown', avatar_url: null, id_number: '' }; });
          });
        });
    }).catch(function(){ return []; });
  }

  // ---- little dialogs --------------------------------------------------------
  function overlay(inner, opts){
    var el = document.createElement('div');
    el.className = 'sf-backdrop';
    el.innerHTML = '<div class="sf-sheet" role="dialog" aria-modal="true">' + inner + '</div>';
    document.body.appendChild(el);
    if(!(opts && opts.sticky)) el.addEventListener('click', function(e){ if(e.target === el) el.remove(); });
    return el;
  }

  function confirmDialog(o){
    return new Promise(function(resolve){
      var el = overlay(
        '<h3>' + esc(o.title) + '</h3>' +
        '<p class="sf-text">' + esc(o.text) + '</p>' +
        '<div class="sf-row"><button type="button" class="sf-cancel">Cancel</button>' +
        '<button type="button" class="sf-go ' + (o.danger ? 'danger' : '') + '">' + esc(o.ok || 'OK') + '</button></div>'
      );
      var done = false;
      function finish(v){ if(done) return; done = true; el.remove(); resolve(v); }
      el.querySelector('.sf-cancel').onclick = function(){ finish(false); };
      el.querySelector('.sf-go').onclick = function(){ finish(true); };
      el.addEventListener('click', function(e){ if(e.target === el) finish(false); });
    });
  }

  function report(o){
    // o = { userId, name, roomId?, messageText? }
    var name = o.name || 'this person';
    var picked = '';
    var opts = REASONS.map(function(r){
      return '<button type="button" class="sf-opt" data-v="' + r[0] + '"><span class="sf-dot"></span>' + esc(r[1]) + '</button>';
    }).join('');
    var quote = o.messageText ? '<div class="sf-quote">' + esc(String(o.messageText).slice(0, 160)) + '</div>' : '';
    var el = overlay(
      '<h3>Report ' + esc(name) + '</h3>' +
      '<p class="sf-text">Why are you reporting this person?</p>' + quote +
      '<div class="sf-opts">' + opts + '</div>' +
      '<textarea class="sf-note" rows="3" dir="auto" placeholder="Add details (optional)"></textarea>' +
      '<div class="sf-foot"><span class="sf-err"></span><span class="sf-count tp-count"></span></div>' +
      '<div class="sf-row"><button type="button" class="sf-cancel">Cancel</button>' +
      '<button type="button" class="sf-go">Send report</button></div>'
    );
    var note = el.querySelector('.sf-note');
    var err = el.querySelector('.sf-err');
    if(root.TextPolicy) root.TextPolicy.bind(note, 'reportNote', { counter: el.querySelector('.sf-count') });
    el.querySelectorAll('.sf-opt').forEach(function(b){
      b.onclick = function(){
        picked = b.getAttribute('data-v');
        el.querySelectorAll('.sf-opt').forEach(function(x){ x.classList.toggle('on', x === b); });
        err.textContent = '';
      };
    });
    el.querySelector('.sf-cancel').onclick = function(){ el.remove(); };
    var go = el.querySelector('.sf-go');
    go.onclick = function(){
      var text = root.TextPolicy ? root.TextPolicy.clean(note.value, 'reportNote') : note.value.trim();
      if(!picked){ err.textContent = 'Please choose a reason.'; return; }
      if(picked === 'other' && text.length < 5){ err.textContent = 'Please write a few words about what happened.'; return; }
      go.disabled = true;
      var row = { reported_id: o.userId, reason: picked, note: text || null };
      if(o.roomId) row.room_id = String(o.roomId);
      if(o.messageText) row.message_text = String(o.messageText).slice(0, 500);
      sb().from('user_reports').insert(row).then(function(res){
        go.disabled = false;
        if(res.error){
          if(res.error.code === '23505'){ el.remove(); toast("You already reported this person — we'll review it."); return; }
          err.textContent = 'Could not send the report. ' + String(res.error.message || '').slice(0, 80);
          return;
        }
        thanks(el, o, name);
      });
    };
  }
  function thanks(el, o, name){
    var sheet = el.querySelector('.sf-sheet');
    sheet.innerHTML =
      '<h3>Report sent</h3><p class="sf-text">Thank you. The app owner will look into it.</p>' +
      '<div class="sf-row">' +
      (isBlocked(o.userId) ? '' : '<button type="button" class="sf-cancel sf-blk">Also block ' + esc(name) + '</button>') +
      '<button type="button" class="sf-go sf-done">Done</button></div>';
    sheet.querySelector('.sf-done').onclick = function(){ el.remove(); };
    var b = sheet.querySelector('.sf-blk');
    if(b) b.onclick = function(){ el.remove(); block(o.userId, name); };
  }

  // ---- Block / Report buttons for a profile screen -------------------------------
  function paintButtons(el, o){
    me().then(function(id){
      if(!o || !o.userId || !id || String(o.userId) === String(id)){ el.innerHTML = ''; el.style.display = 'none'; return; }
      var b = isBlocked(o.userId);
      el.style.display = 'flex';
      el.innerHTML =
        '<button type="button" class="sf-btn sf-b">' + (b ? 'Unblock' : 'Block') + '</button>' +
        '<button type="button" class="sf-btn sf-r danger">Report</button>';
      el.querySelector('.sf-b').onclick = function(e){ e.stopPropagation(); if(isBlocked(o.userId)) unblock(o.userId, o.name); else block(o.userId, o.name); };
      el.querySelector('.sf-r').onclick = function(e){ e.stopPropagation(); report(o); };
    });
  }
  function renderButtons(el, o){
    if(!el) return;
    renders = renders.filter(function(r){ return r.el !== el; });
    renders.push({ el: el, o: o });
    paintButtons(el, o);
  }

  // ---- picture for an appeal (shrunk to 1280 px JPEG so it stays small) -------------------------
  var PROOF_BUCKET = 'appeal-proofs';
  function compressImage(file){
    return new Promise(function(resolve, reject){
      if(!file || !/^image\//.test(file.type)) return reject(new Error('Please choose a picture.'));
      if(file.size > 15 * 1024 * 1024) return reject(new Error('That picture is too large.'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 1280 / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function(b){
          URL.revokeObjectURL(url);
          if(b) resolve({ blob: b, previewUrl: URL.createObjectURL(b) }); else reject(new Error('Could not read that picture.'));
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('Could not read that picture.')); };
      img.src = url;
    });
  }
  function uploadProof(blob){
    return me().then(function(id){
      var path = id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
      return sb().storage.from(PROOF_BUCKET).upload(path, blob, { contentType: 'image/jpeg' }).then(function(res){
        if(res && res.error) throw res.error;
        return path;
      });
    });
  }
  function proofUrl(path){
    if(!path) return Promise.resolve(null);
    return sb().storage.from(PROOF_BUCKET).createSignedUrl(path, 3600).then(function(r){ return r && r.data ? r.data.signedUrl : null; }, function(){ return null; });
  }

  // ---- suspension gate + warnings -------------------------------------------------------
  // Every page asks the database "am I suspended?". If yes -> suspended.html (it shows the reason, the end time
  // and, for suspensions longer than 7 days, the appeal form). A warning from the owner is shown once.
  var onSuspendedPage = /suspended\.html$/.test(location.pathname);
  var warningShowing = false;
  function guard(){
    if(onSuspendedPage) return;
    me().then(function(id){
      if(!id || !sb().rpc) return;
      return sb().rpc('get_my_suspension').then(function(res){
        if(res && !res.error && res.data){ location.replace('suspended.html'); return; }
        checkWarning(id);
      });
    }).catch(function(){});
  }
  function checkWarning(id){
    if(warningShowing) return;
    sb().from('user_sanctions').select('id, reason, message').eq('user_id', id).eq('kind', 'warning')
      .is('acknowledged_at', null).order('created_at', { ascending: true }).limit(1).then(function(res){
        var w = res && !res.error && res.data && res.data[0];
        if(!w || warningShowing) return;
        warningShowing = true;
        var el = overlay(
          '<h3>⚠️ Warning from the app owner</h3>' +
          (w.reason ? '<p class="sf-text"><b>Reason:</b> ' + esc(REASON_LABEL[w.reason] || w.reason) + '</p>' : '') +
          (w.message ? '<div class="sf-quote">' + esc(w.message) + '</div>' : '') +
          '<p class="sf-text">Please follow the rules. If this happens again your account can be suspended.</p>' +
          '<div class="sf-row"><button type="button" class="sf-go sf-ok">I understand</button></div>',
          { sticky: true }   // can only be closed with the button
        );
        el.querySelector('.sf-ok').onclick = function(){
          sb().rpc('ack_my_warning', { p_id: w.id }).then(function(){ warningShowing = false; el.remove(); checkWarning(id); });
        };
      });
  }
  function watchSanctions(id){
    try{
      sb().channel('safety-sanctions-' + id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_sanctions' }, function(){ guard(); })
        .subscribe();
    }catch(err){}
    setInterval(function(){ if(!document.hidden) guard(); }, 60000);   // also catches a suspension that was set while the screen was asleep
  }

  // ---- styles ------------------------------------------------------------------
  var css =
    '.sf-actions{display:none;gap:10px;justify-content:center;align-items:center;margin:14px 0 0;}' +
    '.sf-btn{border:1.5px solid var(--line,#d6e4df);background:var(--card,#fff);color:var(--ink,#16302a);font-family:Inter,system-ui,sans-serif;font-weight:600;font-size:.82rem;padding:9px 18px;border-radius:999px;cursor:pointer;}' +
    '.sf-btn.danger{color:#b1362f;border-color:#efc9c5;}' +
    '.sf-backdrop{position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;}' +
    '.sf-sheet{width:100%;max-width:480px;max-height:92vh;overflow-y:auto;background:#fff;color:#16302a;border-radius:20px 20px 0 0;padding:20px 20px 24px;font-family:Inter,system-ui,sans-serif;-webkit-user-select:text;user-select:text;}' +
    '.sf-sheet h3{margin:0 0 8px;font-family:Fraunces,Georgia,serif;font-size:1.15rem;}' +
    '.sf-text{margin:0 0 12px;font-size:.86rem;line-height:1.45;color:#5c7770;}' +
    '.sf-quote{margin:0 0 12px;padding:8px 12px;border-left:3px solid #d6e4df;background:#f4f8f6;border-radius:8px;font-size:.82rem;color:#3d5a52;overflow-wrap:anywhere;}' +
    '.sf-opts{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;}' +
    '.sf-opt{display:flex;align-items:center;gap:10px;text-align:left;border:1.5px solid #d6e4df;background:#fbfdfc;border-radius:12px;padding:11px 12px;font-family:inherit;font-size:.88rem;color:#16302a;cursor:pointer;}' +
    '.sf-opt.on{border-color:#05846a;background:#e7f6f1;}' +
    '.sf-dot{width:16px;height:16px;border-radius:50%;border:2px solid #9fb5ae;flex-shrink:0;}' +
    '.sf-opt.on .sf-dot{border-color:#05846a;background:radial-gradient(circle,#05846a 45%,transparent 50%);}' +
    '.sf-note{width:100%;border:1.5px solid #d6e4df;background:#fbfdfc;border-radius:12px;padding:10px 12px;font-family:inherit;font-size:.9rem;color:#16302a;resize:none;outline:none;box-sizing:border-box;}' +
    '.sf-foot{display:flex;justify-content:space-between;gap:10px;min-height:20px;margin:6px 0 10px;font-size:.76rem;}' +
    '.sf-err{color:#b1362f;}' +
    '.sf-row{display:flex;gap:10px;}' +
    '.sf-row button{flex:1;border:none;border-radius:12px;padding:13px 8px;font-family:inherit;font-weight:600;font-size:.9rem;cursor:pointer;}' +
    '.sf-cancel{background:#f1f6f4;color:#3d5a52;}' +
    '.sf-go{background:#05846a;color:#fff;}' +
    '.sf-go.danger{background:#b1362f;}' +
    '.sf-go:disabled{opacity:.6;}' +
    '.sf-select{width:100%;border:1.5px solid #d6e4df;background:#fbfdfc;border-radius:12px;padding:12px;font-family:inherit;font-size:.92rem;color:#16302a;margin-bottom:10px;box-sizing:border-box;}' +
    '.sf-hint{margin:-4px 0 10px;font-size:.78rem;color:#5c7770;line-height:1.4;}' +
    '.tp-count{font-size:.72rem;font-weight:600;color:#5c7770;}';
  var st = document.createElement('style');
  st.setAttribute('data-safety', '');
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  root.Safety = {
    REASONS: REASONS, reasonLabel: function(k){ return REASON_LABEL[k] || k; },
    load: load, isBlocked: isBlocked, isBlockedBy: isBlockedBy, block: block, unblock: unblock, report: report,
    renderButtons: renderButtons, listBlocked: listBlocked, onChange: onChange,
    sheet: overlay, esc: esc, toast: toast, guard: guard,
    proof: { compress: compressImage, upload: uploadProof, url: proofUrl }
  };

  load();
  guard();
  me().then(function(id){ if(id && !onSuspendedPage) watchSanctions(id); });
})(window);
