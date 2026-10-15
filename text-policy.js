/* ============================================================================
   text-policy.js  —  the ONE text policy for the whole app.

   Used for: name, bio, room announcement, room name, room chat messages and
   inbox messages.

   RULE 1  EVERY character is allowed: all languages, emoji, stylish / decorative
           Unicode, symbols, zero-width and "blank" characters, combining marks.
           The only things removed are the two that break saving to the database:
           the NUL character (U+0000) and broken lone surrogates.
   RULE 2  Lengths are counted in characters (code points), NOT in UTF-16
           units, so 𝓐 or 😀 count as 1 (an HTML maxlength attribute would count 2).
   RULE 3  Layout only: line breaks are normalised, tab / vertical-tab / form-feed
           become a normal space, runs of normal spaces collapse, edges are trimmed.
           Single-line fields have no line breaks; announcements and messages keep
           them (max 2 in a row).
   NOTE    The database must use the same rule (its tp_clean function), otherwise
           it would still remove characters after saving.
   ========================================================================== */
(function(root){
  'use strict';

  // ---- limits (code points) ---------------------------------------------
  var KINDS = {
    name:         { max: 18,  multiline: false, required: true,  label: 'Name' },
    bio:          { max: 60,  multiline: false, required: false, label: 'Bio' },
    announcement: { max: 150, multiline: true,  required: false, label: 'Announcement' },
    roomName:     { max: 40,  multiline: false, required: true,  label: 'Room name' },
    message:      { max: 0,   multiline: true,  required: false, label: 'Message' },   // 0 = no length limit
    reply:        { max: 0,   multiline: false, required: false, label: 'Reply' },
    appeal:       { max: 500, multiline: true,  required: true,  label: 'Your explanation' },
    reportNote:   { max: 200, multiline: false, required: false, label: 'Note' },
    line:         { max: 0,   multiline: false, required: false, label: 'Text' }       // single line, no limit (display of older values)
  };

  // ---- character sets -----------------------------------------------------
  // Only what cannot be stored: NUL, and lone (unpaired) surrogates.
  var SPACES = '\\u0009\\u000B\\u000C';   // become one normal space

  var RE_LINEBREAKS   = new RegExp('\\r\\n|[\\r\\u0085\\u2028\\u2029]', 'g');
  var RE_SPACES       = new RegExp('[' + SPACES + ']', 'g');
  var RE_MANY_SPACES  = / {2,}/g;
  var RE_SPACE_AROUND_NL = / ?\n ?/g;
  var RE_MANY_NL      = /\n{3,}/g;
  var RE_HAS_VISIBLE  = /[^ \n]/;

  // remove NUL and lone surrogates (walks the string so valid pairs like emoji are never touched)
  function dropBroken(s){
    var out = '', i, c, d;
    for(i = 0; i < s.length; i++){
      c = s.charCodeAt(i);
      if(c === 0) continue;
      if(c >= 0xD800 && c <= 0xDBFF){
        d = s.charCodeAt(i + 1);
        if(d >= 0xDC00 && d <= 0xDFFF){ out += s.charAt(i) + s.charAt(i + 1); i++; }
        continue;
      }
      if(c >= 0xDC00 && c <= 0xDFFF) continue;
      out += s.charAt(i);
    }
    return out;
  }

  function codePoints(s){ return Array.from(s); }
  function len(s){ return codePoints(String(s == null ? '' : s)).length; }

  function kindOf(kind){
    if(kind && typeof kind === 'object') return kind;
    return KINDS[kind] || KINDS.message;
  }

  // Steps shared by live typing and final cleaning (no trimming / collapsing here).
  function strip(text, multiline){
    var s = String(text == null ? '' : text);
    s = s.replace(RE_LINEBREAKS, '\n');
    s = s.replace(RE_SPACES, ' ');
    if(!multiline) s = s.replace(/\n/g, ' ');
    return dropBroken(s);
  }

  function clip(s, max){
    if(!max) return s;
    var cps = codePoints(s);
    return cps.length > max ? cps.slice(0, max).join('') : s;
  }

  function tidy(s, multiline){
    if(multiline){
      s = s.replace(RE_SPACE_AROUND_NL, '\n').replace(RE_MANY_NL, '\n\n');
    }
    s = s.replace(RE_MANY_SPACES, ' ');
    return s.replace(/^[ \n]+|[ \n]+$/g, '');
  }

  // Full clean: what gets saved / sent / shown.
  function clean(text, kind){
    var k = kindOf(kind);
    var s = strip(text, k.multiline);
    s = tidy(s, k.multiline);
    if(k.max) s = clip(s, k.max);
    return tidy(s, k.multiline);      // second pass: clipping can leave a trailing space
  }

  // While typing: same removals + length limit, but never trims or collapses (so you can still type a space).
  function live(text, kind){
    var k = kindOf(kind);
    return clip(strip(text, k.multiline), k.max);
  }

  function hasVisible(text){ return RE_HAS_VISIBLE.test(String(text == null ? '' : text)); }

  // Validate + clean in one go: { ok, value, error }
  function check(text, kind){
    var k = kindOf(kind);
    var value = clean(text, kind);
    if(k.required && (!value || !hasVisible(value))){
      return { ok: false, value: '', error: (k.label || 'This field') + " can't be empty." };
    }
    if(value && !hasVisible(value)) value = '';
    return { ok: true, value: value, error: '' };
  }

  // One-letter avatar fallback. Safe for decorative names ("꧁𝓐𝓵𝓲꧂" -> "A"), never splits an emoji / surrogate pair.
  function initial(name){
    var s = String(name == null ? '' : name);
    var cps = codePoints(s);
    var i, c, n;
    for(i = 0; i < cps.length; i++){
      c = cps[i];
      n = c.normalize ? c.normalize('NFKC') : c;
      var first = codePoints(n)[0] || '';
      if(/[\p{L}\p{N}]/u.test(first)) return first.toUpperCase();
    }
    for(i = 0; i < cps.length; i++){
      if(hasVisible(cps[i])) return cps[i];
    }
    return '?';
  }

  // Attach the policy to a text <input>/<textarea>: strips bad characters as they are typed / pasted,
  // enforces the length in characters and (optionally) drives a "12/18" counter.
  function bind(el, kind, opts){
    if(!el || el.__tpBound) return;
    el.__tpBound = true;
    opts = opts || {};
    var k = kindOf(kind);
    el.removeAttribute('maxlength');   // the HTML attribute counts UTF-16 units — it would cut stylish names in half
    var counter = typeof opts.counter === 'string' ? document.getElementById(opts.counter) : opts.counter;
    var composing = false;

    function paintCounter(){
      if(!counter || !k.max) return;
      var n = len(el.value);
      counter.textContent = n + '/' + k.max;
      counter.classList.toggle('tp-full', n >= k.max);
    }
    function apply(){
      if(composing) return;
      var v = el.value;
      var n = live(v, k);
      if(n !== v){
        el.value = n;
        try{ el.setSelectionRange(n.length, n.length); }catch(err){}
      }
      paintCounter();
    }
    el.addEventListener('compositionstart', function(){ composing = true; });
    el.addEventListener('compositionend', function(){ composing = false; apply(); });
    el.addEventListener('input', apply);
    el.addEventListener('change', apply);
    el.__tpRefresh = function(){ composing = false; apply(); paintCounter(); };
    paintCounter();
  }

  root.TextPolicy = {
    KINDS: KINDS,
    LIMITS: { name: KINDS.name.max, bio: KINDS.bio.max, announcement: KINDS.announcement.max, roomName: KINDS.roomName.max },
    len: len,
    clean: clean,
    live: live,
    check: check,
    hasVisible: hasVisible,
    initial: initial,
    bind: bind,
    refresh: function(el){ if(el && el.__tpRefresh) el.__tpRefresh(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
