/* ============================================================================
   profile-extras.js  —  Gender, Date of Birth (day + month only), Country (with flag),
   Bio, and the small "pill row" shown on profile screens (flag + gender icon + DOB).
   Shared by index.html (signup), home.html (Edit profile + profile screens),
   chatroom.html and inbox.html (profile screens).
   ========================================================================== */
(function(root){
  "use strict";

  // Whole world (ISO 3166-1 + Kosovo) — Israel is intentionally NOT in this list.
  var COUNTRIES = [
  ["AF", "Afghanistan"],
  ["AX", "Åland Islands"],
  ["AL", "Albania"],
  ["DZ", "Algeria"],
  ["AS", "American Samoa"],
  ["AD", "Andorra"],
  ["AO", "Angola"],
  ["AI", "Anguilla"],
  ["AQ", "Antarctica"],
  ["AG", "Antigua & Barbuda"],
  ["AR", "Argentina"],
  ["AM", "Armenia"],
  ["AW", "Aruba"],
  ["AU", "Australia"],
  ["AT", "Austria"],
  ["AZ", "Azerbaijan"],
  ["BS", "Bahamas"],
  ["BH", "Bahrain"],
  ["BD", "Bangladesh"],
  ["BB", "Barbados"],
  ["BY", "Belarus"],
  ["BE", "Belgium"],
  ["BZ", "Belize"],
  ["BJ", "Benin"],
  ["BM", "Bermuda"],
  ["BT", "Bhutan"],
  ["BO", "Bolivia"],
  ["BA", "Bosnia & Herzegovina"],
  ["BW", "Botswana"],
  ["BV", "Bouvet Island"],
  ["BR", "Brazil"],
  ["IO", "British Indian Ocean Territory"],
  ["VG", "British Virgin Islands"],
  ["BN", "Brunei"],
  ["BG", "Bulgaria"],
  ["BF", "Burkina Faso"],
  ["BI", "Burundi"],
  ["KH", "Cambodia"],
  ["CM", "Cameroon"],
  ["CA", "Canada"],
  ["CV", "Cape Verde"],
  ["BQ", "Caribbean Netherlands"],
  ["KY", "Cayman Islands"],
  ["CF", "Central African Republic"],
  ["TD", "Chad"],
  ["CL", "Chile"],
  ["CN", "China"],
  ["CX", "Christmas Island"],
  ["CC", "Cocos (Keeling) Islands"],
  ["CO", "Colombia"],
  ["KM", "Comoros"],
  ["CD", "Congo (DRC)"],
  ["CG", "Congo (Republic)"],
  ["CK", "Cook Islands"],
  ["CR", "Costa Rica"],
  ["CI", "Côte d'Ivoire"],
  ["HR", "Croatia"],
  ["CU", "Cuba"],
  ["CW", "Curaçao"],
  ["CY", "Cyprus"],
  ["CZ", "Czechia"],
  ["DK", "Denmark"],
  ["DJ", "Djibouti"],
  ["DM", "Dominica"],
  ["DO", "Dominican Republic"],
  ["EC", "Ecuador"],
  ["EG", "Egypt"],
  ["SV", "El Salvador"],
  ["GQ", "Equatorial Guinea"],
  ["ER", "Eritrea"],
  ["EE", "Estonia"],
  ["SZ", "Eswatini"],
  ["ET", "Ethiopia"],
  ["FK", "Falkland Islands"],
  ["FO", "Faroe Islands"],
  ["FJ", "Fiji"],
  ["FI", "Finland"],
  ["FR", "France"],
  ["GF", "French Guiana"],
  ["PF", "French Polynesia"],
  ["TF", "French Southern Territories"],
  ["GA", "Gabon"],
  ["GM", "Gambia"],
  ["GE", "Georgia"],
  ["DE", "Germany"],
  ["GH", "Ghana"],
  ["GI", "Gibraltar"],
  ["GR", "Greece"],
  ["GL", "Greenland"],
  ["GD", "Grenada"],
  ["GP", "Guadeloupe"],
  ["GU", "Guam"],
  ["GT", "Guatemala"],
  ["GG", "Guernsey"],
  ["GN", "Guinea"],
  ["GW", "Guinea-Bissau"],
  ["GY", "Guyana"],
  ["HT", "Haiti"],
  ["HM", "Heard & McDonald Islands"],
  ["HN", "Honduras"],
  ["HK", "Hong Kong"],
  ["HU", "Hungary"],
  ["IS", "Iceland"],
  ["IN", "India"],
  ["ID", "Indonesia"],
  ["IR", "Iran"],
  ["IQ", "Iraq"],
  ["IE", "Ireland"],
  ["IM", "Isle of Man"],
  ["IT", "Italy"],
  ["JM", "Jamaica"],
  ["JP", "Japan"],
  ["JE", "Jersey"],
  ["JO", "Jordan"],
  ["KZ", "Kazakhstan"],
  ["KE", "Kenya"],
  ["KI", "Kiribati"],
  ["XK", "Kosovo"],
  ["KW", "Kuwait"],
  ["KG", "Kyrgyzstan"],
  ["LA", "Laos"],
  ["LV", "Latvia"],
  ["LB", "Lebanon"],
  ["LS", "Lesotho"],
  ["LR", "Liberia"],
  ["LY", "Libya"],
  ["LI", "Liechtenstein"],
  ["LT", "Lithuania"],
  ["LU", "Luxembourg"],
  ["MO", "Macao"],
  ["MG", "Madagascar"],
  ["MW", "Malawi"],
  ["MY", "Malaysia"],
  ["MV", "Maldives"],
  ["ML", "Mali"],
  ["MT", "Malta"],
  ["MH", "Marshall Islands"],
  ["MQ", "Martinique"],
  ["MR", "Mauritania"],
  ["MU", "Mauritius"],
  ["YT", "Mayotte"],
  ["MX", "Mexico"],
  ["FM", "Micronesia"],
  ["MD", "Moldova"],
  ["MC", "Monaco"],
  ["MN", "Mongolia"],
  ["ME", "Montenegro"],
  ["MS", "Montserrat"],
  ["MA", "Morocco"],
  ["MZ", "Mozambique"],
  ["MM", "Myanmar"],
  ["NA", "Namibia"],
  ["NR", "Nauru"],
  ["NP", "Nepal"],
  ["NL", "Netherlands"],
  ["NC", "New Caledonia"],
  ["NZ", "New Zealand"],
  ["NI", "Nicaragua"],
  ["NE", "Niger"],
  ["NG", "Nigeria"],
  ["NU", "Niue"],
  ["NF", "Norfolk Island"],
  ["KP", "North Korea"],
  ["MK", "North Macedonia"],
  ["MP", "Northern Mariana Islands"],
  ["NO", "Norway"],
  ["OM", "Oman"],
  ["PK", "Pakistan"],
  ["PW", "Palau"],
  ["PS", "Palestine"],
  ["PA", "Panama"],
  ["PG", "Papua New Guinea"],
  ["PY", "Paraguay"],
  ["PE", "Peru"],
  ["PH", "Philippines"],
  ["PN", "Pitcairn Islands"],
  ["PL", "Poland"],
  ["PT", "Portugal"],
  ["PR", "Puerto Rico"],
  ["QA", "Qatar"],
  ["RE", "Réunion"],
  ["RO", "Romania"],
  ["RU", "Russia"],
  ["RW", "Rwanda"],
  ["WS", "Samoa"],
  ["SM", "San Marino"],
  ["ST", "São Tomé & Príncipe"],
  ["SA", "Saudi Arabia"],
  ["SN", "Senegal"],
  ["RS", "Serbia"],
  ["SC", "Seychelles"],
  ["SL", "Sierra Leone"],
  ["SG", "Singapore"],
  ["SX", "Sint Maarten"],
  ["SK", "Slovakia"],
  ["SI", "Slovenia"],
  ["SB", "Solomon Islands"],
  ["SO", "Somalia"],
  ["ZA", "South Africa"],
  ["GS", "South Georgia & South Sandwich Islands"],
  ["KR", "South Korea"],
  ["SS", "South Sudan"],
  ["ES", "Spain"],
  ["LK", "Sri Lanka"],
  ["BL", "St. Barthélemy"],
  ["SH", "St. Helena"],
  ["KN", "St. Kitts & Nevis"],
  ["LC", "St. Lucia"],
  ["MF", "St. Martin"],
  ["PM", "St. Pierre & Miquelon"],
  ["VC", "St. Vincent & Grenadines"],
  ["SD", "Sudan"],
  ["SR", "Suriname"],
  ["SJ", "Svalbard & Jan Mayen"],
  ["SE", "Sweden"],
  ["CH", "Switzerland"],
  ["SY", "Syria"],
  ["TW", "Taiwan"],
  ["TJ", "Tajikistan"],
  ["TZ", "Tanzania"],
  ["TH", "Thailand"],
  ["TL", "Timor-Leste"],
  ["TG", "Togo"],
  ["TK", "Tokelau"],
  ["TO", "Tonga"],
  ["TT", "Trinidad & Tobago"],
  ["TN", "Tunisia"],
  ["TR", "Türkiye"],
  ["TM", "Turkmenistan"],
  ["TC", "Turks & Caicos Islands"],
  ["TV", "Tuvalu"],
  ["UM", "U.S. Outlying Islands"],
  ["VI", "U.S. Virgin Islands"],
  ["UG", "Uganda"],
  ["UA", "Ukraine"],
  ["AE", "United Arab Emirates"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
  ["UY", "Uruguay"],
  ["UZ", "Uzbekistan"],
  ["VU", "Vanuatu"],
  ["VA", "Vatican City"],
  ["VE", "Venezuela"],
  ["VN", "Vietnam"],
  ["WF", "Wallis & Futuna"],
  ["EH", "Western Sahara"],
  ["YE", "Yemen"],
  ["ZM", "Zambia"],
  ["ZW", "Zimbabwe"]
  ];
  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var DAYS_IN_MONTH = [31,29,31,30,31,30,31,31,30,31,30,31];   // no year is collected, so Feb allows 29

  var byCode = {};
  COUNTRIES.forEach(function(c){ byCode[c[0]] = c[1]; });

  function flag(code){
    code = String(code || "").toUpperCase();
    if(!/^[A-Z]{2}$/.test(code)) return "";
    return String.fromCodePoint(0x1F1E6 + code.charCodeAt(0) - 65, 0x1F1E6 + code.charCodeAt(1) - 65);
  }
  function countryName(code){ return byCode[String(code || "").toUpperCase()] || ""; }
  function isValidCountry(code){ return !!byCode[String(code || "").toUpperCase()]; }
  function daysInMonth(m){ return DAYS_IN_MONTH[(parseInt(m, 10) || 0) - 1] || 31; }

  function esc(s){
    return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ---- form helpers ------------------------------------------------------
  function fillCountrySelect(sel, selected){
    var html = "<option value=\"\">Select country</option>" + COUNTRIES.map(function(c){
      return "<option value=\"" + c[0] + "\">" + flag(c[0]) + "  " + esc(c[1]) + "</option>";
    }).join("");
    sel.innerHTML = html;
    sel.value = selected && isValidCountry(selected) ? String(selected).toUpperCase() : "";
  }
  function fillMonthSelect(sel, selected){
    sel.innerHTML = "<option value=\"\">Month</option>" + MONTHS.map(function(m, i){
      return "<option value=\"" + (i + 1) + "\">" + m + "</option>";
    }).join("");
    sel.value = selected ? String(selected) : "";
  }
  function fillDaySelect(sel, month, selected){
    var max = daysInMonth(month), html = "<option value=\"\">Day</option>";
    for(var d = 1; d <= max; d++) html += "<option value=\"" + d + "\">" + d + "</option>";
    sel.innerHTML = html;
    sel.value = selected && Number(selected) <= max ? String(selected) : "";
  }
  // Keeps the Day list valid for the chosen Month (e.g. 30 Feb is impossible).
  function linkDayToMonth(daySel, monthSel){
    monthSel.addEventListener("change", function(){ fillDaySelect(daySel, monthSel.value, daySel.value); });
  }

  // gender / dob / country  ->  { ok, error, values }
  function validate(v){
    var gender = v.gender === "male" || v.gender === "female" ? v.gender : "";
    var month = parseInt(v.month, 10), day = parseInt(v.day, 10), code = String(v.country || "").toUpperCase();
    if(!gender) return { ok:false, error:"Please select your gender." };
    if(!month || !day || day < 1 || day > daysInMonth(month)) return { ok:false, error:"Please select your birthday (day and month)." };
    if(!isValidCountry(code)) return { ok:false, error:"Please select your country." };
    return { ok:true, error:"", values:{ gender:gender, dob_day:day, dob_month:month, country:code } };
  }

  // ---- pill row (flag + gender + DOB) -----------------------------------
  function dobText(p){
    var d = parseInt(p && p.dob_day, 10), m = parseInt(p && p.dob_month, 10);
    return d && m && MONTHS[m - 1] ? d + " " + MONTHS[m - 1] : "";
  }
  function pillsHtml(p){
    if(!p) return "";
    var out = "";
    var f = flag(p.country);
    if(f) out += "<span class=\"pf-pill pf-flag\" title=\"" + esc(countryName(p.country)) + "\">" + f + "</span>";
    if(p.gender === "male")   out += "<span class=\"pf-pill pf-gender pf-male\" title=\"Male\">&#9794;&#xFE0E;</span>";
    if(p.gender === "female") out += "<span class=\"pf-pill pf-gender pf-female\" title=\"Female\">&#9792;&#xFE0E;</span>";
    var dob = dobText(p);
    if(dob) out += "<span class=\"pf-pill pf-dob\">&#127874; " + esc(dob) + "</span>";
    return out;
  }
  // Fills a container with the pill row and an optional bio element.
  function render(pillsEl, bioEl, p){
    if(pillsEl){
      var h = pillsHtml(p);
      pillsEl.innerHTML = h;
      pillsEl.style.display = h ? "flex" : "none";
    }
    if(bioEl){
      var bio = p && p.bio ? String(p.bio) : "";
      bioEl.textContent = bio;
      bioEl.style.display = bio ? "block" : "none";
    }
  }

  // ---- fetch someone else's extras (by user id or by ID number), cached for a minute -------------
  var cache = {};
  var FIELDS = "gender, country, dob_day, dob_month, bio";
  function load(who){
    if(!root.supabaseClient || !who) return Promise.resolve(null);
    var key = who.userId ? "u:" + who.userId : (who.idNumber && who.idNumber !== "\u2014" ? "n:" + who.idNumber : "");
    if(!key) return Promise.resolve(null);
    var hit = cache[key];
    if(hit && Date.now() - hit.at < 60000) return Promise.resolve(hit.data);
    var q = root.supabaseClient.from("profiles").select(FIELDS);
    q = who.userId ? q.eq("id", who.userId) : q.eq("id_number", String(who.idNumber));
    return q.maybeSingle().then(function(res){
      var data = res && !res.error ? res.data : null;
      if(data) cache[key] = { at: Date.now(), data: data };
      return data;
    }, function(){ return null; });
  }
  function forget(who){
    if(!who) return;
    if(who.userId) delete cache["u:" + who.userId];
    if(who.idNumber) delete cache["n:" + who.idNumber];
  }

  // ---- styles (injected once so every page looks the same) -------------
  var css =
    ".pf-pills{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;margin:8px 0 0;}" +
    ".pf-pill{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:24px;padding:2px 10px;border-radius:999px;" +
      "background:var(--teal-soft,#d3f3e8);color:var(--teal-deep,#05846a);font-size:.76rem;font-weight:700;line-height:1;white-space:nowrap;font-family:'Inter',system-ui,sans-serif;}" +
    ".pf-pill.pf-flag{font-size:1rem;padding:2px 9px;}" +
    ".pf-pill.pf-gender{font-size:.95rem;min-width:28px;padding:2px 8px;color:#fff;}" +
    ".pf-pill.pf-male{background:#3b82f6;}" +
    ".pf-pill.pf-female{background:#ec4899;}" +
    ".pf-bio{max-width:300px;margin:10px auto 0;text-align:center;font-size:.86rem;line-height:1.4;color:var(--ink-soft,#5c7770);word-break:break-word;overflow-wrap:anywhere;}" +
    ".tp-count{font-size:.72rem;font-weight:600;color:var(--ink-soft,#5c7770);}" +
    ".tp-count.tp-full{color:#b1362f;}";
  var st = document.createElement("style");
  st.setAttribute("data-profile-extras", "");
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  root.ProfileExtras = {
    COUNTRIES: COUNTRIES, MONTHS: MONTHS,
    flag: flag, countryName: countryName, isValidCountry: isValidCountry, daysInMonth: daysInMonth,
    fillCountrySelect: fillCountrySelect, fillMonthSelect: fillMonthSelect, fillDaySelect: fillDaySelect, linkDayToMonth: linkDayToMonth,
    validate: validate, pillsHtml: pillsHtml, render: render, load: load, forget: forget, dobText: dobText
  };
})(window);
