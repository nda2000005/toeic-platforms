// Chức năng Quản trị viên: FR-08, FR-09, FR-10, FR-14, FR-15 + import bộ đề
const r = require('express').Router(), multer = require('multer'), path = require('path'), fs = require('fs');
const XLSX = require('xlsx'), mammoth = require('mammoth');
const db = require('../config/db'), ai = require('../services/aiService');
const { wrap, fail, pick } = require('../utils'), { auth, admin } = require('../middleware/auth');
r.use(auth, admin);

// ---------- CRUD tổng quát: danh mục, lý thuyết, từ vựng ----------
const crud = (p, table, pk, fields) => {
  r.get(p, wrap(async (q, s) => s.json((await db.query(`SELECT * FROM ${table} ORDER BY ${pk} DESC`))[0])));
  r.post(p, wrap(async (q, s) => {
    const d = pick(q.body, fields); if (!Object.keys(d).length) fail(400, 'Thiếu dữ liệu');
    s.status(201).json({ id: (await db.query(`INSERT INTO ${table} SET ?`, [d]))[0].insertId });
  }));
  r.put(p + '/:id', wrap(async (q, s) => { await db.query(`UPDATE ${table} SET ? WHERE ${pk}=?`, [pick(q.body, fields), q.params.id]); s.json({ message: 'ok' }); }));
  r.delete(p + '/:id', wrap(async (q, s) => { await db.query(`DELETE FROM ${table} WHERE ${pk}=?`, [q.params.id]); s.json({ message: 'ok' }); }));
};
crud('/categories', 'danh_muc', 'ma_danh_muc', ['ten_danh_muc', 'loai_danh_muc']);
crud('/theory', 'ly_thuyet_ngu_phap', 'ma_ly_thuyet', ['ma_danh_muc', 'ma_phan', 'tieu_de', 'noi_dung', 'cap_do', 'thu_tu_hien_thi']);
crud('/vocab', 'tu_vung', 'ma_tu_vung', ['ma_danh_muc', 'tu', 'nghia', 'phien_am', 'tu_loai', 'vi_du', 'cap_do', 'audio_url']);

// ---------- Upload audio / hình ----------
const UP = path.join(__dirname, '../uploads');
const up = multer({ storage: multer.diskStorage({
  destination: (q, f, cb) => { fs.mkdirSync(UP, { recursive: true }); cb(null, UP); },
  filename: (q, f, cb) => cb(null, Date.now() + '-' + f.originalname.replace(/[^\w.\-]/g, '_')) }), limits: { fileSize: 30 * 1024 * 1024 } });
r.post('/upload', up.single('file'), wrap(async (q, s) => { if (!q.file) fail(400, 'Chưa chọn file'); s.json({ path: '/uploads/' + q.file.filename }); }));

// ---------- Quản lý câu hỏi ----------
const QF = ['ma_phan', 'noi_dung', 'duong_dan_audio', 'duong_dan_hinh', 'giai_thich', 'do_kho', 'muc_dich_su_dung'];
async function getQuestion(id) {
  const [[q]] = await db.query('SELECT c.*,g.doan_van FROM cau_hoi c LEFT JOIN nhom_cau_hoi g ON g.ma_nhom=c.ma_nhom WHERE c.ma_cau_hoi=?', [id]);
  if (!q) fail(404, 'Không tìm thấy câu hỏi');
  [q.dap_an] = await db.query('SELECT nhan_dap_an,noi_dung,la_dap_an_dung FROM dap_an WHERE ma_cau_hoi=? ORDER BY nhan_dap_an', [id]);
  q.danh_muc = (await db.query('SELECT ma_danh_muc FROM cau_hoi_danh_muc WHERE ma_cau_hoi=?', [id]))[0].map(x => x.ma_danh_muc);
  return q;
}
async function resolveGroup(c, b) {
  if (b.ma_nhom) { if (b.doan_van != null) await c.query('UPDATE nhom_cau_hoi SET doan_van=? WHERE ma_nhom=?', [b.doan_van || null, b.ma_nhom]); return b.ma_nhom; }
  if (b.doan_van) return (await c.query('INSERT INTO nhom_cau_hoi(ma_phan,doan_van) VALUES(?,?)', [b.ma_phan, b.doan_van]))[0].insertId;
  return null;
}
async function saveAnswers(c, id, b) {
  const ans = (b.dap_an || []).filter(a => a.noi_dung && String(a.noi_dung).trim());
  if (ans.length < 2) fail(400, 'Cần ít nhất 2 đáp án');
  if (!ans.some(a => a.nhan === b.dap_an_dung)) fail(400, 'Chưa chọn đáp án đúng (phải là một đáp án đã nhập)');
  const [old] = await c.query('SELECT ma_dap_an,nhan_dap_an FROM dap_an WHERE ma_cau_hoi=?', [id]);
  for (const a of ans) {
    const o = old.find(x => x.nhan_dap_an === a.nhan), ok = a.nhan === b.dap_an_dung;
    if (o) await c.query('UPDATE dap_an SET noi_dung=?,la_dap_an_dung=? WHERE ma_dap_an=?', [a.noi_dung, ok, o.ma_dap_an]);
    else await c.query('INSERT INTO dap_an(ma_cau_hoi,nhan_dap_an,noi_dung,la_dap_an_dung) VALUES(?,?,?,?)', [id, a.nhan, a.noi_dung, ok]);
  }
  for (const o of old) if (!ans.some(a => a.nhan === o.nhan_dap_an)) await c.query('DELETE FROM dap_an WHERE ma_dap_an=?', [o.ma_dap_an]);
  await c.query('DELETE FROM cau_hoi_danh_muc WHERE ma_cau_hoi=?', [id]);
  for (const m of b.danh_muc || []) await c.query('INSERT IGNORE INTO cau_hoi_danh_muc VALUES(?,?)', [id, m]);
}
r.get('/questions', wrap(async (q, s) => {
  const w = [], p = [];
  if (q.query.ma_phan) { w.push('ma_phan=?'); p.push(q.query.ma_phan); }
  if (q.query.muc_dich) { w.push('muc_dich_su_dung=?'); p.push(q.query.muc_dich); }
  if (q.query.q) { w.push('noi_dung LIKE ?'); p.push('%' + q.query.q + '%'); }
  s.json((await db.query(`SELECT ma_cau_hoi,ma_phan,noi_dung,muc_dich_su_dung,do_kho,(giai_thich IS NOT NULL) co_giai_thich FROM cau_hoi ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY ma_cau_hoi DESC LIMIT 300`, p))[0]);
}));
r.get('/questions/:id', wrap(async (q, s) => s.json(await getQuestion(q.params.id))));
r.post('/questions', wrap(async (q, s) => {
  const b = q.body; if (!b.ma_phan || !b.noi_dung?.trim()) fail(400, 'Thiếu Part hoặc nội dung câu hỏi');
  const id = await db.tx(async c => {
    const d = pick(b, QF); d.ma_nhom = await resolveGroup(c, b); d.ma_nguoi_tao = q.user.id;
    const id = (await c.query('INSERT INTO cau_hoi SET ?', [d]))[0].insertId;
    await saveAnswers(c, id, b); return id;
  });
  s.status(201).json({ id });
}));
r.put('/questions/:id', wrap(async (q, s) => {
  await db.tx(async c => {
    const d = pick(q.body, QF); d.ma_nhom = await resolveGroup(c, q.body);
    await c.query('UPDATE cau_hoi SET ? WHERE ma_cau_hoi=?', [d, q.params.id]);
    await saveAnswers(c, q.params.id, q.body);
  });
  s.json({ message: 'ok' });
}));
r.delete('/questions/:id', wrap(async (q, s) => {
  await db.query('DELETE FROM cau_hoi WHERE ma_cau_hoi=?', [q.params.id]);
  await db.query('UPDATE bo_de b SET tong_so_cau=(SELECT COUNT(*) FROM bo_de_cau_hoi x WHERE x.ma_bo_de=b.ma_bo_de)');
  s.json({ message: 'ok' });
}));
// Tự động sinh giải thích bằng AI khi biên soạn câu hỏi
r.post('/questions/:id/ai-explain', wrap(async (q, s) => {
  const item = await ai.loadQuestion(q.params.id); if (!item) fail(404, 'Không tìm thấy câu hỏi');
  const out = await ai.explain(item);
  await db.query('UPDATE cau_hoi SET giai_thich=? WHERE ma_cau_hoi=?', [out.text, item.ma_cau_hoi]);
  s.json({ giai_thich: out.text });
}));

// ---------- Quản lý bộ đề ----------
async function saveExam(c, id, uid, b) {
  const loai = b.loai_bo_de || 'luyen_tap';
  if (!b.ten_bo_de?.trim()) fail(400, 'Thiếu tên bộ đề');
  let qs = (b.cau_hoi || []).map(Number).filter(Boolean);
  const parts = (b.parts || []).map(Number).filter(Boolean);
  if (!qs.length && parts.length)   // tự chọn câu hỏi theo Part (đúng mục đích luyện tập/thi thử)
    qs = (await c.query('SELECT ma_cau_hoi FROM cau_hoi WHERE ma_phan IN (?) AND muc_dich_su_dung=? ORDER BY ma_phan,ma_cau_hoi LIMIT ?', [parts, loai, +b.so_cau_tu_dong || 200]))[0].map(x => x.ma_cau_hoi);
  if (!qs.length) fail(400, 'Bộ đề cần ít nhất 1 câu hỏi (nhập mã câu hỏi hoặc chọn Part để tự lấy)');
  const [bad] = await c.query('SELECT COUNT(*) n FROM cau_hoi WHERE ma_cau_hoi IN (?) AND muc_dich_su_dung<>?', [qs, loai]);
  if (bad[0].n) fail(400, 'Có câu hỏi không đúng mục đích sử dụng - dữ liệu luyện tập và thi thử phải tách biệt');
  const info = { ten_bo_de: b.ten_bo_de.trim(), loai_bo_de: loai, thoi_gian_lam_bai_phut: +b.thoi_gian_lam_bai_phut || 120, tong_so_cau: qs.length };
  if (id) await c.query('UPDATE bo_de SET ? WHERE ma_bo_de=?', [info, id]);
  else id = (await c.query('INSERT INTO bo_de SET ?', [{ ...info, ma_nguoi_tao: uid }]))[0].insertId;
  await c.query('DELETE FROM bo_de_cau_hoi WHERE ma_bo_de=?', [id]);
  await c.query('DELETE FROM bo_de_phan_thi WHERE ma_bo_de=?', [id]);
  await c.query('INSERT INTO bo_de_cau_hoi(ma_bo_de,ma_cau_hoi,thu_tu) VALUES ?', [qs.map((x, i) => [id, x, i])]);
  await c.query('INSERT INTO bo_de_phan_thi(ma_bo_de,ma_phan) SELECT DISTINCT ?,ma_phan FROM cau_hoi WHERE ma_cau_hoi IN (?)', [id, qs]);
  return id;
}
r.get('/exams', wrap(async (q, s) => s.json((await db.query('SELECT * FROM bo_de ORDER BY ma_bo_de DESC'))[0])));
r.get('/exams/:id', wrap(async (q, s) => {
  const [[b]] = await db.query('SELECT * FROM bo_de WHERE ma_bo_de=?', [q.params.id]); if (!b) fail(404, 'Không tìm thấy bộ đề');
  b.parts = (await db.query('SELECT ma_phan FROM bo_de_phan_thi WHERE ma_bo_de=?', [b.ma_bo_de]))[0].map(x => x.ma_phan);
  b.cau_hoi = (await db.query('SELECT ma_cau_hoi FROM bo_de_cau_hoi WHERE ma_bo_de=? ORDER BY thu_tu', [b.ma_bo_de]))[0].map(x => x.ma_cau_hoi);
  s.json(b);
}));
r.post('/exams', wrap(async (q, s) => s.status(201).json({ id: await db.tx(c => saveExam(c, null, q.user.id, q.body)) })));
r.put('/exams/:id', wrap(async (q, s) => { await db.tx(c => saveExam(c, q.params.id, q.user.id, q.body)); s.json({ message: 'ok' }); }));
r.delete('/exams/:id', wrap(async (q, s) => { await db.query('DELETE FROM bo_de WHERE ma_bo_de=?', [q.params.id]); s.json({ message: 'ok' }); }));

// ---------- Import bộ đề từ file (Excel / Word / PDF) ----------
// Excel: cột part, noi_dung, A, B, C, D, dap_an, giai_thich, muc_dich, do_kho
// Word/PDF: mỗi câu bắt đầu bằng dòng "[Part 5]", tiếp theo là nội dung, các dòng "A. ..", "B. ..", "Answer: B", "Explanation: ..."
function parseText(t) {
  const out = [], ch = t.split(/\[Part\s*(\d)\]/i);
  for (let i = 1; i < ch.length; i += 2) {
    const q = { part: +ch[i], noi_dung: [], opts: {}, dap_an: null, giai_thich: '' };
    for (const l of ch[i + 1].split('\n').map(x => x.trim()).filter(Boolean)) {
      let m;
      if ((m = l.match(/^([A-D])[.)]\s*(.+)/))) q.opts[m[1]] = m[2];
      else if ((m = l.match(/^(?:Answer|Đáp án)\s*:\s*([A-D])/i))) q.dap_an = m[1].toUpperCase();
      else if ((m = l.match(/^(?:Explanation|Giải thích)\s*:\s*(.+)/i))) q.giai_thich = m[1];
      else if (!Object.keys(q.opts).length) q.noi_dung.push(l);
    }
    q.noi_dung = q.noi_dung.join(' '); out.push(q);
  }
  return out;
}
const mem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
r.post('/import', mem.single('file'), wrap(async (q, s) => {
  if (!q.file) fail(400, 'Chưa chọn file');
  const ext = path.extname(q.file.originalname).toLowerCase();
  const fmt = { '.xlsx': 'excel', '.xls': 'excel', '.docx': 'word', '.pdf': 'pdf' }[ext]; if (!fmt) fail(400, 'Chỉ hỗ trợ .xlsx, .xls, .docx, .pdf');
  const muc = q.body.muc_dich === 'thi_thu' ? 'thi_thu' : 'luyen_tap';
  const [lg] = await db.query('INSERT INTO lich_su_nhap_lieu(ten_file,dinh_dang_file,ma_nguoi_thuc_hien) VALUES(?,?,?)', [q.file.originalname, fmt, q.user.id]);
  try {
    let items;
    if (fmt === 'excel') {
      const wb = XLSX.read(q.file.buffer), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      items = rows.map(r0 => { const o = Object.fromEntries(Object.entries(r0).map(([k, v]) => [k.trim().toLowerCase(), String(v).trim()]));
        return { part: +o.part, noi_dung: o.noi_dung, opts: { A: o.a, B: o.b, C: o.c, D: o.d }, dap_an: (o.dap_an || '').toUpperCase(), giai_thich: o.giai_thich, do_kho: +o.do_kho || 1 }; });
    } else {
      const text = fmt === 'word' ? (await mammoth.extractRawText({ buffer: q.file.buffer })).value : (await require('pdf-parse/lib/pdf-parse.js')(q.file.buffer)).text;
      items = parseText(text);
    }
    let n = 0; const errs = [];
    await db.tx(async c => {
      for (const [i, it] of items.entries()) {
        const opts = Object.entries(it.opts).filter(([, v]) => v);
        if (!(it.part >= 1 && it.part <= 7) || !it.noi_dung || opts.length < 2 || !it.opts[it.dap_an]) { errs.push('Dòng/câu ' + (i + 1) + ' không hợp lệ'); continue; }
        const id = (await c.query('INSERT INTO cau_hoi(ma_phan,noi_dung,giai_thich,do_kho,muc_dich_su_dung,ma_nguoi_tao) VALUES(?,?,?,?,?,?)',
          [it.part, it.noi_dung, it.giai_thich || null, it.do_kho || 1, muc, q.user.id]))[0].insertId;
        for (const [k, v] of opts) await c.query('INSERT INTO dap_an(ma_cau_hoi,nhan_dap_an,noi_dung,la_dap_an_dung) VALUES(?,?,?,?)', [id, k, v, k === it.dap_an]);
        n++;
      }
    });
    await db.query('UPDATE lich_su_nhap_lieu SET so_cau_hoi_them=?,trang_thai=?,ghi_chu_loi=? WHERE ma_nhap=?', [n, n ? 'thanh_cong' : 'that_bai', errs.join('; ') || null, lg.insertId]);
    s.json({ them: n, loi: errs });
  } catch (e) {
    await db.query("UPDATE lich_su_nhap_lieu SET trang_thai='that_bai',ghi_chu_loi=? WHERE ma_nhap=?", [e.message, lg.insertId]);
    throw e;
  }
}));
r.get('/import/history', wrap(async (q, s) => s.json((await db.query('SELECT * FROM lich_su_nhap_lieu ORDER BY ma_nhap DESC LIMIT 20'))[0])));

// ---------- Quản lý người dùng (FR-09) ----------
r.get('/users', wrap(async (q, s) => {
  const w = ["vai_tro='hoc_vien'"], p = [];
  if (q.query.q) { w.push('(ho_ten LIKE ? OR email LIKE ?)'); p.push('%' + q.query.q + '%', '%' + q.query.q + '%'); }
  s.json((await db.query(`SELECT ma_nguoi_dung,ho_ten,email,vai_tro,trang_thai_tai_khoan,ngay_tao FROM nguoi_dung WHERE ${w.join(' AND ')} ORDER BY ma_nguoi_dung DESC`, p))[0]);
}));
r.get('/users/:id/history', wrap(async (q, s) => s.json((await db.query(`SELECT l.ma_luot,b.ten_bo_de,l.loai_luot,l.tong_diem,l.thoi_gian_ket_thuc FROM luot_lam_bai l
  JOIN bo_de b ON b.ma_bo_de=l.ma_bo_de WHERE l.ma_nguoi_dung=? AND l.trang_thai='hoan_thanh' ORDER BY l.ma_luot DESC`, [q.params.id]))[0])));
r.put('/users/:id', wrap(async (q, s) => {
  if (+q.params.id === q.user.id) fail(400, 'Không thể thay đổi tài khoản của chính mình');
  const d = pick(q.body, ['trang_thai_tai_khoan', 'vai_tro', 'ho_ten']);
  if (d.trang_thai_tai_khoan && !['hoat_dong', 'bi_khoa'].includes(d.trang_thai_tai_khoan)) fail(400, 'Trạng thái không hợp lệ');
  await db.query('UPDATE nguoi_dung SET ? WHERE ma_nguoi_dung=?', [d, q.params.id]); s.json({ message: 'ok' });
}));

// ---------- Thống kê hệ thống (FR-10) ----------
r.get('/stats', wrap(async (q, s) => {
  const one = async (sql) => (await db.query(sql))[0][0];
  s.json({
    hoc_vien: (await one("SELECT COUNT(*) n FROM nguoi_dung WHERE vai_tro='hoc_vien'")).n,
    luot_lam: (await one("SELECT COUNT(*) n FROM luot_lam_bai WHERE trang_thai='hoan_thanh'")).n,
    cau_hoi: (await one('SELECT COUNT(*) n FROM cau_hoi')).n,
    ai: await one("SELECT COUNT(*) tin_nhan,IFNULL(SUM(so_token_su_dung),0) tokens,IFNULL(SUM(chi_phi_uoc_tinh),0) chi_phi FROM tin_nhan_chat_ai WHERE nguoi_gui='ai'"),
    theo_part: (await db.query('SELECT p.so_thu_tu_part part,ROUND(AVG(t.ty_le_dung),1) tb FROM tien_do_hoc_tap t JOIN phan_thi p ON p.ma_phan=t.ma_phan WHERE t.ma_danh_muc IS NULL GROUP BY p.so_thu_tu_part ORDER BY part'))[0],
    theo_ngay: (await db.query('SELECT DATE(thoi_gian_bat_dau) ngay,COUNT(*) n FROM luot_lam_bai WHERE thoi_gian_bat_dau>=DATE_SUB(CURDATE(),INTERVAL 13 DAY) GROUP BY ngay ORDER BY ngay'))[0]
  });
}));
module.exports = r;
