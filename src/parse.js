var SF = SF || {};

(function () {
  /* แยกข้อความที่วางจาก Excel (แท็บ) หรือ CSV — รองรับเครื่องหมายอัญประกาศ
     ที่มีขึ้นบรรทัด/แท็บ/อัญประกาศซ้อน, BOM, CRLF และบรรทัดว่างท้ายข้อความ */
  SF.parseDelimited = function (text) {
    text = String(text).replace(/^﻿/, '');
    var firstLine = text.split(/\r\n|\r|\n/)[0] || '';
    var delim = firstLine.indexOf('\t') >= 0 ? '\t' : (firstLine.indexOf(',') >= 0 ? ',' : '\t');
    var rows = [];
    var row = [];
    var cell = '';
    var quoted = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quoted) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i++; } else { quoted = false; }
        } else {
          cell += ch;
        }
      } else if (ch === '"' && cell === '') {
        quoted = true;
      } else if (ch === delim) {
        row.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text.charAt(i + 1) === '\n') { i++; }
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    while (rows.length && rows[rows.length - 1].every(function (c) { return c.trim() === ''; })) {
      rows.pop();
    }
    return rows;
  };
})();
