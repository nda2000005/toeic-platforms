// Dashboard thống kê tiến độ của học viên (FR-07)
const r = require('express').Router();
const db = require('../config/db'), { wrap } = require('../utils'), { auth } = require('../middleware/auth');
r.get('/me', auth, wrap(async (req, res) => {
  const uid = req.user.id;
  const [scores] = await db.query(`SELECT l.ma_luot,l.loai_luot,l.tong_diem,l.diem_nghe,l.diem_doc,l.thoi_gian_ket_thuc,b.ten_bo_de FROM luot_lam_bai l
    JOIN bo_de b ON b.ma_bo_de=l.ma_bo_de WHERE l.ma_nguoi_dung=? AND l.trang_thai='hoan_thanh' ORDER BY l.ma_luot DESC LIMIT 20`, [uid]);
  const [parts] = await db.query(`SELECT p.so_thu_tu_part part,ROUND(t.ty_le_dung,1) ty_le_dung,t.tong_so_lan_lam FROM tien_do_hoc_tap t
    JOIN phan_thi p ON p.ma_phan=t.ma_phan WHERE t.ma_nguoi_dung=? AND t.ma_danh_muc IS NULL ORDER BY p.so_thu_tu_part`, [uid]);
  const [vocab] = await db.query('SELECT trang_thai,COUNT(*) n FROM tu_vung_ca_nhan WHERE ma_nguoi_dung=? GROUP BY trang_thai', [uid]);
  res.json({ scores: scores.reverse(), parts, vocab });
}));
module.exports = r;
