/* กรอกคะแนนเข้าหน้า SGS "บันทึกผลการเรียน" โดยจับคู่ด้วยรหัสนักเรียน
 *
 * ใช้เป็นบุ๊กมาร์กเล็ต (ดูหน้า /sgs ของ vk web) ทำงานเฉพาะตอนกดเท่านั้น
 * อ่านข้อมูลจาก clipboard (สร้างโดยปุ่ม "คัดลอกข้อมูลสำหรับ SGS" ในหน้าคะแนน)
 *
 * กติกา: ตรวจก่อนกรอกทุกครั้ง — ไม่ผ่านข้อไหนปุ่มกรอกกดไม่ได้ · ไม่กดบันทึกให้ · ไม่ส่งข้อมูลออกไปไหน
 * (ไฟล์นี้ห้ามมีการเรียกเครือข่าย และห้ามมีเครื่องหมายทับสองตัวติดกัน เพราะบุ๊กมาร์กเล็ต
 * บางเบราว์เซอร์ตัดบรรทัดใหม่ทิ้ง ทำให้ความเห็นแบบบรรทัดเดียวกลืนโค้ดที่เหลือ)
 */
(function () {
  'use strict';

  var PANEL_ID = 'sgs-fill-panel';
  var SCRIPT_VERSION = '__SCRIPT_VERSION__';

  /* เทียบเวอร์ชันแบบ x.y.z — คืน true ถ้า a ต่ำกว่า b */
  function versionLess(a, b) {
    var x = String(a).split('.');
    var y = String(b).split('.');
    for (var i = 0; i < 3; i++) {
      var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
      if (d !== 0) { return d < 0; }
    }
    return false;
  }
  var ALL_FIELDS = ['S1', 'S2', 'S3', 'Midterm', 'S10', 'S11', 'S12', 'Final'];
  var previous = document.getElementById(PANEL_ID);
  if (previous) { previous.parentNode.removeChild(previous); }

  function inputOf(row, id) { return row.querySelector('input[id$="_' + id + '"]'); }

  /* แถวของนักเรียนจริง ๆ — SGS ห่อช่องกรอกแต่ละช่องไว้ในตารางย่อย closest('tr') จึงได้แถวของ
     ตารางย่อย (มีช่องเดียว) ต้องไต่ขึ้นไปจนเจอแถวที่มีทุกช่องที่จะกรอก และมีช่องแรกแค่ช่องเดียว
     เงื่อนไขหลังกันไม่ให้ไต่เลยไปถึงกรอบของทั้งหน้า ซึ่งมีช่องของนักเรียนทุกคน */
  function studentRow(seed, ids) {
    var tr = seed.closest('tr');
    while (tr) {
      var complete = ids.every(function (id) { return inputOf(tr, id); });
      if (complete && tr.querySelectorAll('input[id$="_' + ids[0] + '"]').length === 1) { return tr; }
      var up = tr.parentElement;
      tr = up ? up.closest('tr') : null;
    }
    return null;
  }

  function fieldMax(input) {
    var m = /CheckValue\([^,]+,\s*'[^']*'\s*,\s*'(\d+(?:\.\d+)?)'/.exec(input.getAttribute('onchange') || '');
    if (m) { return parseFloat(m[1]); }
    var table = input.closest('table');
    var cell = input.closest('td');
    if (!table || !cell) { return null; }
    for (var r = 0; r < table.rows.length; r++) {
      var row = table.rows[r];
      if (row.querySelector('input[type="text"]') || !row.cells[cell.cellIndex]) { continue; }
      var t = /(\d+(?:\.\d+)?)\s*$/.exec(row.cells[cell.cellIndex].innerText.trim());
      if (t) { return parseFloat(t[1]); }
    }
    return null;
  }

  function codeColumn(table) {
    for (var r = 0; r < table.rows.length; r++) {
      var row = table.rows[r];
      if (row.querySelector('input[type="text"]')) { continue; }
      for (var c = 0; c < row.cells.length; c++) {
        var head = row.cells[c].innerText.replace(/\s+/g, '');
        if (head === 'เลขประจำตัว' || head === 'รหัสนักเรียน') { return c; }
      }
    }
    return -1;
  }

  function codeOfRow(row, col) {
    if (col >= 0 && row.cells[col]) {
      var t = row.cells[col].innerText.trim();
      if (/^\d{5}$/.test(t)) { return t; }
    }
    for (var i = 0; i < row.cells.length; i++) {
      var s = row.cells[i].innerText.trim();
      if (/^\d{5}$/.test(s)) { return s; }
    }
    return null;
  }

  function selectedText(suffix) {
    var el = document.querySelector('select[name$="' + suffix + '"]');
    if (!el || !el.selectedOptions || !el.selectedOptions[0]) { return null; }
    return el.selectedOptions[0].text.trim();
  }

  /* ค่าสูงสุดที่หน้า SGS แบบตารางช่อง Q ยอมรับ — อ่านจากสคริปต์ของหน้าเอง (parseFloat(x) > 3) */
  function pageLimit() {
    try {
      var m = /parseFloat\(\s*\w+\s*\)\s*>\s*(\d+(?:\.\d+)?)/.exec(String(window.CheckValue));
      return m ? parseFloat(m[1]) : null;
    } catch (e) {
      return null;
    }
  }

  function list(codes) {
    var head = codes.slice(0, 8).join(', ');
    return codes.length > 8 ? head + ' และอีก ' + (codes.length - 8) + ' รหัส' : head;
  }

  /* ตรวจทุกอย่างก่อนกรอก — คืนรายการผลตรวจและแถวที่จะกรอก ยังไม่แตะช่องใดเลย */
  function check(p) {
    var items = [];
    function add(ok, label, detail, blocking) {
      items.push({ ok: ok, label: label, detail: detail || '', blocking: blocking !== false });
    }
    var strict = p.strict === true;
    var matrix = p.kind === 'matrix';
    var pageName = p.page_label || 'บันทึกผลการเรียน';

    var subjectText = selectedText('ClassSubjectIDFilter');
    var sectionText = selectedText('ClassSectionNoFilter');
    if (subjectText === null || sectionText === null) {
      add(false, 'หาตัวเลือกวิชา/ห้องบนหน้านี้ไม่เจอ', 'ต้องอยู่ที่หน้า "' + pageName + '"');
    } else {
      if (p.subject) {
        add(subjectText.indexOf(p.subject) === 0, 'วิชา ' + p.subject, 'หน้านี้เลือก: ' + subjectText);
      } else {
        add(false, 'ไม่ได้ระบุรหัสวิชา — ตรวจวิชาที่เลือกอยู่เอง', 'หน้านี้เลือก: ' + subjectText, false);
      }
      if (p.section) {
        add(sectionText === String(p.section),
          (p.room ? 'ห้อง ' + p.room + ' ' : '') + '(กลุ่มที่ ' + p.section + ')',
          'หน้านี้เลือกกลุ่มที่ ' + sectionText);
      } else {
        add(false, 'ไม่ได้ระบุกลุ่ม — ตรวจกลุ่มที่เลือกอยู่เอง', 'หน้านี้เลือกกลุ่มที่ ' + sectionText, false);
      }
    }

    var seeds = document.querySelectorAll('input[id$="_' + p.fields[0].id + '"]');
    var ids = p.fields.map(function (f) { return f.id; });
    var rows = [];
    for (var i = 0; i < seeds.length; i++) {
      var tr = studentRow(seeds[i], ids);
      if (tr) { rows.push(tr); }
    }
    if (!rows.length) {
      add(false, 'ไม่พบแถวข้อมูลบนหน้านี้', 'ต้องอยู่ที่หน้า "' + pageName + '" และมีนักเรียนแสดงอยู่');
      return { items: items, canFill: false, matched: [], p: p };
    }

    var nextPage = document.querySelector('input[id$="NextPage"]');
    var moreRows = !!nextPage && !nextPage.disabled;
    add(!moreRows, moreRows ? 'SGS ยังแสดงไม่ครบทุกแถว' : 'SGS แสดงครบทุกแถว (' + rows.length + ' แถว)',
      moreRows ? 'ตั้ง "จำนวนแถวต่อหน้า" ของ SGS ให้มากกว่าจำนวนนักเรียน (เช่น 100) แล้วกด "ตรวจใหม่"' : '');

    var col = codeColumn(rows[0].closest('table'));
    var byCode = {};
    var dupes = [];
    var pageCodes = [];
    rows.forEach(function (row) {
      var code = codeOfRow(row, col);
      if (code === null) { return; }
      if (byCode[code]) { dupes.push(code); return; }
      byCode[code] = row;
      pageCodes.push(code);
    });
    add(dupes.length === 0 && pageCodes.length === rows.length, 'อ่านรหัสนักเรียนได้ครบทุกแถวไม่ซ้ำ',
      'พบ ' + pageCodes.length + ' รหัสจาก ' + rows.length + ' แถว' + (dupes.length ? ' · ซ้ำ ' + list(dupes) : ''));

    var wanted = {};
    p.students.forEach(function (s) { wanted[s.code] = s; });
    var skip = {};
    (p.skip || []).forEach(function (c) { skip[c] = true; });
    var incomplete = {};
    (p.incomplete || []).forEach(function (s) { incomplete[s.code] = s; });
    var known = function (c) { return wanted[c] || skip[c] || incomplete[c]; };
    var ours = Object.keys(wanted).concat(Object.keys(incomplete));
    var notOnPage = ours.filter(function (c) { return !byCode[c]; });
    var notInData = pageCodes.filter(function (c) { return !known(c); });

    if (strict) {
      add(notOnPage.length === 0 && notInData.length === 0, 'รหัสนักเรียนตรงกันพอดี',
        pageCodes.length + ' รหัสบน SGS · ข้อมูลของเรา ' + ours.length + ' รหัส' +
        (notOnPage.length ? ' · ขาดบน SGS: ' + list(notOnPage) : '') +
        (notInData.length ? ' · เกินบน SGS: ' + list(notInData) : ''));
    } else {
      var found = Object.keys(wanted).filter(function (c) { return byCode[c]; }).length;
      add(found > 0, 'พบรหัสตรงกัน ' + found + ' คนจาก ' + p.students.length + ' คนในข้อมูล',
        found ? '' : 'ไม่มีรหัสในข้อมูลตรงกับที่ SGS แสดงเลย — ตรวจว่าเลือกวิชา/ห้อง/ไฟล์ถูกต้อง');
      if (notOnPage.length) {
        add(false, 'รหัสในข้อมูลที่ไม่อยู่บน SGS ' + notOnPage.length + ' คน (จะไม่ถูกกรอก)',
          list(notOnPage), false);
      }
      if (notInData.length) {
        add(false, 'แถวบน SGS ที่ไม่มีข้อมูล ' + notInData.length + ' คน (จะว่างไว้)', list(notInData), false);
      }
    }

    var missingField = [];
    var maxProblems = [];
    var pageMax = {};
    var first = rows[0];
    if (matrix) {
      p.fields.forEach(function (f) { if (!inputOf(first, f.id)) { missingField.push(f.id); } });
      var lim = pageLimit();
      add(missingField.length === 0 && lim === p.limit, 'ค่าสูงสุดที่ SGS รับตรงกัน (ไม่เกิน ' + p.limit + ')',
        missingField.length ? 'ไม่พบช่อง ' + missingField.join(', ')
          : 'SGS รับไม่เกิน ' + (lim === null ? 'อ่านไม่ได้' : lim) + ' · ของเรา ' + p.limit +
            (p.blank && p.blank.length ? ' · ช่อง ' + p.blank.join(', ') + ' เว้นว่าง' : ''));
    } else {
      p.fields.forEach(function (f) {
        var inp = inputOf(first, f.id);
        if (!inp) { missingField.push(f.id); return; }
        var mx = fieldMax(inp);
        pageMax[f.id] = mx;
        if (mx === null) { maxProblems.push(f.id + ' (SGS อ่านคะแนนเต็มไม่ได้)'); }
        else if (typeof f.max === 'number' && Math.abs(mx - f.max) > 1e-9) {
          maxProblems.push(f.id + ' (SGS ' + mx + ' · ของเรา ' + f.max + ')');
        }
      });
      add(missingField.length === 0 && maxProblems.length === 0, 'คะแนนเต็มของแต่ละช่องตรงกัน',
        missingField.length ? 'ไม่พบช่อง ' + missingField.join(', ') : (maxProblems.join(' · ') ||
        p.fields.map(function (f) { return f.id + ' เต็ม ' + pageMax[f.id]; }).join(' · ')));
    }

    var matched = [];
    p.students.forEach(function (s) {
      if (byCode[s.code]) { matched.push({ code: s.code, row: byCode[s.code], values: s.values }); }
    });

    if (!matrix) {
      var over = [];
      matched.forEach(function (m) {
        p.fields.forEach(function (f, idx) {
          if (typeof f.max !== 'number' && pageMax[f.id] !== null && pageMax[f.id] !== undefined &&
              m.values[idx] > pageMax[f.id]) { over.push(m.code + ':' + f.id); }
        });
      });
      if (over.length) { add(false, 'มีค่าเกินคะแนนเต็มของช่องบน SGS', list(over)); }
    }

    var closed = 0;
    matched.forEach(function (m) {
      p.fields.forEach(function (f) {
        var inp = inputOf(m.row, f.id);
        if (inp && inp.disabled) { closed++; }
      });
    });
    add(closed === 0, 'ช่วงนี้เปิดให้กรอกอยู่ (' + p.phase_label + ')',
      closed ? closed + ' ช่องถูกปิดอยู่ — ยังไม่ถึงช่วงที่แอดมินเปิด' : '');

    if (p.note) { add(true, p.note.label, p.note.detail); }

    var inc = Object.keys(incomplete);
    if (inc.length) {
      add(false, 'ข้ามนักเรียน ' + inc.length + ' คน (' + (matrix ? 'ข้อมูลไม่ครบ' : 'คะแนนไม่ครบ') +
        ' ไม่ใส่ 0 ให้)', list(inc), false);
    }

    var canFill = items.every(function (it) { return it.ok || !it.blocking; }) && matched.length > 0;
    return { items: items, canFill: canFill, matched: matched, p: p };
  }

  function fire(input, name) {
    var ev = document.createEvent('Event');
    ev.initEvent(name, true, true);
    input.dispatchEvent(ev);
  }

  /* กรอกตามผลตรวจ แล้วอ่านกลับมาเทียบ — ไม่กดบันทึก */
  function fill(result) {
    var p = result.p;
    var bad = [];
    var cells = 0;
    result.matched.forEach(function (m) {
      p.fields.forEach(function (f, i) {
        var inp = inputOf(m.row, f.id);
        inp.value = String(m.values[i]);
        fire(inp, 'input');
        fire(inp, 'change');
        cells++;
      });
    });
    result.matched.forEach(function (m) {
      p.fields.forEach(function (f, i) {
        var got = parseFloat(inputOf(m.row, f.id).value);
        if (!(Math.abs(got - m.values[i]) < 1e-9)) { bad.push(m.code + ':' + f.id); }
      });
    });

    var pctOff = [];
    var pctSeen = 0;
    if (p.kind === 'matrix') { return { cells: cells, students: result.matched.length, bad: bad, pctSeen: 0, pctOff: [] }; }
    result.matched.forEach(function (m) {
      var sum = 0;
      var total = 0;
      ALL_FIELDS.forEach(function (id) {
        var inp = inputOf(m.row, id);
        if (!inp) { return; }
        var mx = fieldMax(inp);
        if (mx) { total += mx; }
        var v = parseFloat(inp.value);
        if (!isNaN(v)) { sum += v; }
      });
      var pct = inputOf(m.row, 'TotalPercent');
      var shown = pct ? parseFloat(pct.value) : NaN;
      if (isNaN(shown) || !total) { return; }
      pctSeen++;
      if (Math.abs(shown - (sum / total) * 100) > 0.05) { pctOff.push(m.code); }
    });
    return { cells: cells, students: result.matched.length, bad: bad, pctSeen: pctSeen, pctOff: pctOff };
  }

  /* ─────────────── แผงรายงาน (ใช้ textContent ทั้งหมด ไม่เอาข้อความจากหน้าไปเป็น HTML) ─────────────── */

  var TEAL = '#0b5c6b';
  var FONT = "Sarabun, 'Noto Sans Thai', Thonburi, 'Helvetica Neue', system-ui, sans-serif";
  var COLORS = { ok: '#0a6b2d', bad: '#b00020', warn: '#8a4b00', muted: '#5b6770' };
  /* ชื่อเนมสเปซ SVG ประกอบจากชิ้นส่วน เพราะไฟล์นี้ห้ามมีเครื่องหมายทับสองตัวติดกัน */
  var SVG_NS = ['http:', '', 'www.w3.org', '2000', 'svg'].join('/');

  var ICONS = {
    ok: ['circle:12,12,9', 'path:M8 12.5l3 3 5-6'],
    bad: ['circle:12,12,9', 'path:M9 9l6 6M15 9l-6 6'],
    warn: ['path:M12 3.5l9.5 16.5h-19z', 'path:M12 10v4.5M12 17.5v.5'],
    clip: ['rect:6,4,12,17,2', 'path:M9 4V3h6v1M9 10h6M9 14h6'],
    close: ['path:M6 6l12 12M18 6L6 18'],
    refresh: ['path:M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5'],
    paste: ['rect:5,5,14,16,2', 'path:M9 3h6v3H9zM9 12h6M9 16h4'],
    fill: ['path:M4 20h4L19 9l-4-4L4 16z', 'path:M13.5 6.5l4 4']
  };

  function icon(name, size, color) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size || 18));
    svg.setAttribute('height', String(size || 18));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', color || 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'flex:none;display:block';
    ICONS[name].forEach(function (spec) {
      var kind = spec.slice(0, spec.indexOf(':'));
      var v = spec.slice(spec.indexOf(':') + 1);
      var node;
      if (kind === 'path') {
        node = document.createElementNS(SVG_NS, 'path');
        node.setAttribute('d', v);
      } else if (kind === 'circle') {
        var c = v.split(',');
        node = document.createElementNS(SVG_NS, 'circle');
        node.setAttribute('cx', c[0]); node.setAttribute('cy', c[1]); node.setAttribute('r', c[2]);
      } else {
        var r = v.split(',');
        node = document.createElementNS(SVG_NS, 'rect');
        node.setAttribute('x', r[0]); node.setAttribute('y', r[1]);
        node.setAttribute('width', r[2]); node.setAttribute('height', r[3]); node.setAttribute('rx', r[4]);
      }
      svg.appendChild(node);
    });
    return svg;
  }

  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) { e.style.cssText = css; }
    if (text !== undefined) { e.textContent = text; }
    return e;
  }

  function row(css) { return el('div', 'display:flex;align-items:flex-start;gap:8px;' + (css || '')); }

  function button(label, iconName, kind, onclick) {
    var primary = kind === 'primary';
    var b = el('button', 'display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:7px;' +
      'font:600 14px ' + FONT + ';cursor:pointer;border:1.5px solid ' + TEAL + ';' +
      (primary ? 'background:' + TEAL + ';color:#fff' : 'background:#fff;color:' + TEAL));
    b.type = 'button';
    if (iconName) { b.appendChild(icon(iconName, 16)); }
    b.appendChild(document.createTextNode(label));
    b.onclick = onclick;
    b.setAttribute('data-kind', kind);
    return b;
  }

  function setDisabled(b, off) {
    b.disabled = off;
    b.style.opacity = off ? '.45' : '1';
    b.style.cursor = off ? 'not-allowed' : 'pointer';
  }

  /* กล่องลอย: แถบหัวลากย้ายได้ จะได้ไม่บังตารางคะแนนที่ต้องดู */
  function panel() {
    var box = el('div', 'position:fixed;top:14px;right:14px;z-index:2147483647;width:410px;max-width:94vw;' +
      'max-height:92vh;overflow:auto;background:#fff;color:#14232b;border-radius:12px;' +
      'font:14px/1.5 ' + FONT + ';box-shadow:0 10px 34px rgba(0,0,0,.35);border:1px solid ' + TEAL);
    box.id = PANEL_ID;
    document.body.appendChild(box);
    return box;
  }

  function header(box, subtitle) {
    var bar = el('div', 'display:flex;align-items:center;gap:8px;padding:10px 12px;background:' + TEAL +
      ';color:#fff;cursor:move;border-radius:11px 11px 0 0;position:sticky;top:0;user-select:none');
    bar.appendChild(icon('clip', 20, '#fff'));
    var titles = el('div', 'flex:1;min-width:0');
    titles.appendChild(el('div', 'font-weight:700;font-size:15px;line-height:1.25', 'กรอกคะแนนเข้า SGS'));
    if (subtitle) { titles.appendChild(el('div', 'font-size:12px;opacity:.9', subtitle)); }
    bar.appendChild(titles);
    var x = el('button', 'background:transparent;border:0;color:#fff;cursor:pointer;padding:2px;display:flex');
    x.type = 'button';
    x.title = 'ปิด';
    x.setAttribute('aria-label', 'ปิด');
    x.appendChild(icon('close', 20, '#fff'));
    x.onclick = function () { if (box.parentNode) { box.parentNode.removeChild(box); } };
    bar.appendChild(x);
    bar.onmousedown = function (ev) {
      if (ev.target !== bar && ev.target.parentNode !== bar && ev.target.parentNode !== titles) { return; }
      var rect = box.getBoundingClientRect();
      var dx = ev.clientX - rect.left;
      var dy = ev.clientY - rect.top;
      function move(e) {
        box.style.left = Math.max(0, e.clientX - dx) + 'px';
        box.style.top = Math.max(0, e.clientY - dy) + 'px';
        box.style.right = 'auto';
      }
      function up() {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      ev.preventDefault();
    };
    box.textContent = '';
    box.appendChild(bar);
    var body = el('div', 'padding:12px 14px 8px');
    box.appendChild(body);
    /* ท้ายกล่อง: callers เติมเนื้อหาลง body ซึ่งอยู่ก่อนบรรทัดนี้เสมอ */
    box.appendChild(el('div', 'padding:0 14px 10px;text-align:center;font-size:11px;color:#a3adb3;' +
      'letter-spacing:.02em', 'Develop by Kru staeb · v' + SCRIPT_VERSION));
    return body;
  }

  /* กรณีข้อมูลใช้ไม่ได้ (ยังไม่ได้คัดลอก / คัดลอกผิดอย่าง / อ่าน clipboard ไม่ได้) — บอกว่าต้องทำอะไรต่อ */
  function showProblem(box, message) {
    var body = header(box, 'ยังไม่มีข้อมูลให้กรอก');
    var top = row('padding:9px 10px;background:#fff6e5;border:1px solid #f0d9a8;border-radius:8px;color:' + COLORS.warn);
    top.appendChild(icon('warn', 20, COLORS.warn));
    top.appendChild(el('div', 'flex:1', message));
    body.appendChild(top);

    body.appendChild(el('div', 'margin:12px 0 4px;font-weight:700', 'ทำตามนี้'));
    var steps = el('ol', 'margin:0;padding-left:20px;color:#2c3e48');
    ['กลับไปหน้าตารางคะแนนของ vk web เลือกห้องและช่วงที่ SGS เปิดอยู่',
      'กดปุ่ม "คัดลอกข้อมูลสำหรับ SGS" (ต้องเห็นข้อความ "คัดลอกแล้ว")',
      'กลับมาที่หน้านี้แล้วกดปุ่มด้านล่าง'].forEach(function (s) {
      steps.appendChild(el('li', 'margin:2px 0', s));
    });
    body.appendChild(steps);

    var actions = row('margin-top:12px;flex-wrap:wrap;align-items:center');
    actions.appendChild(button('อ่าน clipboard ใหม่', 'refresh', 'primary', readClipboard));
    var toggle = button('วางข้อมูลเอง', 'paste', 'secondary', function () {
      area.style.display = area.style.display === 'none' ? 'block' : 'none';
    });
    actions.appendChild(toggle);
    body.appendChild(actions);

    var area = el('div', 'display:none;margin-top:10px');
    var ta = el('textarea', 'width:100%;height:84px;box-sizing:border-box;padding:8px;border:1px solid #9fb3ba;' +
      'border-radius:7px;font:13px ' + FONT);
    ta.id = 'sgs-fill-paste';
    ta.setAttribute('placeholder', 'วางข้อมูลที่คัดลอกจาก vk web ตรงนี้');
    area.appendChild(ta);
    var go = el('div', 'margin-top:6px');
    go.appendChild(button('ตรวจข้อมูล', 'ok', 'primary', function () { begin(ta.value); }));
    area.appendChild(go);
    body.appendChild(area);
  }

  function render(box, result) {
    var p = result.p;
    var body = header(box, p.subject + ' · ' + p.room + ' · ' + p.phase_label);

    result.items.forEach(function (it) {
      var kind = it.ok ? 'ok' : (it.blocking ? 'bad' : 'warn');
      var line = row('margin:7px 0');
      line.appendChild(icon(kind, 19, COLORS[kind]));
      var text = el('div', 'flex:1;min-width:0');
      text.appendChild(el('div', 'font-weight:600;color:' + COLORS[kind], it.label));
      if (it.detail) { text.appendChild(el('div', 'font-size:12px;color:' + COLORS.muted + ';word-break:break-word', it.detail)); }
      line.appendChild(text);
      body.appendChild(line);
    });

    var actions = row('margin-top:12px;align-items:center;flex-wrap:wrap');
    var go = button('กรอก ' + result.matched.length + ' คน', 'fill', 'primary', function () {
      var out = fill(result);
      setDisabled(go, true);
      var okAll = out.bad.length === 0;
      var msg = row('margin-top:12px;padding:9px 10px;border-radius:8px;background:' + (okAll ? '#e8f6ed' : '#fdeaee') +
        ';color:' + (okAll ? COLORS.ok : COLORS.bad));
      msg.appendChild(icon(okAll ? 'ok' : 'bad', 20, okAll ? COLORS.ok : COLORS.bad));
      var mt = el('div', 'flex:1;font-weight:700',
        okAll ? 'กรอกแล้ว ' + out.cells + ' ช่อง (' + out.students + ' คน) อ่านกลับตรงทุกช่อง'
          : 'อ่านกลับไม่ตรง ' + out.bad.length + ' ช่อง: ' + list(out.bad));
      mt.id = 'sgs-fill-result';
      msg.appendChild(mt);
      body.appendChild(msg);

      var pct = p.kind === 'matrix' ? el('div', 'display:none') : el('div', 'margin-top:8px;font-size:12px;color:' + COLORS.muted,
        'เทียบ % ที่ SGS แสดง (ข้อมูลอ้างอิง สูตรของ SGS ยังไม่ได้ยืนยัน): ' +
        (out.pctSeen ? (out.pctSeen - out.pctOff.length) + '/' + out.pctSeen + ' คนตรง' +
          (out.pctOff.length ? ' · ต่าง: ' + list(out.pctOff) : '') : 'SGS ยังไม่แสดง %'));
      pct.id = 'sgs-fill-pct';
      body.appendChild(pct);

      var save = row('margin-top:8px;color:' + COLORS.warn);
      save.appendChild(icon('warn', 18, COLORS.warn));
      save.appendChild(el('div', 'flex:1', 'ยังไม่ได้บันทึก — ตรวจแล้วกดปุ่มบันทึกของ SGS เอง'));
      body.appendChild(save);
      window.__sgsLast = out;
    });
    go.id = 'sgs-fill-go';
    setDisabled(go, !result.canFill);
    actions.appendChild(go);
    actions.appendChild(button('ตรวจใหม่', 'refresh', 'secondary', readClipboard));
    body.appendChild(actions);
    window.__sgsResult = result;
  }

  function begin(text) {
    var box = document.getElementById(PANEL_ID) || panel();
    var p;
    try {
      p = JSON.parse(text);
    } catch (e) {
      return showProblem(box, 'สิ่งที่อยู่ใน clipboard ไม่ใช่ข้อมูลจาก vk web');
    }
    if (p && p.min_script_version && versionLess(SCRIPT_VERSION, p.min_script_version)) {
      return showProblem(box, 'ข้อมูลนี้ต้องใช้สคริปต์เวอร์ชัน ' + p.min_script_version +
        ' ขึ้นไป (ของคุณคือ ' + SCRIPT_VERSION + ') — ลากบุ๊กมาร์กเล็ตใหม่จากหน้าเว็บ');
    }
    if (!p || p.v !== 1 || !p.students || !p.fields) {
      return showProblem(box, 'ข้อมูลไม่ตรงเวอร์ชันของสคริปต์นี้ — ติดตั้งบุ๊กมาร์กเล็ตใหม่จากหน้า /sgs');
    }
    render(box, check(p));
  }

  function readClipboard() {
    var box = document.getElementById(PANEL_ID) || panel();
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(begin, function () {
        showProblem(box, 'เบราว์เซอร์ไม่ให้อ่าน clipboard — กด "วางข้อมูลเอง" แล้ววางในช่อง');
      });
    } else {
      showProblem(box, 'เบราว์เซอร์นี้อ่าน clipboard ไม่ได้ — กด "วางข้อมูลเอง" แล้ววางในช่อง');
    }
  }

  window.__sgsCheck = function (text) { begin(text); };

  if (typeof window.__SGS_TEST_PAYLOAD__ === 'string') {
    begin(window.__SGS_TEST_PAYLOAD__);
    return;
  }
  panel();
  readClipboard();
})();
