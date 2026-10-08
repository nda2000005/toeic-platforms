const r = require('express').Router(), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const db = require('../config/db'), { wrap, fail, pick } = require('../utils'), { auth } = require('../middleware/auth');
const sign = u => jwt.sign({ id: u.ma_nguoi_dung, role: u.vai_tro }, process.env.JWT_SECRET, { expiresIn: '7d' });
const emailOk = e => /^\S+@\S+\.\S+$/.test(e || '');

// FR-01: Đăng ký (mặc định vai trò học viên)
r.post('/register', wrap(async (req, res) => {
  const { ho_ten, email, mat_khau } = req.body;
  if (!ho_ten?.trim() || !emailOk(email)) fail(400, 'Họ tên hoặc email không hợp lệ');
  if (!mat_khau || mat_khau.length < 6) fail(400, 'Mật khẩu tối thiểu 6 ký tự');
  const [ex] = await db.query('SELECT 1 FROM nguoi_dung WHERE email=?', [email]);
  if (ex.length) fail(409, 'Email đã được đăng ký');
  await db.query('INSERT INTO nguoi_dung(ho_ten,email,mat_khau_ma_hoa) VALUES(?,?,?)', [ho_ten.trim(), email, await bcrypt.hash(mat_khau, 10)]);
  res.status(201).json({ message: 'Đăng ký thành công, hãy đăng nhập' });
}));

// Đăng nhập (học viên & quản trị viên dùng chung)
r.post('/login', wrap(async (req, res) => {
  const { email, mat_khau } = req.body;
  const [[u]] = await db.query('SELECT * FROM nguoi_dung WHERE email=?', [email || '']);
  if (!u || !(await bcrypt.compare(mat_khau || '', u.mat_khau_ma_hoa))) fail(401, 'Email hoặc mật khẩu không đúng');
  if (u.trang_thai_tai_khoan === 'bi_khoa') fail(403, 'Tài khoản đã bị khóa');
  res.json({ token: sign(u), vai_tro: u.vai_tro });
}));

// Quên mật khẩu (extend của Đăng nhập). Chưa gắn dịch vụ email: link đặt lại được in ra console server
// (và trả về trong response khi NODE_ENV != production để demo).
r.post('/forgot', wrap(async (req, res) => {
  const [[u]] = await db.query('SELECT ma_nguoi_dung,mat_khau_ma_hoa FROM nguoi_dung WHERE email=?', [req.body.email || '']);
  const out = { message: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi' };
  if (u) {
    const token = jwt.sign({ id: u.ma_nguoi_dung, purpose: 'reset' }, process.env.JWT_SECRET + u.mat_khau_ma_hoa, { expiresIn: '15m' });
    console.log('[RESET PASSWORD]', req.body.email, token);
    if (process.env.NODE_ENV !== 'production') out.dev_token = token;
  }
  res.json(out);
}));
r.post('/reset', wrap(async (req, res) => {
  const { email, token, mat_khau } = req.body;
  if (!mat_khau || mat_khau.length < 6) fail(400, 'Mật khẩu tối thiểu 6 ký tự');
  const [[u]] = await db.query('SELECT ma_nguoi_dung,mat_khau_ma_hoa FROM nguoi_dung WHERE email=?', [email || '']);
  try { if (!u || jwt.verify(token, process.env.JWT_SECRET + u.mat_khau_ma_hoa).purpose !== 'reset') throw 0; } catch { fail(400, 'Mã đặt lại không hợp lệ hoặc đã hết hạn'); }
  await db.query('UPDATE nguoi_dung SET mat_khau_ma_hoa=? WHERE ma_nguoi_dung=?', [await bcrypt.hash(mat_khau, 10), u.ma_nguoi_dung]);
  res.json({ message: 'Đã đặt lại mật khẩu' });
}));

// FR-11: Hồ sơ cá nhân
r.get('/me', auth, wrap(async (req, res) => {
  const [[u]] = await db.query('SELECT ma_nguoi_dung,ho_ten,email,ngay_sinh,anh_dai_dien,vai_tro,ngay_tao FROM nguoi_dung WHERE ma_nguoi_dung=?', [req.user.id]);
  res.json(u);
}));
r.put('/me', auth, wrap(async (req, res) => {
  const d = pick(req.body, ['ho_ten', 'ngay_sinh', 'anh_dai_dien']);
  if (d.ho_ten === null) fail(400, 'Họ tên không được để trống');
  if (Object.keys(d).length) await db.query('UPDATE nguoi_dung SET ? WHERE ma_nguoi_dung=?', [d, req.user.id]);
  res.json({ message: 'Đã cập nhật hồ sơ' });
}));
r.put('/password', auth, wrap(async (req, res) => {
  const { mat_khau_cu, mat_khau_moi } = req.body;
  const [[u]] = await db.query('SELECT mat_khau_ma_hoa FROM nguoi_dung WHERE ma_nguoi_dung=?', [req.user.id]);
  if (!(await bcrypt.compare(mat_khau_cu || '', u.mat_khau_ma_hoa))) fail(400, 'Mật khẩu cũ không đúng');
  if (!mat_khau_moi || mat_khau_moi.length < 6) fail(400, 'Mật khẩu mới tối thiểu 6 ký tự');
  await db.query('UPDATE nguoi_dung SET mat_khau_ma_hoa=? WHERE ma_nguoi_dung=?', [await bcrypt.hash(mat_khau_moi, 10), req.user.id]);
  res.json({ message: 'Đã đổi mật khẩu' });
}));
r.delete('/me', auth, wrap(async (req, res) => {
  if (req.user.role === 'quan_tri_vien') fail(403, 'Không thể tự xóa tài khoản quản trị');
  await db.query('DELETE FROM nguoi_dung WHERE ma_nguoi_dung=?', [req.user.id]);
  res.json({ message: 'Đã xóa tài khoản' });
}));
module.exports = r;
