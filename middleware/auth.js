const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { wrap, fail } = require('../utils');

// Xác thực JWT + kiểm tra tài khoản có bị khóa không
exports.auth = wrap(async (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  let p; try { p = jwt.verify(token, process.env.JWT_SECRET); } catch { fail(401, 'Chưa đăng nhập hoặc phiên hết hạn'); }
  const [[u]] = await db.query('SELECT ma_nguoi_dung,vai_tro,trang_thai_tai_khoan FROM nguoi_dung WHERE ma_nguoi_dung=?', [p.id]);
  if (!u) fail(401, 'Tài khoản không tồn tại');
  if (u.trang_thai_tai_khoan === 'bi_khoa') fail(403, 'Tài khoản đã bị khóa');
  req.user = { id: u.ma_nguoi_dung, role: u.vai_tro };
  next();
});
// Phân quyền: chỉ quản trị viên
exports.admin = (req, res, next) =>
  req.user.role === 'quan_tri_vien' ? next() : res.status(403).json({ message: 'Chỉ dành cho quản trị viên' });
