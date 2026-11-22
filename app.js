(function () {
  'use strict';

  // ── Settings ──
  var STORE_KEY = 'gachCalc.current.v2';   // the list being worked on now
  var HIST_KEY  = 'gachCalc.history.v2';   // saved older lists
  var HIST_MAX  = 100;
  var BN = '০১২৩৪৫৬৭৮৯';
  var MONTHS = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];

  function $(id) { return document.getElementById(id); }

  // ── Number helpers ──
  function toBn(s)    { return String(s).replace(/[0-9]/g, function (d) { return BN.charAt(+d); }); }
  function toLatin(s) { return String(s).replace(/[০-৯]/g, function (c) { return String(BN.indexOf(c)); }); }
  // 1234567 -> 12,34,567 (lakh grouping)
  function groupLakh(s) {
    if (s.length <= 3) return s;
    return s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3);
  }
  function fmtInt(n)   { return toBn(groupLakh(String(Math.round(n)))); }
  // wood is stored as whole thousandths of a cubic foot, so totals are exact
  function fmtMilli(m) { return toBn(groupLakh(String(Math.floor(m / 1000))) + '.' + ('00' + (m % 1000)).slice(-3)); }
  function trimNum(n)  { return String(Math.round(n * 100) / 100); }
  function fmtNum(n)   { var p = trimNum(n).split('.'); return toBn(groupLakh(p[0]) + (p[1] ? '.' + p[1] : '')); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Accepts Bengali or English digits; comma = decimal point for measurements
  function parseNum(raw, commaIsDecimal) {
    var s = toLatin(raw == null ? '' : raw).replace(/\s+/g, '');
    s = commaIsDecimal ? s.replace(/,/g, '.') : s.replace(/,/g, '');
    if (s === '') return { empty: true };
    if (s === '.' || !/^\d*\.?\d*$/.test(s)) return { bad: true };
    return { val: parseFloat(s) };
  }

  // Quarter-girth formula: girth(in)² × length(ft) ÷ 2304  → cubic feet
  function calcMilli(g, ft) { return Math.round(g * g * ft / 2304 * 1000); }

  function lenText(t) { return fmtNum(t.ft) + ' ফুট'; }
  function totalMilli(trees) { var s = 0; for (var i = 0; i < trees.length; i++) s += trees[i].m; return s; }
  function rateOf(raw) { var r = parseNum(raw, false); return (r.val > 0) ? r.val : null; }
  function priceOf(trees, rateRaw) {
    var r = rateOf(rateRaw);
    if (r === null || !trees.length) return null;
    return Math.round(totalMilli(trees) * r / 1000);
  }
  function fmtDate(ms) {
    var d = new Date(ms), h = d.getHours(), m = d.getMinutes();
    var part = h < 4 ? 'রাত' : h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকাল' : h < 20 ? 'সন্ধ্যা' : 'রাত';
    return toBn(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + toBn(d.getFullYear()) +
      ', ' + part + ' ' + toBn(h % 12 || 12) + ':' + toBn(('0' + m).slice(-2));
  }

  // Validates one set of measurements (used by the main form and by edit)
  function readMeasure(gRaw, fRaw) {
    var g = parseNum(gRaw, true), f = parseNum(fRaw, true);
    var r = { ok: false, empty: false, missing: false, err: '', mark: { g: false, f: false } };
    if (g.empty && f.empty) {
      r.empty = true; r.err = 'আগে বেড় ও লম্বা লিখুন'; r.mark.g = r.mark.f = true; return r;
    }
    if (g.bad || f.bad) {
      r.err = 'শুধু সংখ্যা লিখুন'; r.mark = { g: !!g.bad, f: !!f.bad }; return r;
    }
    if (g.empty || f.empty) {
      r.missing = true; r.mark.g = !!g.empty; r.mark.f = !!f.empty;
      r.err = g.empty ? 'বেড় কত ইঞ্চি লিখুন' : 'লম্বা কত ফুট লিখুন';
      return r;
    }
    if (g.val === 0) { r.err = 'বেড় শূন্য হতে পারে না'; r.mark.g = true; return r; }
    if (f.val === 0) { r.err = 'লম্বা শূন্য হতে পারে না'; r.mark.f = true; return r; }
    r.ok = true; r.g = g.val; r.ft = f.val; r.m = calcMilli(g.val, f.val);
    return r;
  }

  // ── Storage (everything is saved after every change) ──
  var state = { trees: [], rate: '', name: '' };
  var editIndex = -1;

  function cleanTrees(arr) {
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (t) {
      if (!t) return;
      var g = +t.g, ft = +t.ft || 0;
      if (+t.inch > 0) ft = Math.round((ft + t.inch / 12) * 100) / 100;   // inch value saved by the earlier test version
      if (g > 0 && ft > 0) out.push({ g: g, ft: ft, m: calcMilli(g, ft) });
    });
    return out;
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s) state = { trees: cleanTrees(s.trees), rate: s.rate || '', name: s.name || '' };
    } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }
  function loadHist() {
    try { var h = JSON.parse(localStorage.getItem(HIST_KEY)); return Array.isArray(h) ? h : []; } catch (e) { return []; }
  }
  function saveHist(h) {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, HIST_MAX))); return true; } catch (e) { return false; }
  }
  function makeLot(src) {
    return { id: Date.now() + '-' + Math.floor(Math.random() * 1e6), at: Date.now(),
             name: src.name || '', rate: src.rate || '', trees: src.trees.slice() };
  }

  // ── Toast / undo bar ──
  var toastTimer = null, toastAction = null;
  function toast(msg, opt) {
    opt = opt || {};
    $('toastMsg').textContent = msg;
    var btn = $('toastBtn');
    if (opt.action) { btn.textContent = opt.action; btn.style.display = ''; toastAction = opt.onAction; }
    else { btn.style.display = 'none'; toastAction = null; }
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, opt.ms || 2800);
  }
  function hideToast() { $('toast').classList.remove('show'); toastAction = null; }
  $('toastBtn').addEventListener('click', function (e) {
    e.stopPropagation(); var f = toastAction; hideToast(); if (f) f();
  });
  $('toast').addEventListener('click', hideToast);
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(40); } catch (e) {} }

  // ── Layers: sheet + full-screen views. The phone's Back button closes them. ──
  var layers = [], afterPop = null, navOK = true;
  try { history.replaceState({ depth: 0 }, ''); } catch (e) { navOK = false; }
  function updateLock() {
    document.body.classList.toggle('locked', !!document.querySelector('.view.show'));
  }
  function openLayer(closeFn) {
    layers.push(closeFn);
    if (navOK) { try { history.pushState({ depth: layers.length }, ''); } catch (e) { navOK = false; } }
    updateLock();
  }
  function closeLayersTo(depth) {
    while (layers.length > depth) { var f = layers.pop(); f(); }
    updateLock();
  }
  function goBack(n, then) {
    n = Math.min(n || 1, layers.length);
    if (n <= 0) { if (then) then(); return; }
    if (!navOK) { closeLayersTo(layers.length - n); if (then) then(); return; }
    afterPop = then || null;
    history.go(-n);
  }
  window.addEventListener('popstate', function (e) {
    var d = (e.state && typeof e.state.depth === 'number') ? e.state.depth : 0;
    closeLayersTo(Math.min(d, layers.length));
    var f = afterPop; afterPop = null; if (f) f();
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-back]')) goBack(1);
  });

  // ── Confirm sheet ──
  var sheetYesFn = null;
  function confirmSheet(o) {
    $('sheetTitle').textContent = o.title;
    $('sheetText').textContent = o.text;
    $('sheetYes').textContent = o.yes;
    $('sheetYes').className = 'sheet-yes' + (o.danger ? ' danger' : '');
    sheetYesFn = o.onYes;
    $('overlay').classList.add('show');
    openLayer(function () { $('overlay').classList.remove('show'); });
  }
  $('sheetYes').addEventListener('click', function () {
    var f = sheetYesFn; sheetYesFn = null;
    if (f) f(); else goBack(1);
  });
  $('sheetNo').addEventListener('click', function () { sheetYesFn = null; goBack(1); });
  $('overlay').addEventListener('click', function (e) { if (e.target === this) { sheetYesFn = null; goBack(1); } });

  // ── Main measurement form ──
  var inG = $('inG'), inF = $('inF');

  function setLive(m, ph) {
    var el = $('liveVal');
    if (m === null) { el.className = 'lr-value muted'; el.textContent = ph || '— ঘনফুট'; }
    else { el.className = 'lr-value'; el.textContent = fmtMilli(m) + ' ঘনফুট'; }
  }
  function markMain(mark) {
    inG.classList.toggle('err', !!mark.g); inF.classList.toggle('err', !!mark.f);
  }
  function showErr(m) { var e = $('errMsg'); e.textContent = '⚠️ ' + m; e.classList.add('show'); }
  function hideErr()  { $('errMsg').classList.remove('show'); }

  function onMainInput() {
    var r = readMeasure(inG.value, inF.value);
    markMain({}); hideErr();
    if (r.ok)      { setLive(r.m); return; }
    if (r.empty)   { setLive(null); return; }
    if (r.missing) { setLive(null, 'বাকি ঘর পূরণ করুন'); return; }
    setLive(null); showErr(r.err); markMain(r.mark);
  }

  function tryAdd() {
    var r = readMeasure(inG.value, inF.value);
    if (!r.ok) {
      showErr(r.err); markMain(r.mark);
      (r.mark.g || !r.mark.f ? inG : inF).focus();
      return;
    }
    state.trees.push({ g: r.g, ft: r.ft, m: r.m });
    var n = state.trees.length;
    inG.value = inF.value = '';
    markMain({}); hideErr(); setLive(null);
    editIndex = -1;
    renderAll();
    flashRow(n - 1);
    toast('✓ ' + toBn(n) + ' নম্বর গাছ যোগ হয়েছে — ' + fmtMilli(r.m) + ' ঘনফুট');
    buzz();
    inG.focus();
  }

  function isEnter(e) { return e.key === 'Enter' || e.keyCode === 13; }
  [inG, inF].forEach(function (el) { el.addEventListener('input', onMainInput); });
  inG.addEventListener('keydown', function (e) { if (isEnter(e)) { e.preventDefault(); inF.focus(); } });
  inF.addEventListener('keydown', function (e) { if (isEnter(e)) { e.preventDefault(); tryAdd(); } });
  $('addBtn').addEventListener('click', tryAdd);

  // ── Tree list ──
  function rowHTML(i) {
    var t = state.trees[i];
    return '<div class="tree-row" data-i="' + i + '">' +
      '<div class="tr-info">' +
        '<div class="tr-head"><span class="tr-num">' + toBn(i + 1) + '</span>' +
          '<span class="tr-wood">' + fmtMilli(t.m) + ' <small>ঘনফুট</small></span></div>' +
        '<div class="tr-size">বেড় ' + fmtNum(t.g) + ' ইঞ্চি<br>লম্বা ' + lenText(t) + '</div>' +
      '</div>' +
      '<div class="tr-btns">' +
        '<button type="button" class="btn-edit" data-act="edit" data-i="' + i + '">✏️ ঠিক করুন</button>' +
        '<button type="button" class="btn-del" data-act="del" data-i="' + i + '">✕ মুছুন</button>' +
      '</div>' +
    '</div>';
  }
  function editRowHTML(i) {
    var t = state.trees[i];
    var attrs = ' inputmode="decimal" enterkeyhint="done" autocomplete="off" autocorrect="off" spellcheck="false"';
    return '<div class="tree-row editing" data-i="' + i + '">' +
      '<div class="ed-title">' + toBn(i + 1) + ' নম্বর গাছের মাপ ঠিক করুন</div>' +
      '<div class="ed-grid">' +
        '<label>বেড় (ইঞ্চি)<input type="text" class="num-input e-g"' + attrs + ' value="' + toBn(trimNum(t.g)) + '"></label>' +
        '<label>লম্বা (ফুট)<input type="text" class="num-input e-f"' + attrs + ' value="' + toBn(trimNum(t.ft)) + '"></label>' +
      '</div>' +
      '<div class="ed-live"></div>' +
      '<div class="err-msg ed-err" role="alert"></div>' +
      '<div class="ed-actions">' +
        '<button type="button" class="ed-save" data-act="save" data-i="' + i + '">✔ সেভ করুন</button>' +
        '<button type="button" class="ed-cancel" data-act="cancel" data-i="' + i + '">বাতিল</button>' +
      '</div>' +
    '</div>';
  }
  function renderList() {
    var html = '';
    for (var i = state.trees.length - 1; i >= 0; i--) html += (i === editIndex) ? editRowHTML(i) : rowHTML(i);
    $('treeList').innerHTML = html || '<div class="empty">এখনো কোনো গাছ যোগ হয়নি</div>';
    $('listHint').style.display = state.trees.length > 1 ? '' : 'none';
    if (editIndex >= 0) updateEditLive();
  }
  function rowEl(i) { return $('treeList').querySelector('.tree-row[data-i="' + i + '"]'); }
  function flashRow(i) { var r = rowEl(i); if (r) { r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); } }

  function readEdit() {
    var row = rowEl(editIndex); if (!row) return null;
    return { row: row, r: readMeasure(row.querySelector('.e-g').value, row.querySelector('.e-f').value) };
  }
  function updateEditLive() {
    var x = readEdit(); if (!x) return;
    var row = x.row, r = x.r, live = row.querySelector('.ed-live'), err = row.querySelector('.ed-err');
    ['.e-g', '.e-f'].forEach(function (s) { row.querySelector(s).classList.remove('err'); });
    err.classList.remove('show');
    live.textContent = r.ok ? 'নতুন পরিমাণ: ' + fmtMilli(r.m) + ' ঘনফুট' : '';
  }
  function startEdit(i) {
    editIndex = i; renderList();
    var row = rowEl(i);
    if (row) { try { row.scrollIntoView({ block: 'center' }); } catch (e) {} row.querySelector('.e-g').focus(); }
  }
  function saveEdit() {
    var x = readEdit(); if (!x) return;
    var row = x.row, r = x.r;
    if (!r.ok) {
      var err = row.querySelector('.ed-err');
      err.textContent = '⚠️ ' + r.err; err.classList.add('show');
      row.querySelector('.e-g').classList.toggle('err', !!r.mark.g);
      row.querySelector('.e-f').classList.toggle('err', !!r.mark.f);
      return;
    }
    var i = editIndex;
    state.trees[i] = { g: r.g, ft: r.ft, m: r.m };
    editIndex = -1; renderAll(); flashRow(i);
    toast('✓ ' + toBn(i + 1) + ' নম্বর গাছের মাপ ঠিক করা হয়েছে');
  }
  function cancelEdit() { editIndex = -1; renderList(); }

  function delTree(i) {
    editIndex = -1;
    var removed = state.trees.splice(i, 1)[0];
    renderAll();
    toast(toBn(i + 1) + ' নম্বর গাছ মুছে ফেলা হয়েছে', {
      action: '↩ ফিরিয়ে আনুন', ms: 8000,
      onAction: function () {
        var at = Math.min(i, state.trees.length);
        state.trees.splice(at, 0, removed);
        editIndex = -1; renderAll(); flashRow(at);
        toast('✓ গাছটি আবার তালিকায় ফিরে এসেছে');
      }
    });
  }

  var list = $('treeList');
  list.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var i = +b.getAttribute('data-i'), act = b.getAttribute('data-act');
    if (act === 'edit') startEdit(i);
    else if (act === 'del') delTree(i);
    else if (act === 'save') saveEdit();
    else if (act === 'cancel') cancelEdit();
  });
  list.addEventListener('input', function (e) { if (e.target.closest('.editing')) updateEditLive(); });
  list.addEventListener('keydown', function (e) {
    if (isEnter(e) && e.target.closest('.editing')) { e.preventDefault(); saveEdit(); }
  });

  // ── Totals, rate, name ──
  function renderTotals() {
    $('sumTrees').textContent = toBn(state.trees.length);
    $('sumWood').textContent = fmtMilli(totalMilli(state.trees));
    var rr = parseNum(state.rate, false);
    $('rate').classList.toggle('err', !!rr.bad);
    $('rateErr').classList.toggle('show', !!rr.bad);
    var p = priceOf(state.trees, state.rate);
    $('finalVal').textContent = p === null ? '৳ —' : '৳ ' + fmtInt(p);
  }
  function renderHistBtn() {
    var n = loadHist().length;
    $('historyBtn').textContent = '📂 আগের হিসাব দেখুন' + (n ? ' (' + toBn(n) + 'টি)' : '');
  }
  function renderAll() {
    renderList(); renderTotals(); renderHistBtn();
    if (!save()) toast('⚠️ ফোনে জায়গা কম — হিসাব সেভ করা যাচ্ছে না', { ms: 5000 });
  }
  $('rate').addEventListener('input', function () { state.rate = this.value; renderTotals(); save(); });
  $('lotName').addEventListener('input', function () { state.name = this.value; save(); });
  [$('rate'), $('lotName')].forEach(function (el) {
    el.addEventListener('keydown', function (e) { if (isEnter(e)) { e.preventDefault(); el.blur(); } });
  });

  // ── Share ──
  function shareTextFor(lot, when) {
    var L = ['🌳 গাছের হিসাব'];
    if (lot.name) L.push('নাম: ' + lot.name);
    L.push('তারিখ: ' + fmtDate(when), '');
    lot.trees.forEach(function (t, i) {
      L.push(toBn(i + 1) + ') বেড় ' + fmtNum(t.g) + ' ইঞ্চি, লম্বা ' + lenText(t) + ' = ' + fmtMilli(t.m) + ' ঘনফুট');
    });
    L.push('', 'মোট গাছ: ' + toBn(lot.trees.length) + 'টি', 'মোট কাঠ: ' + fmtMilli(totalMilli(lot.trees)) + ' ঘনফুট');
    var p = priceOf(lot.trees, lot.rate);
    if (p !== null) L.push('দর: প্রতি ঘনফুট ৳ ' + fmtNum(rateOf(lot.rate)), 'মোট দাম: ৳ ' + fmtInt(p));
    return L.join('\n');
  }
  function legacyCopy(t) {
    var ta = document.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta); return ok;
  }
  function copyText(text) {
    function done() { toast('✓ হিসাব কপি হয়েছে — WhatsApp বা SMS-এ পেস্ট করুন', { ms: 4500 }); }
    function fail() { toast('⚠️ পাঠানো যায়নি'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text) ? done() : fail(); });
    } else { legacyCopy(text) ? done() : fail(); }
  }
  function doShare(text) {
    if (navigator.share) {
      navigator.share({ text: text }).catch(function (err) { if (!err || err.name !== 'AbortError') copyText(text); });
    } else copyText(text);
  }
  $('shareBtn').addEventListener('click', function () {
    if (!state.trees.length) { toast('আগে অন্তত একটি গাছ যোগ করুন'); return; }
    doShare(shareTextFor(state, Date.now()));
  });

  // ── New list (current list is kept in history, never thrown away) ──
  function clearForm() { inG.value = inF.value = ''; onMainInput(); }
  function doNewLot() {
    var h = loadHist(); h.unshift(makeLot(state));
    if (!saveHist(h)) { toast('⚠️ জমা রাখা যায়নি, তাই কিছু মোছা হয়নি', { ms: 5000 }); return; }
    state.trees = []; state.name = ''; editIndex = -1;          // rate is kept for the next list
    $('lotName').value = ''; clearForm(); renderAll();
    window.scrollTo(0, 0);
    toast('✓ আগের হিসাব জমা হয়েছে। এখন নতুন হিসাব শুরু করুন।', { ms: 3500 });
  }
  $('newBtn').addEventListener('click', function () {
    if (!state.trees.length) { clearForm(); toast('তালিকায় কোনো গাছ নেই — নতুন হিসাব শুরু করতে পারেন'); return; }
    confirmSheet({
      title: 'নতুন হিসাব শুরু করবেন?',
      text: 'এখনকার হিসাবটি (' + toBn(state.trees.length) + 'টি গাছ) "আগের হিসাব"-এ জমা থাকবে। পরে আবার দেখতে পারবেন।',
      yes: 'হ্যাঁ, নতুন শুরু করুন',
      onYes: function () { goBack(1, doNewLot); }
    });
  });

  // ── History views ──
  var detailId = null;
  function renderHistory() {
    var h = loadHist(), html = '';
    h.forEach(function (l) {
      var trees = cleanTrees(l.trees), p = priceOf(trees, l.rate);
      html += '<button type="button" class="hist-card" data-id="' + esc(l.id) + '">' +
        '<div class="hc-name">' + esc(l.name || 'নাম ছাড়া হিসাব') + '</div>' +
        '<div class="hc-date">' + fmtDate(l.at) + '</div>' +
        '<div class="hc-sum">' + toBn(trees.length) + 'টি গাছ · ' + fmtMilli(totalMilli(trees)) + ' ঘনফুট' +
          (p !== null ? '<br>মোট দাম ৳ ' + fmtInt(p) : '') + '</div>' +
        '<span class="hc-go">দেখুন ›</span>' +
      '</button>';
    });
    $('histList').innerHTML = html ||
      '<div class="empty">এখনো কোনো আগের হিসাব নেই।<br>"নতুন হিসাব শুরু করুন" চাপলে এখনকার হিসাব এখানে জমা হয়।</div>';
  }
  function findLot(id) { var h = loadHist(); for (var i = 0; i < h.length; i++) if (h[i].id === id) return { h: h, i: i }; return null; }

  function renderDetail(id) {
    var f = findLot(id); if (!f) return false;
    var l = f.h[f.i], trees = cleanTrees(l.trees), p = priceOf(trees, l.rate), lines = '';
    trees.forEach(function (t, i) {
      lines += '<div class="detail-line">' + toBn(i + 1) + ') বেড় ' + fmtNum(t.g) + ' ইঞ্চি, লম্বা ' + lenText(t) +
        ' = <b>' + fmtMilli(t.m) + ' ঘনফুট</b></div>';
    });
    $('detailTitle').textContent = l.name || 'নাম ছাড়া হিসাব';
    $('detailBody').innerHTML =
      '<div class="section"><div class="sec-head">🗓️ ' + fmtDate(l.at) + '</div>' +
        '<div class="sum-row" style="border-bottom:none">' +
          '<div class="sum-cell"><div class="sum-label">মোট গাছ</div><div class="sum-val">' + toBn(trees.length) + '</div></div>' +
          '<div class="sum-cell"><div class="sum-label">মোট কাঠ (ঘনফুট)</div><div class="sum-val">' + fmtMilli(totalMilli(trees)) + '</div></div>' +
        '</div>' +
        (p !== null ?
          '<div class="final-bar" style="margin-bottom:12px"><span class="fb-label">দর ৳ ' + fmtNum(rateOf(l.rate)) +
          ' · মোট দাম</span><span class="fb-value">৳ ' + fmtInt(p) + '</span></div>' : '') +
      '</div>' +
      '<div class="section"><div class="sec-head">📋 গাছের তালিকা</div><div class="detail-lines">' + lines + '</div></div>' +
      '<button type="button" class="btn-wide btn-history" id="dShare">📤 হিসাব পাঠান (WhatsApp বা SMS)</button>' +
      '<button type="button" class="btn-wide btn-new" id="dOpen">↩️ এই হিসাবটি আবার খুলুন</button>' +
      '<button type="button" class="btn-wide btn-danger-outline" id="dDel">🗑️ এই হিসাবটি মুছে ফেলুন</button>';
    $('dShare').onclick = function () { doShare(shareTextFor({ name: l.name, rate: l.rate, trees: trees }, l.at)); };
    $('dOpen').onclick = function () { goBack(layers.length, function () { restoreLot(id); }); };
    $('dDel').onclick = function () {
      confirmSheet({
        title: 'হিসাবটি মুছে ফেলবেন?',
        text: 'এই হিসাবটি একেবারে মুছে যাবে, আর ফেরত আনা যাবে না।',
        yes: 'হ্যাঁ, মুছে দিন', danger: true,
        onYes: function () {
          goBack(2, function () {   // close sheet + detail, stay on the history list
            var g = findLot(id);
            if (g) { g.h.splice(g.i, 1); saveHist(g.h); }
            renderHistory(); renderHistBtn();
            toast('হিসাবটি মুছে ফেলা হয়েছে');
          });
        }
      });
    };
    return true;
  }
  function restoreLot(id) {
    var f = findLot(id); if (!f) return;
    var h = f.h, lot = h.splice(f.i, 1)[0], kept = false;
    if (state.trees.length) { h.unshift(makeLot(state)); kept = true; }
    if (!saveHist(h)) { toast('⚠️ খোলা যায়নি — ফোনে জায়গা কম', { ms: 5000 }); return; }
    state = { trees: cleanTrees(lot.trees), rate: lot.rate || '', name: lot.name || '' };
    editIndex = -1;
    $('rate').value = state.rate; $('lotName').value = state.name;
    clearForm(); renderAll(); window.scrollTo(0, 0);
    toast(kept ? '✓ পুরনো হিসাবটি খোলা হয়েছে। এখনকার হিসাবটি "আগের হিসাব"-এ জমা আছে।'
               : '✓ পুরনো হিসাবটি খোলা হয়েছে', { ms: 4500 });
  }

  $('historyBtn').addEventListener('click', function () {
    hideToast();   // never let a message cover the Back button
    renderHistory();
    $('viewHistory').classList.add('show'); $('viewHistory').scrollTop = 0;
    openLayer(function () { $('viewHistory').classList.remove('show'); });
  });
  $('histList').addEventListener('click', function (e) {
    var c = e.target.closest('.hist-card'); if (!c) return;
    var id = c.getAttribute('data-id');
    if (!renderDetail(id)) return;
    detailId = id;
    $('viewDetail').classList.add('show'); $('viewDetail').scrollTop = 0;
    openLayer(function () { $('viewDetail').classList.remove('show'); detailId = null; });
  });

  // ── Install prompt ──
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferredPrompt = e; $('installBar').classList.add('show');
  });
  $('installBtn').addEventListener('click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () { deferredPrompt = null; $('installBar').classList.remove('show'); });
  });
  $('installClose').addEventListener('click', function () { $('installBar').classList.remove('show'); });
  window.addEventListener('appinstalled', function () { $('installBar').classList.remove('show'); });

  // ── Service worker (offline) ──
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }

  // ── Start ──
  load();
  $('rate').value = state.rate;
  $('lotName').value = state.name;
  renderAll();
  onMainInput();
})();
