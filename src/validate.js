var SF = SF || {};

(function () {
  SF.normalizeCode = function (raw, pad) {
    var s = SF.normalizeDigits(String(raw === undefined || raw === null ? '' : raw)).trim();
    if (/^\d+\.0+$/.test(s)) { s = s.replace(/\.0+$/, ''); }
    if (/^\d+$/.test(s) && pad > 0 && s.length < pad) {
      s = new Array(pad - s.length + 1).join('0') + s;
    }
    return s;
  };

  function uniq(list) { return list.filter(function (x, i) { return list.indexOf(x) === i; }); }

  SF.validate = function (dataRows, cfg) {
    var target = SF.TARGETS[cfg.targetKey];
    var result = {
      fieldIds: [], students: [], incomplete: [], errors: [], warnings: [],
      counts: { rows: dataRows.length, students: 0, incomplete: 0, ignored: 0 }
    };
    var fieldIds = target.fields
      .map(function (f) { return f.id; })
      .filter(function (id) { return cfg.fieldCols[id] !== undefined && cfg.fieldCols[id] >= 0; });
    result.fieldIds = fieldIds;
    if (cfg.codeCol === undefined || cfg.codeCol < 0) {
      result.errors.push({ type: 'CFG', message: 'ยังไม่ได้เลือกคอลัมน์รหัสนักเรียน' });
    }
    if (!fieldIds.length) {
      result.errors.push({ type: 'CFG', message: 'ยังไม่ได้เลือกคอลัมน์คะแนน/ค่าสำหรับช่อง SGS ใดเลย' });
    }
    if (result.errors.length) { return result; }

    var seen = {};
    var dupes = [];
    var over = [];
    var noCode = 0;
    var badCode = 0;

    dataRows.forEach(function (row) {
      var raw = row[cfg.codeCol];
      var hasOther = fieldIds.some(function (id) { return !SF.isBlank(row[cfg.fieldCols[id]]); });
      if (SF.isBlank(raw)) {
        if (hasOther) { noCode++; }
        result.counts.ignored++;
        return;
      }
      var code = SF.normalizeCode(raw, cfg.pad || 0);
      if (!/^\d+$/.test(code)) { badCode++; result.counts.ignored++; return; }
      if (seen[code]) { dupes.push(code); return; }
      seen[code] = true;

      var values = [];
      var problems = [];
      fieldIds.forEach(function (id) {
        var cell = row[cfg.fieldCols[id]];
        if (SF.isBlank(cell)) { problems.push(id + ': ช่องว่าง'); values.push(null); return; }
        var n = SF.parseNumber(cell);
        if (n === null) { problems.push(id + ': "' + String(cell).trim() + '" ไม่ใช่ตัวเลข'); values.push(null); return; }
        var limit = target.kind === 'matrix' ? target.limit : (cfg.maxByField || {})[id];
        if (n < 0 || (typeof limit === 'number' && n > limit)) { over.push(code); }
        values.push(n);
      });
      if (problems.length) { result.incomplete.push({ code: code, problems: problems }); }
      else { result.students.push({ code: code, values: values }); }
    });

    if (noCode) { result.warnings.push('มี ' + noCode + ' แถวที่มีข้อมูลแต่ไม่มีรหัสนักเรียน (ข้ามแถวเหล่านี้)'); }
    if (badCode) { result.warnings.push('มี ' + badCode + ' แถวที่รหัสไม่ใช่ตัวเลข (ข้ามแถวเหล่านี้)'); }
    if (dupes.length) {
      result.errors.push({ type: 'DUP', codes: uniq(dupes),
        message: 'รหัสซ้ำในไฟล์ ' + uniq(dupes).length + ' รหัส — แก้ไฟล์ให้แต่ละรหัสมีแถวเดียว' });
    }
    if (over.length) {
      result.errors.push({ type: 'RANGE', codes: uniq(over),
        message: 'มีค่าติดลบหรือเกินคะแนนเต็ม/ค่าสูงสุดที่ SGS รับ ' + uniq(over).length + ' คน' });
    }
    result.counts.students = result.students.length;
    result.counts.incomplete = result.incomplete.length;
    if (!result.students.length && !result.errors.length) {
      result.errors.push({ type: 'EMPTY', message: 'ไม่มีนักเรียนที่ข้อมูลครบสักคน — ตรวจการจับคู่คอลัมน์' });
    }
    return result;
  };
})();
