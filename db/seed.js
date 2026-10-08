// Chạy: npm run seed  -> tạo tài khoản admin, danh mục, lý thuyết, từ vựng và vài câu hỏi Part 5 + 2 bộ đề mẫu
require('dotenv').config();
const bcrypt = require('bcryptjs'), db = require('../config/db');
(async () => {
  const [[ex]] = await db.query("SELECT ma_nguoi_dung FROM nguoi_dung WHERE email='admin@toeic.local'");
  let admin = ex?.ma_nguoi_dung;
  if (!admin) admin = (await db.query("INSERT INTO nguoi_dung(ho_ten,email,mat_khau_ma_hoa,vai_tro) VALUES('Quản trị viên','admin@toeic.local',?, 'quan_tri_vien')", [await bcrypt.hash('Admin@123', 10)]))[0].insertId;
  const [[has]] = await db.query('SELECT COUNT(*) n FROM cau_hoi'); if (has.n) { console.log('Đã có dữ liệu, bỏ qua seed câu hỏi.'); return process.exit(); }

  const cat = async (t, l) => (await db.query('INSERT INTO danh_muc(ten_danh_muc,loai_danh_muc) VALUES(?,?)', [t, l]))[0].insertId;
  const cOffice = await cat('Office & Business', 'tu_vung'), cGram = await cat('Từ loại & Giới từ', 'ngu_phap');
  await db.query('INSERT INTO ly_thuyet_ngu_phap(ma_danh_muc,ma_phan,tieu_de,noi_dung,cap_do) VALUES(?,?,?,?,?)',
    [cGram, 5, 'Part 5: Nhận biết từ loại', 'Trước danh từ cần tính từ; sau động từ thường cần trạng từ; sau giới từ cần danh từ/V-ing.\nVí dụ: She is a responsible manager.', 'co_ban']);
  for (const v of [['deadline', 'hạn chót', 'noun'], ['reduce', 'giảm', 'verb'], ['responsible', 'chịu trách nhiệm', 'adj'], ['colleague', 'đồng nghiệp', 'noun']])
    await db.query('INSERT INTO tu_vung(ma_danh_muc,tu,nghia,tu_loai,vi_du,cap_do) VALUES(?,?,?,?,?,?)', [cOffice, v[0], v[1], v[2], 'Example with "' + v[0] + '".', 'B1']);

  // Mỗi câu: [nội dung, [4 đáp án], chỉ số đáp án đúng, giải thích]
  const data = [
    ['The manager asked all employees to submit their reports ___ Friday.', ['by', 'until', 'since', 'during'], 0, '"by + mốc thời gian" = trước/muộn nhất là mốc đó.'],
    ['Ms. Lee is ___ for the marketing department.', ['responsibly', 'responsible', 'responsibility', 'respond'], 1, 'Sau "is" cần tính từ: be responsible for.'],
    ['The new software will help us ___ costs.', ['reduction', 'reducing', 'reduce', 'reduced'], 2, 'help sb + V nguyên mẫu.'],
    ['___ the heavy rain, the outdoor event went ahead as planned.', ['Because', 'Although', 'Despite', 'However'], 2, 'Despite + cụm danh từ.'],
    ['Please contact the HR office if you have any ___ about your benefits.', ['questioned', 'questions', 'questionable', 'questioning'], 1, 'any + danh từ số nhiều.']
  ];
  const ids = { luyen_tap: [], thi_thu: [] };   // cùng nội dung nhưng tách thành 2 tập dữ liệu luyện tập / thi thử
  for (const muc of ['luyen_tap', 'thi_thu']) for (const [nd, opts, ok, gt] of data) {
    const id = (await db.query('INSERT INTO cau_hoi(ma_phan,noi_dung,giai_thich,muc_dich_su_dung,ma_nguoi_tao) VALUES(5,?,?,?,?)', [nd, gt, muc, admin]))[0].insertId;
    for (const [i, o] of opts.entries()) await db.query('INSERT INTO dap_an(ma_cau_hoi,nhan_dap_an,noi_dung,la_dap_an_dung) VALUES(?,?,?,?)', [id, 'ABCD'[i], o, i === ok]);
    ids[muc].push(id);
  }
  for (const [ten, muc, phut] of [['Luyện Part 5 - Bộ 1', 'luyen_tap', 10], ['Thi thử mini - Bộ 1', 'thi_thu', 10]]) {
    const b = (await db.query('INSERT INTO bo_de(ten_bo_de,loai_bo_de,thoi_gian_lam_bai_phut,tong_so_cau,ma_nguoi_tao) VALUES(?,?,?,?,?)', [ten, muc, phut, ids[muc].length, admin]))[0].insertId;
    await db.query('INSERT INTO bo_de_phan_thi VALUES(?,5)', [b]);
    for (const [i, q] of ids[muc].entries()) await db.query('INSERT INTO bo_de_cau_hoi VALUES(?,?,?)', [b, q, i]);
  }
  console.log('Seed xong. Đăng nhập admin: admin@toeic.local / Admin@123'); process.exit();
})().catch(e => { console.error(e); process.exit(1); });
