var SF = SF || {};

(function () {
  function withoutIds(list, drop) { return list.filter(function (x) { return drop.indexOf(x) < 0; }); }

  SF.buildPayload = function (targetKey, result, meta) {
    var target = SF.TARGETS[targetKey];
    var ids = result.fieldIds.slice();
    var students = result.students.map(function (s) { return { code: s.code, values: s.values.slice() }; });
    var note;

    if (meta.presets && meta.presets.fill45 && targetKey === 'reading') {
      var first3 = ['L1', 'L2', 'L3'];
      if (!first3.every(function (id) { return ids.indexOf(id) >= 0; })) {
        throw new Error('ต้องจับคู่ครั้งที่ 1-3 ก่อนจึงเติมช่อง 4-5 ให้ได้');
      }
      var pos = first3.map(function (id) { return ids.indexOf(id); });
      var keep = withoutIds(ids, ['L4', 'L5']);
      var keepPos = keep.map(function (id) { return ids.indexOf(id); });
      students = students.map(function (s) {
        var mean = (s.values[pos[0]] + s.values[pos[1]] + s.values[pos[2]]) / 3;
        var r = SF.roundHalfUp(mean);
        return { code: s.code, values: keepPos.map(function (p) { return s.values[p]; }).concat([r, r]) };
      });
      ids = keep.concat(['L4', 'L5']);
      note = {
        label: 'ช่อง 4 และ 5 เติมให้จากผลการประเมินของช่อง 1-3',
        detail: 'SGS คำนวณผลจาก 5 ช่อง จึงเติม L4 = L5 = ค่าเฉลี่ยปัดของ L1-L3 เพื่อให้ผลเท่ากับที่ประเมินไว้'
      };
    }

    var maxBy = meta.maxByField || {};
    var payload = {
      v: 1,
      kind: target.kind,
      page_label: target.page_label,
      subject: meta.subject || '',
      section: meta.section || '',
      room: meta.room || '',
      phase: targetKey,
      phase_label: target.label,
      fields: ids.map(function (id) {
        return typeof maxBy[id] === 'number' ? { id: id, max: maxBy[id] } : { id: id };
      }),
      blank: target.kind === 'matrix'
        ? withoutIds(target.fields.map(function (f) { return f.id; }), ids)
        : [],
      strict: meta.strict === true,
      producer: 'sgs-fill',
      script_version: meta.version,
      students: students,
      skip: [],
      incomplete: result.incomplete.map(function (i) { return { code: i.code, problems: i.problems }; })
    };
    if (target.kind === 'matrix') { payload.limit = target.limit; }
    if (note) { payload.note = note; }
    return payload;
  };

  /* รายงานปัญหาสำหรับส่งให้ผู้ดูแล: นับจำนวนและชนิดข้อผิดพลาดเท่านั้น ไม่มีรหัส ชื่อ หรือคะแนน */
  SF.buildReport = function (info) {
    var r = info.result;
    var lines = [
      'ช่วยกรอก SGS — รายงานปัญหา',
      'เวอร์ชัน: ' + info.version,
      'หน้า SGS: ' + info.targetKey,
      'โหมดตรวจรหัส: ' + info.mode,
      'ช่องที่จับคู่: ' + r.fieldIds.join(', '),
      'จำนวนแถว: ' + r.counts.rows + ' · ครบ: ' + r.counts.students +
        ' · ไม่ครบ: ' + r.counts.incomplete + ' · ข้าม: ' + r.counts.ignored,
      'ข้อผิดพลาด: ' + (r.errors.map(function (e) { return e.type; }).join(', ') || 'ไม่มี'),
      'คำเตือน: ' + r.warnings.length + ' รายการ',
      'เบราว์เซอร์: ' + (info.userAgent || '')
    ];
    return lines.join('\n');
  };
})();
