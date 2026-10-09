/* ============================================================================
   text-policy.js  —  the ONE Unicode text policy for the whole app.

   Used for: name, bio, room announcement, room name, room chat messages and
   inbox messages. Every page loads this file, and the database has the same
   rules in profile-fields-and-text-policy.sql (function tp_clean), so the
   result is identical everywhere.

   RULE 1  Remove characters that are invisible or dangerous:
           control characters, zero-width / filler / "blank" characters,
           bidi-override tricks, tag characters, private-use characters,
           lone surrogates. (Used to fake empty names or spoof text.)
   RULE 2  Everything else is ALWAYS allowed — stylish / decorative Unicode
           (꧁꧂ ༺༻ ★✦❀ 𝓐𝓑𝓒 ＡＢＣ ᴀʙᴄ ♛ ❝❞ …) and emoji.
   RULE 3  Lengths are counted in characters (code points), NOT in UTF-16
           units, so 𝓐 or 😀 count as 1 — an HTML maxlength attribute would
           count them as 2, which is why this file enforces limits itself.
   RULE 4  Spaces: tabs / odd space characters become a normal space, runs of
           spaces collapse, edges are trimmed. Single-line fields have no
           line breaks; announcements and messages keep them (max 2 in a row).
   RULE 5  Zalgo guard: at most 3 stacked combining marks in a row.
           ZWJ / ZWNJ are kept only BETWEEN visible characters (needed by
           emoji sequences and Urdu/Persian/Arabic typing), never at the edges.
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
    line:         { max: 0,   multiline: false, required: false, label: 'Text' }       // single line, no limit (display of older values)
  };

  // ---- character sets (kept in sync with tp_clean in the SQL file) ---------
  // Invisible / control characters that are always removed.
  var INVISIBLE =
    '\\u0000-\\u0008\\u000E-\\u001F\\u007F-\\u009F' +   // control characters (tab, LF, CR, VT, FF are handled as spaces / line breaks first)
    '\\u00AD\\u034F\\u061C\\u115F\\u1160\\u17B4\\u17B5' + // soft hyphen, grapheme joiner, Arabic letter mark, Hangul / Khmer fillers
    '\\u180B-\\u180F\\u200B\\u200E\\u200F' +             // Mongolian selectors, zero-width space, LRM, RLM
    '\\u202A-\\u202E\\u2060-\\u206F\\u2800\\u3164' +     // bidi overrides, word joiner & invisible operators, braille blank, Hangul filler
    '\\uFEFF\\uFFA0\\uFFF9-\\uFFFF' +                   // BOM, halfwidth filler, specials, non-characters
    '\\uE000-\\uF8FF' +                                 // private use
    '\\u{1D173}-\\u{1D17A}' +                           // musical formatting characters
    '\\u{E0000}-\\u{E007F}' +                           // tag characters
    '\\u{F0000}-\\u{FFFFD}\\u{100000}-\\u{10FFFD}';     // private use planes
  var LONE_SURROGATE = '[\\uD800-\\uDFFF]';
  var SPACES = '\\u0009\\u000B\\u000C\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000'; // become one normal space
  var MARKS = '\\u0300-\\u036F\\u1AB0-\\u1AFF\\u1DC0-\\u1DFF\\u20D0-\\u20FF\\uFE20-\\uFE2F';       // stackable combining marks

  var RE_LINEBREAKS   = new RegExp('\\r\\n|[\\r\\u0085\\u2028\\u2029]', 'g');
  var RE_SPACES       = new RegExp('[' + SPACES + ']', 'g');
  var RE_INVISIBLE    = new RegExp('[' + INVISIBLE + ']|' + LONE_SURROGATE, 'gu');
  var RE_MARK_STACK   = new RegExp('([' + MARKS + ']{3})[' + MARKS + ']+', 'g');
  var RE_MANY_SPACES  = / {2,}/g;
  var RE_SPACE_AROUND_NL = / ?\n ?/g;
  var RE_MANY_NL      = /\n{3,}/g;
  var RE_ZW_RUN       = /([\u200C\u200D])[\u200C\u200D]+/g;
  var RE_ZW_LEADING   = /(^|[ \n])[\u200C\u200D]+/g;
  var RE_ZW_TRAILING  = /[\u200C\u200D]+(?=$|[ \n])/g;
  var RE_HAS_VISIBLE  = new RegExp('[^ \\n\\u200C\\u200D\\uFE00-\\uFE0F' + MARKS + ']', 'u');

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
    s = s.replace(RE_INVISIBLE, '');
    s = s.replace(RE_MARK_STACK, '$1');
    return s;
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
    s = s.replace(RE_ZW_RUN, '$1').replace(RE_ZW_LEADING, '$1').replace(RE_ZW_TRAILING, '');
    return s.replace(/^[ \n]+|[ \n]+$/g, '');
  }

  // Full clean: what gets saved / sent / shown.
  function clean(text, kind){
    var k = kindOf(kind);
    var s = strip(text, k.multiline);
    s = tidy(s, k.multiline);
    if(k.max) s = clip(s, k.max);
    return tidy(s, k.multiline);      // second pass: removing a joiner can leave a double space, clipping can leave a dangling joiner / space
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
