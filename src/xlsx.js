var SF = SF || {};

(function () {
  var NOT_XLSX = 'ไม่ใช่ไฟล์ .xlsx (อ่านโครงสร้างไม่ได้) — ถ้าเป็นไฟล์ .xls เก่า ให้บันทึกเป็น .xlsx หรือวางข้อมูลแทน';

  function colIndex(ref) {
    var letters = /^([A-Z]+)/.exec(ref);
    if (!letters) { return 0; }
    var n = 0;
    for (var i = 0; i < letters[1].length; i++) { n = n * 26 + (letters[1].charCodeAt(i) - 64); }
    return n - 1;
  }

  function textOf(node) {
    var parts = node.getElementsByTagName('t');
    var out = '';
    for (var i = 0; i < parts.length; i++) { out += parts[i].textContent; }
    return out;
  }

  function parseXml(text) { return new DOMParser().parseFromString(text, 'application/xml'); }

  async function openZip(buffer) {
    var u8 = new Uint8Array(buffer);
    var dv = new DataView(buffer);
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) { throw new Error(NOT_XLSX); }
    var count = dv.getUint16(eocd + 10, true);
    var p = dv.getUint32(eocd + 16, true);
    var decoder = new TextDecoder('utf-8');
    var entries = {};
    for (var n = 0; n < count; n++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) { throw new Error(NOT_XLSX); }
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var commentLen = dv.getUint16(p + 32, true);
      entries[decoder.decode(u8.subarray(p + 46, p + 46 + nameLen))] = {
        method: dv.getUint16(p + 10, true),
        size: dv.getUint32(p + 20, true),
        offset: dv.getUint32(p + 42, true)
      };
      p += 46 + nameLen + extraLen + commentLen;
    }
    return async function read(name) {
      var e = entries[name];
      if (!e) { return null; }
      var nameLen = dv.getUint16(e.offset + 26, true);
      var extraLen = dv.getUint16(e.offset + 28, true);
      var start = e.offset + 30 + nameLen + extraLen;
      var data = u8.subarray(start, start + e.size);
      if (e.method === 0) { return decoder.decode(data); }
      if (e.method !== 8) { throw new Error(NOT_XLSX); }
      var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return decoder.decode(await new Response(stream).arrayBuffer());
    };
  }

  function sharedStrings(xml) {
    if (!xml) { return []; }
    var items = parseXml(xml).getElementsByTagName('si');
    var out = [];
    for (var i = 0; i < items.length; i++) { out.push(textOf(items[i])); }
    return out;
  }

  function sheetRows(xml, shared) {
    var doc = parseXml(xml);
    var rowNodes = doc.getElementsByTagName('row');
    var rows = [];
    var width = 0;
    for (var i = 0; i < rowNodes.length; i++) {
      var r = parseInt(rowNodes[i].getAttribute('r') || String(i + 1), 10) - 1;
      var cells = rowNodes[i].getElementsByTagName('c');
      var row = rows[r] || [];
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        var type = c.getAttribute('t');
        var v = c.getElementsByTagName('v')[0];
        var value = '';
        if (type === 'inlineStr') { value = textOf(c); }
        else if (!v) { value = ''; }
        else if (type === 's') { value = shared[parseInt(v.textContent, 10)] || ''; }
        else if (type === 'b') { value = v.textContent === '1' ? 'TRUE' : 'FALSE'; }
        else if (type === 'e') { value = ''; }
        /* ผลของสูตรที่เป็นข้อความ (เช่น =ชื่อผู้เรียน!B29 ได้ "05923") ต้องคงเป็นข้อความ ไม่แปลงเป็นเลขจนเลขศูนย์นำหน้าหาย */
        else if (type === 'str') { value = v.textContent; }
        else {
          /* ตัวเลขที่เก็บในไฟล์คือค่าดิบของ Excel ซึ่งอาจมีเศษลอยตัวจากสูตร (5.3999999999999995)
             ตัดเหลือ 12 หลักนัยสำคัญ — ค่าจริงที่มีทศนิยมยาวยังคงอยู่ให้ validate เตือน */
          var num = Number(v.textContent);
          value = isFinite(num) ? String(Number(num.toPrecision(12))) : v.textContent;
        }
        var col = colIndex(c.getAttribute('r') || '');
        row[col] = value;
        width = Math.max(width, col + 1);
      }
      rows[r] = row;
    }
    var out = [];
    for (var k = 0; k < rows.length; k++) {
      var src = rows[k] || [];
      var full = [];
      for (var m = 0; m < width; m++) { full.push(src[m] === undefined ? '' : src[m]); }
      out.push(full);
    }
    while (out.length && out[out.length - 1].every(function (x) { return x === ''; })) { out.pop(); }
    return out;
  }

  SF.readXlsx = async function (buffer) {
    var read = await openZip(buffer);
    var workbook = await read('xl/workbook.xml');
    if (!workbook) { throw new Error(NOT_XLSX); }
    var rels = parseXml(await read('xl/_rels/workbook.xml.rels'));
    var targets = {};
    var relNodes = rels.getElementsByTagName('Relationship');
    for (var i = 0; i < relNodes.length; i++) {
      var t = relNodes[i].getAttribute('Target') || '';
      targets[relNodes[i].getAttribute('Id')] = t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t;
    }
    var shared = sharedStrings(await read('xl/sharedStrings.xml'));
    var sheetNodes = parseXml(workbook).getElementsByTagName('sheet');
    var sheets = [];
    for (var s = 0; s < sheetNodes.length; s++) {
      var path = targets[sheetNodes[s].getAttribute('r:id')];
      var xml = path ? await read(path) : null;
      sheets.push({ name: sheetNodes[s].getAttribute('name'), rows: xml ? sheetRows(xml, shared) : [] });
    }
    if (!sheets.length) { throw new Error(NOT_XLSX); }
    return { sheets: sheets };
  };
})();
