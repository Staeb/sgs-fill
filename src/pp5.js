var SF = SF || {};

/* อ่านสมุด ปพ.5 มาตรฐานของโรงเรียนให้เข้าใจเอง ครูไม่ต้องจับคู่คอลัมน์
   หาคอลัมน์จาก "ข้อความหัวตาราง" และ "แถวคะแนนเต็ม" ไม่ใช่ตัวอักษรคอลัมน์ตายตัว
   (แม่แบบแต่ละปีเลื่อนคอลัมน์ได้ และมีตัวสะกดผิด เช่น "หลังกลงภาค") ถ้าไม่มั่นใจคืน ok:false ให้ถอยไปจับคู่เอง */
(function () {
  function n(s) { return SF.normalizeDigits(String(s === undefined || s === null ? '' : s)).replace(/\s+/g, ''); }
  function cell(rows, r, c) { return (rows[r] && rows[r][c] !== undefined) ? rows[r][c] : ''; }
  function findSheet(sheets, re) {
    for (var i = 0; i < sheets.length; i++) { if (re.test(n(sheets[i].name))) { return i; } }
    return -1;
  }

  function labelValue(rows, labelRe) {
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < rows[r].length; c++) {
        if (labelRe.test(n(rows[r][c]))) {
          for (var k = c + 1; k < rows[r].length; k++) {
            if (!SF.isBlank(rows[r][k])) { return String(rows[r][k]).trim(); }
          }
        }
      }
    }
    return '';
  }

  SF.detectPp5 = function (sheets) {
    var idx = {
      pre: findSheet(sheets, /ก่อนกลางภาค/),
      post: findSheet(sheets, /หลังกลางภาค|ปลายภาค/),
      eval: findSheet(sheets, /คุณลักษณะ/),
      basic: findSheet(sheets, /basic|คำชี/i)
    };
    if (idx.pre < 0 && idx.post < 0 && idx.eval < 0) { return null; }
    var info = { sheets: idx, subject: '', room: '', section: '' };
    if (idx.basic >= 0) {
      var rows = sheets[idx.basic].rows;
      info.subject = n(labelValue(rows, /^รหัสวิชา$/));
      var room = SF.normalizeDigits(labelValue(rows, /^ชั้น$/));
      var m = /(\d+)\s*\/\s*(\d+)/.exec(room);
      if (m) { info.room = 'ม.' + m[1] + '/' + m[2]; info.section = m[2]; }
    }
    return info;
  };

  function headerOf(rows) {
    for (var r = 0; r < Math.min(rows.length, 20); r++) {
      for (var c = 0; c < rows[r].length; c++) {
        if (/เลขประจำตัว|รหัสนักเรียน/.test(n(rows[r][c]))) { return { r: r, c: c }; }
      }
    }
    return null;
  }

  /* แถวคะแนนเต็ม: อยู่ใต้หัวตารางไม่เกิน 6 แถว มีข้อความขึ้นต้น "คะแนน" และมีตัวเลขอย่างน้อยหนึ่งช่อง */
  function fullMarkRow(rows, h) {
    for (var r = h.r + 1; r <= h.r + 6 && r < rows.length; r++) {
      var label = false;
      var nums = 0;
      for (var c = 0; c < rows[r].length; c++) {
        if (/^คะแนน/.test(n(rows[r][c]))) { label = true; }
        else if (SF.parseNumber(rows[r][c]) !== null) { nums++; }
      }
      if (label && nums >= 1) { return r; }
    }
    return -1;
  }

  function students(rows, h, fm) {
    var out = [];
    for (var r = (fm >= 0 ? fm : h.r) + 1; r < rows.length; r++) {
      var code = n(cell(rows, r, h.c));
      if (!/^\d+(\.0+)?$/.test(code)) { continue; }
      out.push({ r: r, code: code.replace(/\.0+$/, '') });
    }
    return out;
  }

  function nameCol(rows, h) {
    for (var c = h.c + 1; c < rows[h.r].length; c++) {
      if (/^ชื่อ/.test(n(rows[h.r][c]))) { return c; }
    }
    return h.c + 1;
  }

  function firstCol(rows, h, re, fromCol) {
    for (var c = fromCol; c < rows[h.r].length; c++) {
      if (re.test(n(rows[h.r][c]))) { return c; }
    }
    return -1;
  }

  function fail(message) { return { ok: false, message: message }; }

  function assemble(sheetRows, h, fm, fields, labels) {
    /* fields: [{id, col}] ในชีตเดียว */
    var names = nameCol(sheetRows, h);
    var people = students(sheetRows, h, fm);
    var table = [['เลขประจำตัว', 'ชื่อ - สกุล'].concat(fields.map(function (f) { return labels[f.id]; }))];
    people.forEach(function (p) {
      table.push([p.code, String(cell(sheetRows, p.r, names)).trim()].concat(
        fields.map(function (f) { return String(cell(sheetRows, p.r, f.col)).trim(); })));
    });
    return table;
  }

  function hasData(table, colIndex) {
    return table.slice(1).some(function (row) { return SF.parseNumber(row[colIndex]) !== null; });
  }

  function extractScore(info, sheets) {
    var parts = [];
    var need = [
      { key: 'pre', fields: [['S1', /^รวม$/], ['Midterm', /^รวมคะแนน$/]] },
      { key: 'post', fields: [['S10', /หลังกล/], ['Final', /^คะแนนปลายภาค$/]] }
    ];
    var maxByField = {};
    var tables = {};
    var order = [];
    for (var k = 0; k < need.length; k++) {
      var si = info.sheets[need[k].key];
      if (si < 0) { continue; }
      var rows = sheets[si].rows;
      var h = headerOf(rows);
      if (!h) { return fail('ชีต "' + sheets[si].name + '" หาแถวหัวตาราง (เลขประจำตัว) ไม่เจอ'); }
      var fm = fullMarkRow(rows, h);
      var found = [];
      for (var j = 0; j < need[k].fields.length; j++) {
        var col = firstCol(rows, h, need[k].fields[j][1], h.c + 1);
        if (col < 0) { return fail('ในชีต "' + sheets[si].name + '" หาคอลัมน์ ' + need[k].fields[j][0] + ' ไม่เจอ'); }
        found.push({ id: need[k].fields[j][0], col: col });
        var full = fm >= 0 ? SF.parseNumber(cell(rows, fm, col)) : null;
        if (full !== null) { maxByField[need[k].fields[j][0]] = full; }
      }
      var labels = {};
      SF.TARGETS.score.fields.forEach(function (f) { labels[f.id] = f.label; });
      var table = assemble(rows, h, fm, found, labels);
      tables[need[k].key] = { table: table, fields: found };
      found.forEach(function (f) { order.push(f.id); });
    }
    if (!order.length) { return fail('ไม่พบชีตคะแนน (ก่อนกลางภาค-กลางภาค / หลังกลางภาค-ปลายภาค)'); }

    /* รวมสองชีตเข้าด้วยกันด้วยรหัสนักเรียน */
    var byCode = {};
    var codes = [];
    var names = {};
    Object.keys(tables).forEach(function (key) {
      var t = tables[key];
      t.table.slice(1).forEach(function (row) {
        if (!byCode[row[0]]) { byCode[row[0]] = {}; codes.push(row[0]); names[row[0]] = row[1]; }
        t.fields.forEach(function (f, i) { byCode[row[0]][f.id] = row[2 + i]; });
      });
    });
    var labelsAll = {};
    SF.TARGETS.score.fields.forEach(function (f) { labelsAll[f.id] = f.label; });
    var ids = SF.TARGETS.score.fields.map(function (f) { return f.id; }).filter(function (id) { return order.indexOf(id) >= 0; });
    var out = [['เลขประจำตัว', 'ชื่อ - สกุล'].concat(ids.map(function (id) { return labelsAll[id]; }))];
    codes.forEach(function (code) {
      out.push([code, names[code]].concat(ids.map(function (id) { return (byCode[code][id] === undefined) ? '' : byCode[code][id]; })));
    });
    var guess = { codeCol: 0, fieldCols: {} };
    var data = {};
    ids.forEach(function (id, i) { guess.fieldCols[id] = 2 + i; data[id] = hasData(out, 2 + i); });
    return { ok: true, table: out, guess: guess, maxByField: maxByField, hasData: data };
  }

  function extractEval(info, sheets, targetKey) {
    var si = info.sheets.eval;
    if (si < 0) { return fail('ไม่พบชีต "คุณลักษณะ-การอ่าน" ในไฟล์นี้'); }
    var rows = sheets[si].rows;
    var h = headerOf(rows);
    if (!h) { return fail('ชีต "' + sheets[si].name + '" หาแถวหัวตาราง (เลขประจำตัว) ไม่เจอ'); }
    var fm = fullMarkRow(rows, h);
    var cols = [];
    var prefix = targetKey === 'desirable' ? 'Q' : 'L';
    if (targetKey === 'desirable') {
      if (fm < 0) { return fail('หาแถวคะแนนเต็มของคุณลักษณะไม่เจอ'); }
      for (var c = nameCol(rows, h) + 1; c < rows[fm].length; c++) {
        if (SF.parseNumber(rows[fm][c]) !== null) { cols.push(c); }
      }
      cols = cols.slice(0, 10);
    } else {
      var head = rows[h.r];
      for (var s = 0; s + 4 < head.length; s++) {
        if ([0, 1, 2, 3, 4].every(function (d) { return n(head[s + d]) === String(d + 1); })) {
          cols = [s, s + 1, s + 2, s + 3, s + 4];
          break;
        }
      }
    }
    if (!cols.length) {
      return fail(targetKey === 'desirable' ? 'หาคอลัมน์ข้อคุณลักษณะไม่เจอ' : 'หาคอลัมน์การอ่านครั้งที่ 1-5 ไม่เจอ');
    }
    var labels = {};
    var found = cols.map(function (col, i) {
      var id = prefix + (i + 1);
      labels[id] = SF.TARGETS[targetKey].fields[i].label;
      return { id: id, col: col };
    });
    var table = assemble(rows, h, fm, found, labels);
    var guess = { codeCol: 0, fieldCols: {} };
    var data = {};
    found.forEach(function (f, i) { guess.fieldCols[f.id] = 2 + i; data[f.id] = hasData(table, 2 + i); });
    return { ok: true, table: table, guess: guess, maxByField: {}, hasData: data };
  }

  SF.pp5Extract = function (info, sheets, targetKey) {
    return targetKey === 'score' ? extractScore(info, sheets) : extractEval(info, sheets, targetKey);
  };
})();
