var SF = SF || {};

(function () {
  var THAI = '๐๑๒๓๔๕๖๗๘๙';

  SF.normalizeDigits = function (s) {
    return String(s).replace(/[๐-๙]/g, function (ch) { return String(THAI.indexOf(ch)); });
  };

  SF.isBlank = function (raw) {
    return raw === null || raw === undefined || String(raw).trim() === '';
  };

  /* คืน number หรือ null (ว่าง/ไม่ใช่ตัวเลข) — จุลภาคทศนิยมรับเฉพาะรูป 12,5 (หลังจุลภาค ๑–๒ หลัก)
     ส่วน 1,250 ตีความไม่ได้ว่าพันหรือทศนิยม จึงคืน null ให้ผู้ใช้เห็นเป็นข้อผิดพลาด ไม่เดา */
  SF.parseNumber = function (raw) {
    if (SF.isBlank(raw)) { return null; }
    var s = SF.normalizeDigits(String(raw)).replace(/ /g, ' ').trim();
    if (/^-?\d+,\d{1,2}$/.test(s)) { s = s.replace(',', '.'); }
    if (!/^-?\d+(\.\d+)?$/.test(s)) { return null; }
    return parseFloat(s);
  };

  SF.roundHalfUp = function (x) { return Math.floor(x + 0.5 + 1e-9); };
})();
