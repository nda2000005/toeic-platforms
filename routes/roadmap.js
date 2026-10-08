// Module Lộ trình học tập cá nhân hóa: RULE-BASED phân tích điểm yếu theo Part (FR-06); AI chỉ diễn giải thành lời khuyên.
const r = require('express').Router();
const db = require('../config/db'), ai = require('../services/aiService');
const { wrap, fail } = require('../utils'), { auth } = require('../middleware/auth');
r.use(auth);
const dayStr = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const POINTS_PER_WEEK = 15; // giả định mức cải thiện điểm ước tính mỗi tuần để tính số ngày dự kiến

async function currentScore(uid) {
  const [[a]] = await db.query("SELECT tong_diem FROM luot_lam_bai WHERE ma_nguoi_dung=? AND loai_luot='thi_thu' AND trang_thai='hoan_thanh' ORDER BY ma_luot DESC LIMIT 1", [uid]);
  if (a) return Math.round(a.tong_diem);
  const [[b]] = await db.query('SELECT AVG(ty_le_dung) v FROM tien_do_hoc_tap WHERE ma_nguoi_dung=? AND ma_danh_muc IS NULL', [uid]);
  return b.v == null ? null : Math.round(b.v * 9.9);   // ước lượng từ tỷ lệ đúng khi chưa thi thử
}

r.get('/', wrap(async (req, res) => {
  const [[l]] = await db.query("SELECT * FROM lo_trinh_hoc_tap WHERE ma_nguoi_dung=? AND trang_thai='dang_ap_dung' ORDER BY ma_lo_trinh DESC LIMIT 1", [req.user.id]);
  if (!l) return res.json(null);
  [l.items] = await db.query(`SELECT m.*,p.so_thu_tu_part,p.ten_phan FROM muc_lo_trinh m LEFT JOIN phan_thi p ON p.ma_phan=m.ma_phan
    WHERE m.ma_lo_trinh=? ORDER BY m.muc_do_uu_tien,m.ma_muc`, [l.ma_lo_trinh]);
  res.json(l);
}));

r.post('/', wrap(async (req, res) => {
  const target = +req.body.diem_muc_tieu;
  if (!(target >= 10 && target <= 990)) fail(400, 'Điểm mục tiêu phải từ 10 đến 990');
  const cur = await currentScore(req.user.id);
  if (cur == null) fail(400, 'Bạn cần làm bài test đầu vào (một đề thi thử hoặc luyện tập) trước khi tạo lộ trình');
  const [parts] = await db.query(`SELECT p.ma_phan,p.so_thu_tu_part,p.ten_phan,t.ty_le_dung FROM phan_thi p
    LEFT JOIN tien_do_hoc_tap t ON t.ma_phan=p.ma_phan AND t.ma_nguoi_dung=? AND t.ma_danh_muc IS NULL ORDER BY p.so_thu_tu_part`, [req.user.id]);
  // Tập luật: <50% rất yếu (ưu tiên 1) | <70% cần cải thiện (2) | <85% củng cố (3) | chưa có dữ liệu -> (2)
  const items = [];
  for (const p of parts) {
    const v = p.ty_le_dung; let lv, note;
    if (v == null) { lv = 2; note = 'Chưa có dữ liệu - hãy làm thử Part này để đánh giá'; }
    else if (v < 50) { lv = 1; note = `Tỷ lệ đúng ${v.toFixed(0)}% - rất yếu, cần ưu tiên`; }
    else if (v < 70) { lv = 2; note = `Tỷ lệ đúng ${v.toFixed(0)}% - cần cải thiện`; }
    else if (v < 85) { lv = 3; note = `Tỷ lệ đúng ${v.toFixed(0)}% - củng cố thêm`; }
    else continue;
    items.push({ ma_phan: p.ma_phan, ten_phan: p.ten_phan, lv, ghi_chu: note,
      de_xuat: `Ôn lý thuyết Part ${p.so_thu_tu_part} và luyện ${lv === 1 ? 30 : 20} câu/tuần` });
  }
  items.sort((a, b) => a.lv - b.lv);

  const gap = Math.max(0, target - cur);
  let soNgay = Math.max(7, Math.ceil(gap / POINTS_PER_WEEK) * 7), canhBao = null;
  if (req.body.ngay_thi) {
    const d = Math.ceil((new Date(req.body.ngay_thi) - Date.now()) / 864e5);
    if (!(d >= 1)) fail(400, 'Ngày thi dự kiến không hợp lệ');
    if (d < soNgay) canhBao = `Thời gian đến ngày thi (${d} ngày) ngắn hơn mức ước tính cần thiết (${soNgay} ngày) - hãy tăng cường độ luyện tập.`;
    soNgay = d;
  }
  let loiKhuyen = null;
  try { loiKhuyen = (await ai.advise({ cur, target, items })).text; } catch (e) { /* AI lỗi thì vẫn trả lộ trình rule-based */ }

  const id = await db.tx(async c => {
    await c.query("UPDATE lo_trinh_hoc_tap SET trang_thai='da_thay_the' WHERE ma_nguoi_dung=? AND trang_thai='dang_ap_dung'", [req.user.id]);
    const [x] = await c.query('INSERT INTO lo_trinh_hoc_tap(ma_nguoi_dung,diem_hien_tai,diem_muc_tieu,so_ngay_du_kien,ngay_bat_dau,ngay_du_kien_hoan_thanh,loi_khuyen) VALUES(?,?,?,?,?,?,?)',
      [req.user.id, cur, target, soNgay, dayStr(0), dayStr(soNgay), loiKhuyen]);
    for (const i of items) await c.query('INSERT INTO muc_lo_trinh(ma_lo_trinh,ma_phan,muc_do_uu_tien,ghi_chu,de_xuat) VALUES(?,?,?,?,?)', [x.insertId, i.ma_phan, i.lv, i.ghi_chu, i.de_xuat]);
    return x.insertId;
  });
  res.status(201).json({ ma_lo_trinh: id, canh_bao: canhBao });
}));
module.exports = r;
