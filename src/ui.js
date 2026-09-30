var SF = SF || {};

(function () {
  var VERSION = '__VERSION__';
  var $ = function (id) { return document.getElementById(id); };
  var state = { table: [], sheets: null, target: 'score', payloadText: '', guess: null, result: null };

  function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }
  function mk(tag, text, cls) {
    var e = document.createElement(tag);
    if (text !== undefined) { e.textContent = text; }
    if (cls) { e.className = cls; }
    return e;
  }
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

  function renderPreview() {
    var t = $('preview');
    clear(t);
    state.table.slice(0, 9).forEach(function (row, r) {
      var tr = mk('tr');
      if (r === headerRow()) { tr.className = 'hdr'; }
      row.forEach(function (c) { tr.appendChild(mk('td', c)); });
      t.appendChild(tr);
    });
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
    /* เติมช่อง 4-5 ให้อัตโนมัติ → คอลัมน์ 4-5 ในไฟล์ถูกเมิน จะมีค่าแปลก ๆ หรือว่างก็ไม่กระทบการตรวจ */
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
    d.appendChild(document.createTextNode((kind === 'ok' ? '✓ ' : kind === 'bad' ? '✗ ' : '⚠ ') + text));
    if (small) { d.appendChild(mk('small', small)); }
    return d;
  }

  function shortList(codes) {
    return codes.slice(0, 8).join(', ') + (codes.length > 8 ? ' และอีก ' + (codes.length - 8) + ' รหัส' : '');
  }

  function recompute() {
    var box = $('report');
    clear(box);
    state.payloadText = '';
    $('copy').disabled = true;
    if (!state.table.length) { box.appendChild(line('warn', 'ยังไม่มีข้อมูล — วางจาก Excel หรือเลือกไฟล์')); return; }
    var cfg = config();
    /* แสดงหน้าตาของคอลัมน์ที่จับคู่ไว้ข้างช่องเลือก — ครูเห็นทันทีถ้าเลือกคอลัมน์ผิด (เช่นคะแนนย่อย) */
    SF.TARGETS[state.target].fields.forEach(function (f) {
      var box = $('stats_' + f.id);
      if (!box) { return; }
      var col = cfg.fieldCols[f.id];
      if (col === undefined) { box.textContent = ''; return; }
      var s = SF.columnStats(state.table.slice(headerRow() + 1), col);
      box.textContent = 'ตัวอย่าง ' + (s.sample.join(', ') || '(ว่าง)') +
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
          strict: $('strict').checked, version: VERSION, maxByField: cfg.maxByField,
          presets: { fill45: fill45 }
        });
        state.payloadText = JSON.stringify(payload);
        $('copy').disabled = false;
      } catch (e) {
        box.appendChild(line('bad', e.message));
      }
    }
  }

  function loadTable(rows) {
    state.table = rows;
    $('headerRow').value = 1;
    renderPreview();
    renderMapping(true);
    recompute();
  }

  function fillSheetSelect() {
    var sel = $('sheet');
    clear(sel);
    state.sheets.forEach(function (s, i) {
      var o = mk('option', s.name);
      o.value = String(i);
      sel.appendChild(o);
    });
    sel.hidden = state.sheets.length < 2;
  }

  $('paste').addEventListener('input', function () {
    if (!$('paste').value.trim()) { return; }
    state.sheets = null;
    $('sheet').hidden = true;
    say('loadMessage', '');
    loadTable(SF.parseDelimited($('paste').value));
  });

  $('file').addEventListener('change', async function () {
    var f = $('file').files[0];
    if (!f) { return; }
    try {
      say('loadMessage', '');
      if (/\.xlsx$/i.test(f.name)) {
        var r = await SF.readXlsx(await f.arrayBuffer());
        state.sheets = r.sheets;
        fillSheetSelect();
        loadTable(state.sheets[0].rows);
      } else if (/\.xls$/i.test(f.name)) {
        say('loadMessage', 'ไม่รองรับไฟล์ .xls เก่า — บันทึกเป็น .xlsx หรือคัดลอกตารางมาวาง');
      } else {
        state.sheets = null;
        $('sheet').hidden = true;
        loadTable(SF.parseDelimited(await f.text()));
      }
    } catch (e) {
      say('loadMessage', e.message);
    }
  });

  $('sheet').addEventListener('change', function () {
    loadTable(state.sheets[parseInt($('sheet').value, 10)].rows);
  });
  $('headerRow').addEventListener('input', function () { renderPreview(); renderMapping(true); recompute(); });
  ['codeCol', 'pad', 'subject', 'section', 'strict'].forEach(function (id) {
    $(id).addEventListener('input', recompute);
    $(id).addEventListener('change', recompute);
  });
  Array.prototype.forEach.call(document.getElementsByName('target'), function (r) {
    r.addEventListener('change', function () {
      if (!r.checked) { return; }
      state.target = r.value;
      renderMapping(true);
      recompute();
    });
  });
  $('bookmarklet').addEventListener('click', function (ev) { ev.preventDefault(); });

  async function copyText(text, okMessage) {
    try {
      await navigator.clipboard.writeText(text);
      say('status', okMessage);
    } catch (e) {
      $('manualBox').hidden = false;
      $('manualBox').open = true;
      $('manualcopy').value = text;
      $('manualcopy').select();
      say('status', 'คัดลอกอัตโนมัติไม่ได้ — กดคัดลอกจากช่องด้านล่างเอง (Ctrl/⌘+C)');
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
      mode: $('strict').checked ? 'strict' : 'lenient', userAgent: navigator.userAgent
    }), 'คัดลอกรายงานปัญหาแล้ว (ไม่มีข้อมูลนักเรียน)');
  });

  state.guess = { codeCol: -1, fieldCols: {} };
  renderMapping(false);
  recompute();
  SF.app = { state: state, payloadText: function () { return state.payloadText; } };
})();
