var SF = SF || {};

(function () {
  function range(prefix, n, labelOf) {
    var out = [];
    for (var i = 1; i <= n; i++) { out.push({ id: prefix + i, label: labelOf(i) }); }
    return out;
  }

  SF.TARGETS = {
    score: {
      label: 'คะแนน',
      page_label: 'บันทึกผลการเรียน',
      kind: 'score',
      fields: [
        { id: 'S1', label: 'ก่อนกลางภาค (S1)' },
        { id: 'Midterm', label: 'กลางภาค (Midterm)' },
        { id: 'S10', label: 'หลังกลางภาค (S10)' },
        { id: 'Final', label: 'ปลายภาค (Final)' }
      ]
    },
    desirable: {
      label: 'คุณลักษณะอันพึงประสงค์',
      page_label: 'บันทึก คุณลักษณะอันพึงประสงค์',
      kind: 'matrix',
      limit: 3,
      fields: range('Q', 10, function (i) { return 'ข้อ ' + i + ' (Q' + i + ')'; })
    },
    reading: {
      label: 'การอ่าน คิดวิเคราะห์ และเขียน',
      page_label: 'บันทึก การอ่าน คิดวิเคราะห์ และเขียน',
      kind: 'matrix',
      limit: 3,
      fields: range('L', 5, function (i) { return 'ครั้งที่ ' + i + ' (L' + i + ')'; })
    }
  };

  /* ลำดับสำคัญ: S1 และ S10 ต้องจับก่อน Midterm เพราะ "ก่อนกลางภาค" มีคำว่า "กลางภาค" อยู่ด้วย */
  var SCORE_PATTERNS = [
    ['S1', /ก่อนกลาง|^s1$/],
    ['S10', /หลังกลาง|^s10$/],
    ['Midterm', /กลางภาค|midterm|^กลาง$/],
    ['Final', /ปลายภาค|final|^ปลาย$/]
  ];
  var CODE_PATTERN = /รหัส|เลขประจำตัว|studentid|student_id|^id$/;

  function norm(cell) {
    return SF.normalizeDigits(String(cell === undefined || cell === null ? '' : cell))
      .replace(/\s+/g, '').toLowerCase();
  }

  SF.guessColumns = function (headerRow, targetKey) {
    var heads = headerRow.map(norm);
    var used = {};
    var result = { codeCol: -1, fieldCols: {} };
    for (var i = 0; i < heads.length; i++) {
      if (CODE_PATTERN.test(heads[i])) { result.codeCol = i; used[i] = true; break; }
    }
    if (targetKey === 'score') {
      SCORE_PATTERNS.forEach(function (pair) {
        for (var c = 0; c < heads.length; c++) {
          if (!used[c] && pair[1].test(heads[c])) { result.fieldCols[pair[0]] = c; used[c] = true; break; }
        }
      });
      return result;
    }
    var prefix = targetKey === 'desirable' ? 'Q' : 'L';
    var max = SF.TARGETS[targetKey].fields.length;
    var numbered = targetKey === 'desirable'
      ? /^(?:q|ข้อ)?0*(\d{1,2})$/
      : /^(?:l|ครั้งที่|ครั้ง)?0*(\d{1,2})$/;
    for (var k = 0; k < heads.length; k++) {
      if (used[k]) { continue; }
      var m = numbered.exec(heads[k]);
      var n = m ? parseInt(m[1], 10) : 0;
      if (n >= 1 && n <= max && result.fieldCols[prefix + n] === undefined) {
        result.fieldCols[prefix + n] = k;
        used[k] = true;
      }
    }
    return result;
  };
})();
