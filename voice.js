/* ============================================================================
   voice.js  —  voice messages (WhatsApp style): hold the mic to record, slide left to cancel, let go to send.
   Needs sql-23-voice.sql (private storage bucket "voice-messages"). A voice message travels inside a normal message as
   [[VOICE:path|seconds]] (see text-policy.js), so nothing else in the database changes.

   VoiceMsg.init({ mic, send, input, composer, getReceiver, onSend, toast, me })
       mic/send/input/composer : the elements; the mic shows while the box is empty, the send button once something is typed
       getReceiver()           : id of the friend you are chatting with
       onSend(path, secs)      : save the message (returns true/false); the file is removed again if it returns false
   VoiceMsg.sync()             : call after the text box was changed from code
   VoiceMsg.bubbleHtml(path, secs), VoiceMsg.toggle(button), VoiceMsg.seek(event, bar), VoiceMsg.fmt(secs)
   ============================================================================ */
(function(root){
  'use strict';
  var BUCKET = 'voice-messages', MAX_SECS = 180, MIN_SECS = 1, SLIDE = 70;
  var cfg = null, holding = false, startX = 0, rec = null, busy = false, cancelled = false;
  var urlCache = {}, cur = null;
  function sb(){ return (typeof supabaseClient !== 'undefined') ? supabaseClient : null; }
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function fmt(s){ s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function toast(t){ try{ cfg && cfg.toast && cfg.toast(t); }catch(e){} }
  function uuid(){ try{ return crypto.randomUUID(); }catch(e){ return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); } }

  var CSS = '' +
    '.mic-btn{ width:40px; height:40px; border-radius:50%; border:none; background:var(--teal-deep,#05846a); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; touch-action:none; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; transition:transform .15s, background .15s; }' +
    '.mic-btn.on{ transform:scale(1.45); background:#d93025; }' +
    '.mic-btn.cancel{ background:#6b6b6b; }' +
    '.rec-bar{ flex:1; min-width:0; display:flex; align-items:center; gap:10px; padding:0 6px; font-weight:700; font-size:.95rem; }' +
    '.rec-bar[hidden]{ display:none !important; }' +
    '.rec-dot{ width:10px; height:10px; border-radius:50%; background:#d93025; animation:vmBlink 1s infinite; flex-shrink:0; }' +
    '.rec-hint{ margin-left:auto; font-weight:600; font-size:.82rem; opacity:.65; white-space:nowrap; }' +
    '.rec-bar.cancel .rec-hint{ color:#d93025; opacity:1; }' +
    '@keyframes vmBlink{ 50%{ opacity:.25; } }' +
    '.composer.recording > input, .composer.recording > .attach-btn{ display:none !important; }' +
    '.vmsg{ display:flex; align-items:center; gap:9px; width:210px; max-width:100%; }' +
    '.vplay{ color:inherit; width:34px; height:34px; border-radius:50%; border:none; background:currentColor; flex-shrink:0; cursor:pointer; position:relative; padding:0; }' +
    '.vplay::before{ content:""; position:absolute; left:50%; top:50%; transform:translate(-35%,-50%); border-style:solid; border-width:7px 0 7px 11px; border-color:transparent transparent transparent var(--vm-ink,#fff); }' +
    '.vplay.on::before{ transform:translate(-50%,-50%); width:11px; height:13px; border:none; background:linear-gradient(90deg,var(--vm-ink,#fff) 0 36%,transparent 36% 64%,var(--vm-ink,#fff) 64%); }' +
    '.vplay.load{ opacity:.55; }' +
    '.vbar{ flex:1; height:22px; display:flex; align-items:center; cursor:pointer; position:relative; }' +
    '.vbar::before{ content:""; position:absolute; left:0; right:0; height:4px; border-radius:2px; background:currentColor; opacity:.28; }' +
    '.vbar .vfill{ position:absolute; left:0; height:4px; border-radius:2px; background:currentColor; width:0; }' +
    '.vbar .vfill::after{ content:""; position:absolute; right:-5px; top:-3px; width:10px; height:10px; border-radius:50%; background:currentColor; }' +
    '.vtime{ font-size:.74rem; font-weight:600; opacity:.85; min-width:30px; text-align:right; font-variant-numeric:tabular-nums; }';
  (function(){ var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); })();

  // ---------------------------------------------------------------- the recorder
  function pickMime(){
    var list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    if(root.MediaRecorder && MediaRecorder.isTypeSupported){ for(var i = 0; i < list.length; i++){ if(MediaRecorder.isTypeSupported(list[i])) return list[i]; } }
    return '';
  }
  function extOf(m){ return /mp4/.test(m) ? 'm4a' : /ogg/.test(m) ? 'ogg' : 'webm'; }
  function setUi(state){            // 'idle' | 'rec' | 'cancel' | 'sending'
    var bar = $('rec-bar'), mic = cfg.mic;
    cfg.composer.classList.toggle('recording', state !== 'idle');
    if(bar) bar.hidden = (state === 'idle');
    if(bar) bar.classList.toggle('cancel', state === 'cancel');
    mic.classList.toggle('on', state === 'rec' || state === 'cancel');
    mic.classList.toggle('cancel', state === 'cancel');
    if($('rec-hint')) $('rec-hint').textContent = state === 'cancel' ? 'Release to cancel' : state === 'sending' ? 'Sending...' : '\u2039 Slide to cancel';
  }
  function tick(){ if(rec && $('rec-time')){ var s = (Date.now() - rec.t0) / 1000; $('rec-time').textContent = fmt(s); if(s >= MAX_SECS) stop(true); } }

  async function start(e){
    if(busy || rec || holding) return;
    if(!root.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ toast('Voice messages are not supported on this device'); return; }
    var to = cfg.getReceiver && cfg.getReceiver();
    if(!to) return;
    holding = true; cancelled = false; startX = e.clientX;
    try{ cfg.mic.setPointerCapture(e.pointerId); }catch(err){}
    var stream;
    try{ stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch(err){ holding = false; toast('Allow the microphone to record a voice message'); return; }
    if(!holding){ stream.getTracks().forEach(function(t){ t.stop(); }); return; }     // let go before the microphone was ready
    var mime = pickMime(), mr;
    try{ mr = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 }) : new MediaRecorder(stream); }
    catch(err){ stream.getTracks().forEach(function(t){ t.stop(); }); holding = false; toast('Could not start recording'); return; }
    var chunks = [];       // kept in a local so the last piece (which arrives after stop) is never lost
    rec = { stream: stream, mr: mr, chunks: chunks, t0: Date.now(), mime: mime || mr.mimeType || 'audio/webm', timer: setInterval(tick, 250), to: to };
    mr.ondataavailable = function(ev){ if(ev.data && ev.data.size) chunks.push(ev.data); };
    mr.start(250);
    $('rec-time').textContent = '0:00';
    setUi('rec');
    try{ if(navigator.vibrate) navigator.vibrate(15); }catch(err){}
  }
  function move(e){
    if(!rec) return;
    var c = (e.clientX - startX) < -SLIDE;
    if(c !== cancelled){ cancelled = c; setUi(c ? 'cancel' : 'rec'); }
  }
  function end(e){
    holding = false;
    if(!rec) return;
    stop(!cancelled && !(e && e.type === 'pointercancel'));
  }
  function stop(send){
    var r = rec; if(!r) return; rec = null; holding = false;
    clearInterval(r.timer);
    var secs = Math.round((Date.now() - r.t0) / 1000);
    r.mr.onstop = function(){
      r.stream.getTracks().forEach(function(t){ t.stop(); });
      if(!send){ setUi('idle'); sync(); return; }
      if(secs < MIN_SECS){ setUi('idle'); sync(); toast('Hold the mic button and speak'); return; }
      upload(new Blob(r.chunks, { type: r.mime }), r.mime, secs, r.to);
    };
    try{ r.mr.stop(); }catch(err){ r.mr.onstop(); }
  }
  async function upload(blob, mime, secs, to){
    busy = true; setUi('sending');
    var base = String(mime).split(';')[0];
    var path = cfg.me() + '/' + to + '/' + uuid() + '.' + extOf(mime);
    try{
      var up = await sb().storage.from(BUCKET).upload(path, blob, { contentType: base, upsert: false });
      if(up.error) throw up.error;
      var ok = await cfg.onSend(path, secs);
      if(!ok){ try{ await sb().storage.from(BUCKET).remove([path]); }catch(e){} }
    }catch(err){ console.error('voice upload failed', err); toast('Could not send the voice message'); }
    busy = false; setUi('idle'); sync();
  }

  // ---------------------------------------------------------------- mic <-> send button
  function sync(){
    if(!cfg) return;
    var has = cfg.input.value.trim().length > 0;
    cfg.send.style.display = has ? '' : 'none';
    cfg.mic.style.display = has ? 'none' : '';
  }
  function init(o){
    cfg = o;
    cfg.mic.addEventListener('pointerdown', function(e){ e.preventDefault(); start(e); });
    cfg.mic.addEventListener('pointermove', move);
    cfg.mic.addEventListener('pointerup', end);
    cfg.mic.addEventListener('pointercancel', end);
    cfg.mic.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    cfg.input.addEventListener('input', sync);
    sync();
  }

  // ---------------------------------------------------------------- playing a voice message
  function bubbleHtml(path, secs){
    return '<div class="vmsg" data-path="' + esc(path) + '" data-secs="' + (+secs || 0) + '">' +
      '<button type="button" class="vplay" onclick="VoiceMsg.toggle(this)" aria-label="Play"></button>' +
      '<div class="vbar" onclick="VoiceMsg.seek(event, this)"><i class="vfill"></i></div>' +
      '<span class="vtime">' + fmt(secs) + '</span></div>';
  }
  async function signed(path){
    var c = urlCache[path];
    if(c && c.exp > Date.now()) return c.url;
    var r = await sb().storage.from(BUCKET).createSignedUrl(path, 3600);
    if(r.error || !r.data) throw (r.error || new Error('no url'));
    urlCache[path] = { url: r.data.signedUrl, exp: Date.now() + 50 * 60 * 1000 };
    return r.data.signedUrl;
  }
  function paint(box, t, secs){
    var f = box.querySelector('.vfill'); if(f) f.style.width = Math.max(0, Math.min(100, secs ? t / secs * 100 : 0)) + '%';
    var tm = box.querySelector('.vtime'); if(tm) tm.textContent = fmt(t > 0 ? t : secs);
  }
  function release(c){
    if(!c) return;
    try{ c.audio.pause(); }catch(e){}
    c.btn.classList.remove('on', 'load');
    paint(c.box, 0, c.secs);
  }
  async function toggle(btn){
    var box = btn.closest('.vmsg'); if(!box) return;
    if(cur && cur.box === box){ if(cur.audio.paused) cur.audio.play().catch(function(){}); else cur.audio.pause(); return; }
    release(cur); cur = null;
    var secs = +box.dataset.secs || 0;
    btn.classList.add('load');
    var url;
    try{ url = await signed(box.dataset.path); }catch(err){ btn.classList.remove('load'); toast('Could not load the voice message'); return; }
    var audio = new Audio(url); audio.preload = 'auto';
    var c = { audio: audio, box: box, btn: btn, secs: secs };
    cur = c;
    audio.addEventListener('playing', function(){ btn.classList.remove('load'); btn.classList.add('on'); });
    audio.addEventListener('pause', function(){ btn.classList.remove('on'); });
    audio.addEventListener('timeupdate', function(){ paint(box, audio.currentTime, secs); });
    audio.addEventListener('ended', function(){ btn.classList.remove('on'); paint(box, 0, secs); if(cur === c) cur = null; });
    audio.addEventListener('error', function(){ btn.classList.remove('on', 'load'); toast('Could not play the voice message'); if(cur === c) cur = null; });
    audio.play().catch(function(){ btn.classList.remove('load'); toast('Could not play the voice message'); });
  }
  function seek(ev, bar){
    var box = bar.closest('.vmsg');
    if(!cur || cur.box !== box) return;
    var rect = bar.getBoundingClientRect();
    var ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    try{ cur.audio.currentTime = ratio * cur.secs; }catch(e){}
  }
  root.VoiceMsg = { init: init, sync: sync, bubbleHtml: bubbleHtml, toggle: toggle, seek: seek, fmt: fmt };
})(typeof window !== 'undefined' ? window : globalThis);
