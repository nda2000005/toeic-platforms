// Module Luyện tập & Thi thử + Module Chấm điểm tự động
const r = require('express').Router();
const db = require('../config/db'), { wrap, fail } = require('../utils'), { auth } = require('../middleware/auth');
r.use(auth);

// Danh sách bộ đề (lọc theo loại / Part)
r.get('/', wrap(async (req, res) => {
  const { loai, phan } = req.query, w = [], p = [];
  if (loai) { w.push('b.loai_bo_de=?'); p.push(loai); }
  if (phan) { w.push('EXISTS(SELECT 1 FROM bo_de_phan_thi x WHERE x.ma_bo_de=b.ma_bo_de AND x.ma_phan=?)'); p.push(phan); }
  const [rows] = await db.query(`SELECT b.*,(SELECT GROUP_CONCAT(ph.so_thu_tu_part ORDER BY ph.so_thu_tu_part) FROM bo_de_phan_thi x
    JOIN phan_thi ph ON ph.ma_phan=x.ma_phan WHERE x.ma_bo_de=b.ma_bo_de) parts FROM bo_de b ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY b.ma_bo_de DESC`, p);
  res.json(rows);
}));

// Bắt đầu làm bài: tạo lượt làm, trả đề (KHÔNG kèm đáp án đúng)
r.post('/:id/start', wrap(async (req, res) => {
  const [[b]] = await db.query('SELECT * FROM bo_de WHERE ma_bo_de=?', [req.params.id]);
  if (!b) fail(404, 'Không tìm thấy bộ đề');
  const [qs] = await db.query(`SELECT c.ma_cau_hoi,c.ma_nhom,c.noi_dung,p.so_thu_tu_part,k.ten_ky_nang,g.doan_van,
      COALESCE(c.duong_dan_audio,g.duong_dan_audio) audio, COALESCE(c.duong_dan_hinh,g.duong_dan_hinh) hinh
    FROM bo_de_cau_hoi bq JOIN cau_hoi c ON c.ma_cau_hoi=bq.ma_cau_hoi JOIN phan_thi p ON p.ma_phan=c.ma_phan
    JOIN ky_nang k ON k.ma_ky_nang=p.ma_ky_nang LEFT JOIN nhom_cau_hoi g ON g.ma_nhom=c.ma_nhom
    WHERE bq.ma_bo_de=? ORDER BY bq.thu_tu,c.ma_cau_hoi`, [b.ma_bo_de]);
  if (!qs.length) fail(400, 'Bộ đề chưa có câu hỏi');
  const [ans] = await db.query('SELECT ma_dap_an,ma_cau_hoi,nhan_dap_an,noi_dung FROM dap_an WHERE ma_cau_hoi IN (?) ORDER BY nhan_dap_an', [qs.map(q => q.ma_cau_hoi)]);
  qs.forEach(q => {
    q.dap_an = ans.filter(a => a.ma_cau_hoi === q.ma_cau_hoi);
    if (q.ten_ky_nang !== 'Nghe') { q.audio = null; q.hinh = null; } // Reading: bỏ audio/hình theo thiết kế module
  });
  const [x] = await db.query('INSERT INTO luot_lam_bai(ma_nguoi_dung,ma_bo_de,loai_luot) VALUES(?,?,?)', [req.user.id, b.ma_bo_de, b.loai_bo_de]);
  res.json({ ma_luot: x.insertId, ten_bo_de: b.ten_bo_de, loai: b.loai_bo_de, thoi_gian: b.thoi_gian_lam_bai_phut, questions: qs });
}));

async function myAttempt(id, user) {
  const [[a]] = await db.query('SELECT * FROM luot_lam_bai WHERE ma_luot=?', [id]);
  if (!a || (a.ma_nguoi_dung !== user.id && user.role !== 'quan_tri_vien')) fail(404, 'Không tìm thấy lượt làm bài');
  return a;
}

// Lịch sử làm bài (FR-13)
r.get('/attempts/list', wrap(async (req, res) => {
  const [rows] = await db.query(`SELECT l.*,b.ten_bo_de FROM luot_lam_bai l JOIN bo_de b ON b.ma_bo_de=l.ma_bo_de
    WHERE l.ma_nguoi_dung=? AND l.trang_thai='hoan_thanh' ORDER BY l.ma_luot DESC`, [req.user.id]);
  res.json(rows);
}));

// Luyện tập: hiện đáp án ngay sau khi chọn
r.post('/attempts/:id/answer', wrap(async (req, res) => {
  const a = await myAttempt(req.params.id, req.user);
  if (a.trang_thai !== 'dang_lam') fail(400, 'Lượt làm bài đã kết thúc');
  if (a.loai_luot !== 'luyen_tap') fail(403, 'Chế độ thi thử không hiện đáp án trước khi nộp bài');
  const { ma_cau_hoi, ma_dap_an } = req.body;
  const [[ok]] = await db.query('SELECT d.ma_dap_an,c.giai_thich FROM dap_an d JOIN cau_hoi c ON c.ma_cau_hoi=d.ma_cau_hoi JOIN bo_de_cau_hoi bq ON bq.ma_cau_hoi=c.ma_cau_hoi AND bq.ma_bo_de=? WHERE d.ma_cau_hoi=? AND d.la_dap_an_dung', [a.ma_bo_de, ma_cau_hoi]);
  if (!ok) fail(400, 'Câu hỏi không thuộc bộ đề');
  const dung = ok.ma_dap_an === +ma_dap_an;
  await db.query('DELETE FROM cau_tra_loi WHERE ma_luot=? AND ma_cau_hoi=?', [a.ma_luot, ma_cau_hoi]);
  await db.query('INSERT INTO cau_tra_loi(ma_luot,ma_cau_hoi,ma_dap_an_chon,dung_sai) VALUES(?,?,?,?)', [a.ma_luot, ma_cau_hoi, ma_dap_an, dung]);
  res.json({ dung, ma_dap_an_dung: ok.ma_dap_an, giai_thich: ok.giai_thich });
}));

// Nộp bài -> chấm điểm tự động, quy đổi thang TOEIC, cập nhật tiến độ
r.post('/attempts/:id/submit', wrap(async (req, res) => {
  const a = await myAttempt(req.params.id, req.user);
  if (a.trang_thai !== 'dang_lam') fail(400, 'Bài đã được nộp');
  const [qs] = await db.query(`SELECT bq.ma_cau_hoi,c.ma_phan,k.ten_ky_nang FROM bo_de_cau_hoi bq JOIN cau_hoi c ON c.ma_cau_hoi=bq.ma_cau_hoi
    JOIN phan_thi p ON p.ma_phan=c.ma_phan JOIN ky_nang k ON k.ma_ky_nang=p.ma_ky_nang WHERE bq.ma_bo_de=?`, [a.ma_bo_de]);
  const [right] = await db.query('SELECT ma_cau_hoi,ma_dap_an FROM dap_an WHERE la_dap_an_dung AND ma_cau_hoi IN (?)', [qs.map(q => q.ma_cau_hoi)]);
  const correct = Object.fromEntries(right.map(x => [x.ma_cau_hoi, x.ma_dap_an]));
  const [saved] = await db.query('SELECT ma_cau_hoi,ma_dap_an_chon,thoi_gian_lam_giay FROM cau_tra_loi WHERE ma_luot=?', [a.ma_luot]);
  const chosen = Object.fromEntries(saved.map(s => [s.ma_cau_hoi, { d: s.ma_dap_an_chon, t: s.thoi_gian_lam_giay }]));
  for (const x of req.body.answers || []) if (x.ma_dap_an) chosen[x.ma_cau_hoi] = { d: +x.ma_dap_an, t: x.giay || null };

  const sk = { nghe: { n: 0, c: 0 }, doc: { n: 0, c: 0 } }, byPart = {}, rows = [];
  for (const q of qs) {
    const c = chosen[q.ma_cau_hoi], dung = !!c && c.d === correct[q.ma_cau_hoi];
    const k = q.ten_ky_nang === 'Nghe' ? 'nghe' : 'doc'; sk[k].n++; if (dung) sk[k].c++;
    (byPart[q.ma_phan] ??= { n: 0, c: 0 }).n++; if (dung) byPart[q.ma_phan].c++;
    rows.push([a.ma_luot, q.ma_cau_hoi, c ? c.d : null, dung, c ? c.t : null]);
  }
  const conv = s => (s.n ? Math.round(s.c / s.n * 495) : 0); // quy đổi tuyến tính về thang 0-495 mỗi kỹ năng
  const dn = conv(sk.nghe), dd = conv(sk.doc);
  await db.tx(async c => {
    await c.query('DELETE FROM cau_tra_loi WHERE ma_luot=?', [a.ma_luot]);
    await c.query('INSERT INTO cau_tra_loi(ma_luot,ma_cau_hoi,ma_dap_an_chon,dung_sai,thoi_gian_lam_giay) VALUES ?', [rows]);
    await c.query("UPDATE luot_lam_bai SET diem_nghe=?,diem_doc=?,tong_diem=?,thoi_gian_ket_thuc=NOW(),trang_thai='hoan_thanh' WHERE ma_luot=?", [dn, dd, dn + dd, a.ma_luot]);
    for (const [ph, v] of Object.entries(byPart)) {   // cập nhật tiến độ theo Part (nền cho lộ trình rule-based)
      const pct = v.c / v.n * 100;
      const [[t]] = await c.query('SELECT ma_tien_do,ty_le_dung,tong_so_lan_lam FROM tien_do_hoc_tap WHERE ma_nguoi_dung=? AND ma_phan=? AND ma_danh_muc IS NULL', [req.user.id, ph]);
      if (t) await c.query('UPDATE tien_do_hoc_tap SET ty_le_dung=?,tong_so_lan_lam=tong_so_lan_lam+1,lan_cuoi_luyen_tap=NOW() WHERE ma_tien_do=?', [(t.ty_le_dung * t.tong_so_lan_lam + pct) / (t.tong_so_lan_lam + 1), t.ma_tien_do]);
      else await c.query('INSERT INTO tien_do_hoc_tap(ma_nguoi_dung,ma_phan,ty_le_dung,tong_so_lan_lam,lan_cuoi_luyen_tap) VALUES(?,?,?,1,NOW())', [req.user.id, ph, pct]);
    }
  });
  res.json({ ma_luot: a.ma_luot, diem_nghe: dn, diem_doc: dd, tong_diem: dn + dd });
}));

// Xem kết quả chi tiết một lượt làm
r.get('/attempts/:id', wrap(async (req, res) => {
  const a = await myAttempt(req.params.id, req.user);
  const [[b]] = await db.query('SELECT ten_bo_de FROM bo_de WHERE ma_bo_de=?', [a.ma_bo_de]);
  const [items] = await db.query(`SELECT c.ma_cau_hoi,c.noi_dung,c.giai_thich,p.so_thu_tu_part,t.ma_dap_an_chon,t.dung_sai
    FROM cau_tra_loi t JOIN cau_hoi c ON c.ma_cau_hoi=t.ma_cau_hoi JOIN phan_thi p ON p.ma_phan=c.ma_phan
    LEFT JOIN bo_de_cau_hoi bq ON bq.ma_bo_de=? AND bq.ma_cau_hoi=c.ma_cau_hoi WHERE t.ma_luot=? ORDER BY bq.thu_tu,c.ma_cau_hoi`, [a.ma_bo_de, a.ma_luot]);
  if (items.length) {
    const [ans] = await db.query('SELECT ma_dap_an,ma_cau_hoi,nhan_dap_an,noi_dung,la_dap_an_dung FROM dap_an WHERE ma_cau_hoi IN (?) ORDER BY nhan_dap_an', [items.map(i => i.ma_cau_hoi)]);
    items.forEach(i => i.dap_an = ans.filter(x => x.ma_cau_hoi === i.ma_cau_hoi));
  }
  res.json({ ...a, ten_bo_de: b?.ten_bo_de, items });
}));
module.exports = r;
