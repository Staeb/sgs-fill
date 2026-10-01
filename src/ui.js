var SF = SF || {};

(function () {
  var VERSION = '__VERSION__';
  var $ = function (id) { return document.getElementById(id); };
  var state = { table: [], sheets: null, target: 'score', payloadText: '', guess: null, result: null,
                pp5: null, manual: false, phase: null, sheetIndex: 0 };

  function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }
  function mk(tag, text, cls) {
    var e = document.createElement(tag);
    if (text !== undefined) { e.textContent = text; }
    if (cls) { e.className = cls; }
    return e;
  }
  var SVG_NS = ['http:', '', 'www.w3.org', '2000', 'svg'].join('/');
  /* ไอคอน Lucide จากสไปรต์ที่ฝังในหน้า (site/icons.svg) */
  function icon(name, cls) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }
  function checked(name) {
    var found = document.querySelector('input[name=' + name + ']:checked');
    return found ? found.value : '';
  }
  function isStrict() { return checked('mode') === 'strict'; }
  function colName(i) {
    var s = '';
    for (var n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; }
    return s;
  }
  function headerRow() { return Math.max(1, parseInt($('headerRow').value, 10) || 1) - 1; }
  function header() { return state.table[headerRow()] || []; }
  function say(id, text) { $(id).textContent = text; }

  function columnOptions(select, selected) {
    clear(select);
    var none = mk('option', '— ไม่ใช้ —');
    none.value = '-1';
    select.appendChild(none);
    header().forEach(function (h, i) {
      var o = mk('option', colName(i) + ': ' + (String(h).trim() || '(ไม่มีหัว)'));
      o.value = String(i);
      select.appendChild(o);
    });
    select.value = String(selected === undefined ? -1 : selected);
  }

  var PREVIEW_ROWS = 40;

  /* สถานะของเซลล์หนึ่งช่อง — ใช้กฎเดียวกับ SF.validate เพื่อให้สีบนหน้าตรงกับที่ตัวตรวจตัดสินจริง
     ว่างกับเครื่องหมาย (ขส/ร/มส) ไม่ใช่ศูนย์ และไม่ถูกกรอก */
  function cellState(raw, limit) {
    if (SF.isBlank(raw)) { return { cls: 'blank', text: 'ว่าง' }; }
    var text = String(raw).trim();
    var n = SF.parseNumber(raw);
    if (n === null) { return { cls: 'marker', text: text }; }
    if (n < 0) { return { cls: 'bad', text: text, note: 'ติดลบ' }; }
    if (typeof limit === 'number' && n > limit) { return { cls: 'bad', text: text, note: 'เกินคะแนนเต็ม ' + limit }; }
    if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) { return { cls: 'bad', text: text, note: 'ทศนิยมเกิน 2 ตำแหน่ง' }; }
    return { cls: 'ok', text: text };
  }

  function chip(text, skip, arrow) {
    var c = mk('span', undefined, 'map' + (skip ? ' skip' : ''));
    if (arrow) { c.appendChild(icon('arrow-right', 'sm')); }
    c.appendChild(document.createTextNode(text));
    return c;
  }

  /* ตารางตัวอย่าง "สิ่งที่จะกรอกลง SGS": หัวคอลัมน์บอกว่ากรอกลงช่องไหน เซลล์บอกสถานะ */
  function renderPreview(cfg) {
    var t = $('preview');
    clear(t);
    if (!state.table.length) {
      var e = mk('tbody');
      var er = mk('tr', undefined, 'empty-row');
      var ec = mk('td', 'ยังไม่มีข้อมูล — วางจาก Excel หรือเลือกไฟล์ที่ขั้นตอนที่ 2');
      er.appendChild(ec);
      e.appendChild(er);
      t.appendChild(e);
      return;
    }
    var target = SF.TARGETS[state.target];
    var fieldOfCol = {};
    target.fields.forEach(function (f) {
      if (cfg.fieldCols[f.id] !== undefined) { fieldOfCol[cfg.fieldCols[f.id]] = f; }
    });
    var head = header();
    var thead = mk('thead');
    var htr = mk('tr');
    head.forEach(function (h, c) {
      var th = mk('th', String(h).trim() || '(ไม่มีหัว)');
      var f = fieldOfCol[c];
      if (c === cfg.codeCol) { th.appendChild(chip('รหัสนักเรียน')); }
      else if (f) {
        var full = cfg.maxByField[f.id];
        th.appendChild(chip(f.id + (typeof full === 'number' ? ' · เต็ม ' + full : ''), false, true));
        if (target.kind === 'score') { th.className = 'n'; }
      } else { th.appendChild(chip('ไม่ใช้', true)); }
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    t.appendChild(thead);
    var body = mk('tbody');
    var rows = state.table.slice(headerRow() + 1);
    rows.slice(0, PREVIEW_ROWS).forEach(function (row) {
      var tr = mk('tr');
      head.forEach(function (_, c) {
        var f = fieldOfCol[c];
        var td;
        if (f) {
          var limit = target.kind === 'matrix' ? target.limit : cfg.maxByField[f.id];
          var st = cellState(row[c], limit);
          td = mk('td', st.text, (st.cls === 'ok' ? '' : st.cls) + (target.kind === 'score' ? ' n' : ''));
          if (st.note) { td.appendChild(mk('small', st.note)); }
        } else {
          td = mk('td', row[c] === undefined || row[c] === null ? '' : String(row[c]),
            c === cfg.codeCol ? 'code' : 'dim');
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    if (rows.length > PREVIEW_ROWS) {
      var more = mk('tr', undefined, 'more');
      var mc = mk('td', 'และอีก ' + (rows.length - PREVIEW_ROWS) + ' แถว (ไม่แสดงในตัวอย่าง แต่ถูกตรวจครบ)');
      mc.colSpan = Math.max(1, head.length);
      more.appendChild(mc);
      body.appendChild(more);
    }
    t.appendChild(body);
  }

  function renderMapping(reguess) {
    var target = SF.TARGETS[state.target];
    if (reguess) { state.guess = SF.guessColumns(header(), state.target); }
    columnOptions($('codeCol'), state.guess.codeCol);
    var box = $('fieldMaps');
    clear(box);
    target.fields.forEach(function (f) {
      var row = mk('div', undefined, 'row-map');
      row.appendChild(mk('span', f.label, 'name'));
      var sel = mk('select');
      sel.id = 'map_' + f.id;
      columnOptions(sel, state.guess.fieldCols[f.id]);
      sel.addEventListener('change', recompute);
      row.appendChild(sel);
      var stats = mk('span', '', 'hint');
      stats.id = 'stats_' + f.id;
      row.appendChild(stats);
      if (target.kind === 'score') {
        var mx = mk('input');
        mx.type = 'number';
        mx.id = 'max_' + f.id;
        mx.placeholder = 'คะแนนเต็ม (ไม่บังคับ)';
        mx.style.width = '11rem';
        mx.addEventListener('input', recompute);
        row.appendChild(mx);
      }
      box.appendChild(row);
    });
    var presets = $('presets');
    clear(presets);
    if (state.target === 'reading') {
      var label = mk('label');
      var cb = mk('input');
      cb.type = 'checkbox';
      cb.id = 'fill45';
      cb.checked = true;
      cb.addEventListener('change', recompute);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' เติมช่อง 4 และ 5 = ค่าเฉลี่ยปัดเศษของครั้งที่ 1-3 (ให้ผลที่ SGS คำนวณเท่ากับที่ประเมินไว้)'));
      presets.appendChild(label);
    } else if (state.target === 'desirable') {
      presets.appendChild(mk('span', 'ช่องที่ไม่จับคู่ (เช่น ข้อ 9-10) จะเว้นว่างบน SGS', 'hint'));
    }
  }

  function config() {
    var target = SF.TARGETS[state.target];
    var fieldCols = {};
    var maxByField = {};
    target.fields.forEach(function (f) {
      var v = parseInt($('map_' + f.id).value, 10);
      if (v >= 0) { fieldCols[f.id] = v; }
      var m = $('max_' + f.id);
      if (m && m.value !== '') { maxByField[f.id] = parseFloat(m.value); }
    });
    /* เติมช่อง 4-5 ให้อัตโนมัติ จึงเมินคอลัมน์ 4-5 ในไฟล์ถูกเมิน จะมีค่าแปลก ๆ หรือว่างก็ไม่กระทบการตรวจ */
    if (state.target === 'reading' && $('fill45') && $('fill45').checked) {
      delete fieldCols.L4;
      delete fieldCols.L5;
    }
    return {
      targetKey: state.target, codeCol: parseInt($('codeCol').value, 10),
      fieldCols: fieldCols, pad: parseInt($('pad').value, 10) || 0, maxByField: maxByField
    };
  }

  function line(kind, text, small) {
    var d = mk('div', undefined, 'line ' + kind);
    d.appendChild(icon(kind === 'ok' ? 'circle-check' : kind === 'bad' ? 'circle-x' : 'triangle-alert'));
    var body = mk('div');
    body.appendChild(document.createTextNode(text));
    if (small) { body.appendChild(mk('small', small)); }
    d.appendChild(body);
    return d;
  }

  function shortList(codes) {
    return codes.slice(0, 8).join(', ') + (codes.length > 8 ? ' และอีก ' + (codes.length - 8) + ' รหัส' : '');
  }

  function dataRowCount() { return Math.max(0, state.table.length - headerRow() - 1); }

  function setStepState(n, done) { $('tab' + n).classList.toggle('done', !!done); }

  function pill(id, kind, iconName, text) {
    var el = $(id);
    clear(el);
    el.className = 'pill ' + kind;
    el.hidden = !text;
    if (text) { el.appendChild(icon(iconName, 'sm')); el.appendChild(document.createTextNode(text)); }
  }

  /* ตราประทับ · ตัวเลขที่แถบท้ายจอ · สรุปของแต่ละขั้นตอน */
  function paintSummary(result) {
    var rows = dataRowCount();
    var label = SF.TARGETS[state.target].label;
    $('sum2').textContent = rows ? label : '';
    var fileInfo = state.pp5
      ? 'ปพ.5' + (state.pp5.subject ? ' ' + state.pp5.subject : '') + (state.pp5.room ? ' · ' + state.pp5.room : '') + ' · '
      : '';
    $('sum1').textContent = rows ? fileInfo + rows + ' แถว' : '';
    var meta = [$('subject').value.trim(), $('section').value.trim() ? 'กลุ่ม ' + $('section').value.trim() : '', label];
    if (!$('phaseBox').hidden && checked('phase')) {
      meta.push(checked('phase') === 'post' ? 'หลังกลางภาค + ปลายภาค' : 'ก่อนกลางภาค + กลางภาค');
    }
    $('bookMeta').textContent = rows ? meta.filter(Boolean).join(' · ') : 'ยังไม่มีข้อมูล';

    var stamp = $('stamp');
    if (!result) {
      stamp.hidden = true;
      $('sum3').textContent = '';
      pill('cntOk', 'idle', 'info', 'ยังไม่มีข้อมูล');
      pill('cntWarn', 'warn', 'triangle-alert', '');
      pill('cntBad', 'bad', 'circle-x', '');
      setStepState(1, false);
      setStepState(2, false);
      setStepState(3, false);
      return;
    }
    var ready = result.students.length;
    var all = ready + result.incomplete.length;
    var badCodes = [];
    result.errors.forEach(function (e) { (e.codes || [null]).forEach(function (c) { if (badCodes.indexOf(c) < 0) { badCodes.push(c); } }); });
    var hasErr = result.errors.length > 0;
    clear(stamp);
    stamp.hidden = false;
    stamp.className = 'stamp' + (hasErr ? ' bad' : result.incomplete.length ? ' warn' : '');
    stamp.appendChild(document.createTextNode(hasErr ? 'ยังกรอกไม่ได้' : 'พร้อมกรอก ' + ready + ' จาก ' + all + ' คน'));
    var sub = hasErr ? 'มีข้อผิดพลาด ' + badCodes.length + ' รายการ ต้องแก้ก่อนคัดลอก'
      : result.incomplete.length ? result.incomplete.length + ' คนจะถูกข้าม (ว่างหรือเครื่องหมาย)' : 'ไม่พบปัญหา';
    stamp.appendChild(mk('small', sub));

    pill('cntOk', hasErr ? 'idle' : 'ok', hasErr ? 'info' : 'circle-check', 'พร้อม ' + ready + ' คน');
    pill('cntWarn', 'warn', 'triangle-alert',
      result.incomplete.length ? 'ว่าง/เครื่องหมาย ' + result.incomplete.length + ' คน (ข้าม)' : '');
    pill('cntBad', 'bad', 'circle-x', hasErr ? 'ผิด ' + badCodes.length + ' รายการ' : '');

    $('sum3').textContent = hasErr ? 'ยังมีข้อผิดพลาด' : 'จับคู่แล้ว ' + result.fieldIds.length + ' ช่อง';
    var loaded = rows > 0 && !$('loadMessage').textContent;
    setStepState(1, loaded);
    setStepState(2, loaded);
    setStepState(3, !hasErr);
  }

  function recompute() {
    var box = $('report');
    clear(box);
    state.payloadText = '';
    state.result = null;
    $('copy').disabled = true;
    if (!state.table.length) {
      box.appendChild(line('warn', 'ยังไม่มีข้อมูล — วางจาก Excel หรือเลือกไฟล์'));
      renderPreview({ codeCol: -1, fieldCols: {}, maxByField: {} });
      paintSummary(null);
      return;
    }
    var cfg = config();
    renderPreview(cfg);
    /* แสดงหน้าตาของคอลัมน์ที่จับคู่ไว้ข้างช่องเลือก — ครูเห็นทันทีถ้าเลือกคอลัมน์ผิด (เช่นคะแนนย่อย) */
    SF.TARGETS[state.target].fields.forEach(function (f) {
      var sbox = $('stats_' + f.id);
      if (!sbox) { return; }
      var col = cfg.fieldCols[f.id];
      if (col === undefined) { sbox.textContent = ''; return; }
      var s = SF.columnStats(state.table.slice(headerRow() + 1), col);
      sbox.textContent = 'ตัวอย่าง ' + (s.sample.join(', ') || '(ว่าง)') +
        (s.numbers ? ' · ต่ำสุด–สูงสุด ' + s.min + '–' + s.max : '');
    });
    var result = SF.validate(state.table.slice(headerRow() + 1), cfg);
    state.result = result;
    result.errors.forEach(function (e) {
      box.appendChild(line('bad', e.message, e.codes ? shortList(e.codes) : ''));
    });
    result.warnings.forEach(function (w) { box.appendChild(line('warn', w)); });
    if (result.incomplete.length) {
      box.appendChild(line('warn', 'ข้ามนักเรียน ' + result.incomplete.length + ' คน (ข้อมูลไม่ครบ ไม่ใส่ 0 ให้)',
        result.incomplete.slice(0, 5).map(function (i) { return i.code + ' — ' + i.problems.join('; '); }).join(' | ')));
    }
    if (!result.errors.length) {
      box.appendChild(line('ok', 'พร้อมคัดลอก ' + result.students.length + ' คน · ช่อง ' + result.fieldIds.join(', ')));
      try {
        var fill45 = $('fill45') ? $('fill45').checked : false;
        var payload = SF.buildPayload(state.target, result, {
          subject: $('subject').value.trim(), section: $('section').value.trim(),
          strict: isStrict(), version: VERSION, maxByField: cfg.maxByField,
          presets: { fill45: fill45 }
        });
        state.payloadText = JSON.stringify(payload);
        $('copy').disabled = false;
      } catch (e) {
        box.appendChild(line('bad', e.message));
      }
    }
    paintSummary(result);
  }

  /* ขั้นตอนเป็น 3 แท็บ — เลือกได้ด้วยเมาส์และลูกศร ซ้าย/ขวา (Home/End ข้ามไปหัว/ท้าย) */
  var TAB_COUNT = 3;
  function selectTab(n, focus) {
    for (var i = 1; i <= TAB_COUNT; i++) {
      var tab = $('tab' + i);
      var on = i === n;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      $('p' + i).hidden = !on;
      if (on && focus) { tab.focus(); }
    }
  }
  function currentTab() {
    for (var i = 1; i <= TAB_COUNT; i++) { if ($('tab' + i).getAttribute('aria-selected') === 'true') { return i; } }
    return 1;
  }
  Array.prototype.forEach.call(document.querySelectorAll('[role=tab]'), function (btn, idx) {
    btn.addEventListener('click', function () { selectTab(idx + 1, false); });
    btn.addEventListener('keydown', function (ev) {
      var n = idx + 1;
      if (ev.key === 'ArrowRight') { n = n % TAB_COUNT + 1; }
      else if (ev.key === 'ArrowLeft') { n = (n + TAB_COUNT - 2) % TAB_COUNT + 1; }
      else if (ev.key === 'Home') { n = 1; }
      else if (ev.key === 'End') { n = TAB_COUNT; }
      else { return; }
      ev.preventDefault();
      selectTab(n, true);
    });
  });

  /* โหลดข้อมูลสำเร็จแล้วพาไปแท็บเลือกหน้า SGS ยกเว้นยังต้องใช้ตัวควบคุมในแท็บใส่ข้อมูล (เลือกชีต / จับคู่เอง) */
  function goToWorkTab() {
    if (!dataRowCount() || $('loadMessage').textContent) { return; }
    var needsData = (state.sheets && state.sheets.length > 1 && !state.pp5) || state.manual;
    selectTab(needsData ? 1 : 2, false);
  }

  var PHASE_FIELDS = { pre: ['S1', 'Midterm'], post: ['S10', 'Final'] };

  function applyPhase(phase) {
    var keep = PHASE_FIELDS[phase];
    SF.TARGETS.score.fields.forEach(function (f) {
      var sel = $('map_' + f.id);
      if (sel && keep.indexOf(f.id) < 0) { sel.value = '-1'; }
    });
    Array.prototype.forEach.call(document.getElementsByName('phase'), function (r) { r.checked = (r.value === phase); });
  }

  /* ไฟล์ ปพ.5 ของโรงเรียน: ดึงตารางที่แยกแล้วและจับคู่ให้เอง (ครูไม่ต้องเลือกคอลัมน์) */
  function applyPp5() {
    var ex = SF.pp5Extract(state.pp5, state.sheets, state.target);
    var banner = $('pp5Banner');
    function setBanner(kind, text) {
      clear(banner);
      banner.hidden = false;
      banner.className = 'banner' + (kind === 'warn' ? ' warn' : '');
      banner.appendChild(icon(kind === 'warn' ? 'triangle-alert' : 'circle-check'));
      banner.appendChild(mk('span', text));
    }
    if (!ex.ok) {
      setBanner('warn', 'พบไฟล์ ปพ.5 แต่อ่านหน้านี้ไม่ได้: ' + ex.message + ' — ลองติ๊ก "จับคู่คอลัมน์เอง"');
      say('loadMessage', ex.message);
      state.manual = true;
      $('manualMap').checked = true;
      showRaw(0);
      return;
    }
    say('loadMessage', '');
    setBanner('ok', 'พบไฟล์ ปพ.5' + (state.pp5.subject ? ' · วิชา ' + state.pp5.subject : '') +
      (state.pp5.room ? ' · ห้อง ' + state.pp5.room : '') + ' · อ่านหน้า "' + SF.TARGETS[state.target].label +
      '" ให้อัตโนมัติ ' + (ex.table.length - 1) + ' คน — ตรวจตารางด้านล่างแล้วกดคัดลอกได้เลย');
    state.table = ex.table;
    state.guess = ex.guess;
    $('headerRow').value = 1;
    if (!$('subject').value && state.pp5.subject) { $('subject').value = state.pp5.subject; }
    if (!$('section').value && state.pp5.section) { $('section').value = state.pp5.section; }
    renderMapping(false);
    var isScore = state.target === 'score';
    $('phaseBox').hidden = !isScore;
    if (isScore) {
      SF.TARGETS.score.fields.forEach(function (f) {
        var m = $('max_' + f.id);
        if (m && ex.maxByField[f.id] !== undefined) { m.value = String(ex.maxByField[f.id]); }
      });
      applyPhase(state.phase || (ex.hasData.Final ? 'post' : 'pre'));
    }
    /* โหมด ปพ.5: ซ่อนแถวของช่องที่ไม่ได้ใช้ (เช่นข้อ 9-10 หรือช่วงที่ SGS ไม่ได้เปิด) ให้ขั้นนี้ไม่รก */
    SF.TARGETS[state.target].fields.forEach(function (f) {
      var sel = $('map_' + f.id);
      if (sel) { sel.parentNode.hidden = sel.value === '-1'; }
    });
    recompute();
  }

  function showRaw(i) {
    $('phaseBox').hidden = true;
    state.sheetIndex = i;
    fillSheetSelect();
    loadTable(state.sheets[i].rows);
  }

  function loadTable(rows) {
    state.table = rows;
    $('headerRow').value = 1;
    renderMapping(true);
    recompute();
    goToWorkTab();
  }

  function fillSheetSelect() {
    var box = $('sheet');
    clear(box);
    state.sheets.forEach(function (s, i) {
      var label = mk('label');
      var r = mk('input');
      r.type = 'radio';
      r.name = 'sheetpick';
      r.value = String(i);
      r.checked = i === state.sheetIndex;
      r.addEventListener('change', function () {
        if (!r.checked) { return; }
        state.sheetIndex = i;
        loadTable(state.sheets[i].rows);
      });
      label.appendChild(r);
      label.appendChild(mk('span', s.name));
      box.appendChild(label);
    });
    box.hidden = state.sheets.length < 2;
  }

  $('paste').addEventListener('input', function () {
    if (!$('paste').value.trim()) { return; }
    state.sheets = null;
    state.pp5 = null;
    $('manualRow').hidden = true;
    $('pp5Banner').hidden = true;
    $('phaseBox').hidden = true;
    $('sheet').hidden = true;
    say('loadMessage', '');
    loadTable(SF.parseDelimited($('paste').value));
  });

  async function handleFile(f) {
    if (!f) { return; }
    say('fileName', f.name);
    try {
      say('loadMessage', '');
      if (/\.xlsx$/i.test(f.name)) {
        var r = await SF.readXlsx(await f.arrayBuffer());
        state.sheets = r.sheets;
        state.sheetIndex = 0;
        state.pp5 = SF.detectPp5(state.sheets);
        state.phase = null;
        state.manual = false;
        $('manualMap').checked = false;
        $('manualRow').hidden = !state.pp5;
        $('pp5Banner').hidden = true;
        if (state.pp5) {
          $('sheet').hidden = true;
          applyPp5();
          goToWorkTab();
        } else {
          fillSheetSelect();
          loadTable(state.sheets[0].rows);
        }
      } else if (/\.xls$/i.test(f.name)) {
        say('loadMessage', 'ไม่รองรับไฟล์ .xls เก่า — บันทึกเป็น .xlsx หรือคัดลอกตารางมาวาง');
      } else {
        state.sheets = null;
        state.pp5 = null;
        $('manualRow').hidden = true;
        $('pp5Banner').hidden = true;
        $('phaseBox').hidden = true;
        $('sheet').hidden = true;
        loadTable(SF.parseDelimited(await f.text()));
      }
    } catch (e) {
      say('loadMessage', e.message);
    }
  }

  $('file').addEventListener('change', function () { handleFile($('file').files[0]); });
  ['dragenter', 'dragover'].forEach(function (name) {
    $('drop').addEventListener(name, function (ev) { ev.preventDefault(); $('drop').classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (name) {
    $('drop').addEventListener(name, function (ev) { ev.preventDefault(); $('drop').classList.remove('over'); });
  });
  $('drop').addEventListener('drop', function (ev) {
    var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) { handleFile(f); }
  });

  $('manualMap').addEventListener('change', function () {
    state.manual = $('manualMap').checked;
    if (state.manual) { $('pp5Banner').hidden = true; showRaw(0); } else { $('sheet').hidden = true; applyPp5(); }
  });
  Array.prototype.forEach.call(document.getElementsByName('phase'), function (r) {
    r.addEventListener('change', function () {
      if (!r.checked || !state.pp5 || state.manual) { return; }
      state.phase = r.value;
      applyPp5();
    });
  });

  $('headerRow').addEventListener('input', function () { renderMapping(true); recompute(); });
  ['codeCol', 'pad', 'subject', 'section'].forEach(function (id) {
    $(id).addEventListener('input', recompute);
    $(id).addEventListener('change', recompute);
  });
  Array.prototype.forEach.call(document.getElementsByName('mode'), function (r) {
    r.addEventListener('change', recompute);
  });
  Array.prototype.forEach.call(document.getElementsByName('target'), function (r) {
    r.addEventListener('click', function () { if (dataRowCount()) { selectTab(3, false); } });
    r.addEventListener('change', function () {
      if (!r.checked) { return; }
      state.target = r.value;
      if (state.pp5 && !state.manual) { applyPp5(); return; }
      $('phaseBox').hidden = true;
      renderMapping(true);
      recompute();
    });
  });
  $('bookmarklet').addEventListener('click', function (ev) { ev.preventDefault(); });

  /* วิธีใช้: ปุ่มมุมขวาบนเปิด dialog · ปิดด้วยปุ่มปิด / Esc / คลิกพื้นหลัง */
  $('helpBtn').addEventListener('click', function () { $('help').showModal(); });
  $('helpClose').addEventListener('click', function () { $('help').close(); });
  $('help').addEventListener('click', function (ev) { if (ev.target === $('help')) { $('help').close(); } });

  var toastTimer = null;
  function toast(kind, text) {
    var t = $('toast');
    clear(t);
    t.className = 'toast ' + kind;
    t.appendChild(icon(kind === 'ok' ? 'circle-check' : 'triangle-alert'));
    t.appendChild(mk('span', text));
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  async function copyText(text, okMessage) {
    try {
      await navigator.clipboard.writeText(text);
      say('status', okMessage);
      toast('ok', okMessage);
    } catch (e) {
      $('manualBox').hidden = false;
      $('manualBox').open = true;
      $('manualcopy').value = text;
      $('manualcopy').select();
      var fail = 'คัดลอกอัตโนมัติไม่ได้ — กดคัดลอกจากช่อง "คัดลอกเอง" ด้านล่างเอง (Ctrl/Cmd+C)';
      say('status', fail);
      toast('warn', fail);
    }
  }

  $('copy').addEventListener('click', function () {
    if (!state.payloadText) { return; }
    var n = state.result ? state.result.students.length : 0;
    copyText(state.payloadText, 'คัดลอกแล้ว ' + n + ' คน — ไปที่หน้า SGS แล้วกดบุ๊กมาร์ก "กรอก SGS"');
  });
  $('copyReport').addEventListener('click', function () {
    if (!state.result) { return; }
    copyText(SF.buildReport({
      version: VERSION, targetKey: state.target, result: state.result,
      mode: isStrict() ? 'strict' : 'lenient', userAgent: navigator.userAgent
    }), 'คัดลอกรายงานปัญหาแล้ว (ไม่มีข้อมูลนักเรียน)');
  });

  state.guess = { codeCol: -1, fieldCols: {} };
  renderMapping(false);
  recompute();
  SF.app = { state: state, payloadText: function () { return state.payloadText; } };
})();
