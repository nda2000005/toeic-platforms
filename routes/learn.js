// Học từ vựng & ngữ pháp (FR-12) + Module Từ vựng cá nhân (Flashcard)
const r = require('express').Router();
const db = require('../config/db'), { wrap, fail } = require('../utils'), { auth } = require('../middleware/auth');
r.use(auth);

r.get('/categories', wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM danh_muc WHERE (? IS NULL OR loai_danh_muc=?) ORDER BY ten_danh_muc', [req.query.loai || null, req.query.loai || null]);
  res.json(rows);
}));
r.get('/theory', wrap(async (req, res) => {
  const { danh_muc, phan } = req.query, w = [], p = [];
  if (danh_muc) { w.push('ma_danh_muc=?'); p.push(danh_muc); }
  if (phan) { w.push('ma_phan=?'); p.push(phan); }
  const [rows] = await db.query(`SELECT * FROM ly_thuyet_ngu_phap ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY thu_tu_hien_thi,ma_ly_thuyet`, p);
  res.json(rows);
}));
r.get('/vocab', wrap(async (req, res) => {
  const { danh_muc, cap_do, trang_thai } = req.query, w = [], p = [req.user.id];
  if (danh_muc) { w.push('v.ma_danh_muc=?'); p.push(danh_muc); }
  if (cap_do) { w.push('v.cap_do=?'); p.push(cap_do); }
  if (trang_thai) { w.push("IFNULL(t.trang_thai,'chua_hoc')=?"); p.push(trang_thai); }
  const [rows] = await db.query(`SELECT v.*,IFNULL(t.trang_thai,'chua_hoc') trang_thai FROM tu_vung v
    LEFT JOIN tu_vung_ca_nhan t ON t.ma_tu_vung=v.ma_tu_vung AND t.ma_nguoi_dung=? ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY v.tu LIMIT 500`, p);
  res.json(rows);
}));
r.post('/vocab/:id/status', wrap(async (req, res) => {
  if (!['chua_hoc', 'dang_hoc', 'da_thuoc'].includes(req.body.trang_thai)) fail(400, 'Trạng thái không hợp lệ');
  await db.query(`INSERT INTO tu_vung_ca_nhan(ma_nguoi_dung,ma_tu_vung,trang_thai,lan_on_tap_cuoi) VALUES(?,?,?,NOW())
    ON DUPLICATE KEY UPDATE trang_thai=VALUES(trang_thai),lan_on_tap_cuoi=NOW()`, [req.user.id, req.params.id, req.body.trang_thai]);
  res.json({ message: 'ok' });
}));
module.exports = r;
