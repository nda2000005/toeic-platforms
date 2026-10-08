-- CSDL theo mục 3.3.1 của báo cáo (+ bảng muc_lo_trinh và cột loi_khuyen bổ sung cho Module Lộ trình)
CREATE DATABASE IF NOT EXISTS toeic_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE toeic_db;

CREATE TABLE nguoi_dung (
  ma_nguoi_dung INT AUTO_INCREMENT PRIMARY KEY, ho_ten VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE, mat_khau_ma_hoa VARCHAR(255) NOT NULL,
  ngay_sinh DATE NULL, anh_dai_dien VARCHAR(255) NULL,
  vai_tro ENUM('hoc_vien','quan_tri_vien') NOT NULL DEFAULT 'hoc_vien',
  trang_thai_tai_khoan ENUM('hoat_dong','bi_khoa') NOT NULL DEFAULT 'hoat_dong',
  ngay_tao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE ky_nang (
  ma_ky_nang INT AUTO_INCREMENT PRIMARY KEY, ten_ky_nang ENUM('Nghe','Đọc') NOT NULL, mo_ta VARCHAR(255) NULL
);
CREATE TABLE phan_thi (
  ma_phan INT AUTO_INCREMENT PRIMARY KEY, ma_ky_nang INT NOT NULL, so_thu_tu_part TINYINT NOT NULL,
  ten_phan VARCHAR(150) NOT NULL, mo_ta TEXT NULL,
  FOREIGN KEY (ma_ky_nang) REFERENCES ky_nang(ma_ky_nang)
);
CREATE TABLE danh_muc (
  ma_danh_muc INT AUTO_INCREMENT PRIMARY KEY, ten_danh_muc VARCHAR(150) NOT NULL,
  loai_danh_muc ENUM('tu_vung','ngu_phap','ky_nang') NOT NULL
);
CREATE TABLE nhom_cau_hoi (
  ma_nhom INT AUTO_INCREMENT PRIMARY KEY, ma_phan INT NOT NULL, doan_van TEXT NULL,
  duong_dan_audio VARCHAR(255) NULL, duong_dan_hinh VARCHAR(255) NULL,
  FOREIGN KEY (ma_phan) REFERENCES phan_thi(ma_phan)
);
CREATE TABLE cau_hoi (
  ma_cau_hoi INT AUTO_INCREMENT PRIMARY KEY, ma_nhom INT NULL, ma_phan INT NOT NULL, noi_dung TEXT NOT NULL,
  duong_dan_audio VARCHAR(255) NULL, duong_dan_hinh VARCHAR(255) NULL, giai_thich TEXT NULL,
  do_kho TINYINT NOT NULL DEFAULT 1, muc_dich_su_dung ENUM('luyen_tap','thi_thu') NOT NULL DEFAULT 'luyen_tap',
  ma_nguoi_tao INT NULL, ngay_tao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ma_nhom) REFERENCES nhom_cau_hoi(ma_nhom) ON DELETE SET NULL,
  FOREIGN KEY (ma_phan) REFERENCES phan_thi(ma_phan),
  FOREIGN KEY (ma_nguoi_tao) REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE SET NULL
);
CREATE TABLE cau_hoi_danh_muc (
  ma_cau_hoi INT NOT NULL, ma_danh_muc INT NOT NULL, PRIMARY KEY (ma_cau_hoi, ma_danh_muc),
  FOREIGN KEY (ma_cau_hoi) REFERENCES cau_hoi(ma_cau_hoi) ON DELETE CASCADE,
  FOREIGN KEY (ma_danh_muc) REFERENCES danh_muc(ma_danh_muc) ON DELETE CASCADE
);
CREATE TABLE dap_an (
  ma_dap_an INT AUTO_INCREMENT PRIMARY KEY, ma_cau_hoi INT NOT NULL, nhan_dap_an CHAR(1) NOT NULL,
  noi_dung TEXT NOT NULL, la_dap_an_dung BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (ma_cau_hoi) REFERENCES cau_hoi(ma_cau_hoi) ON DELETE CASCADE
);
CREATE TABLE bo_de (
  ma_bo_de INT AUTO_INCREMENT PRIMARY KEY, ten_bo_de VARCHAR(200) NOT NULL,
  loai_bo_de ENUM('luyen_tap','thi_thu') NOT NULL DEFAULT 'luyen_tap',
  thoi_gian_lam_bai_phut INT NULL DEFAULT 120, tong_so_cau INT NOT NULL DEFAULT 0,
  ma_nguoi_tao INT NOT NULL, ngay_tao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ma_nguoi_tao) REFERENCES nguoi_dung(ma_nguoi_dung)
);
CREATE TABLE bo_de_phan_thi (
  ma_bo_de INT NOT NULL, ma_phan INT NOT NULL, PRIMARY KEY (ma_bo_de, ma_phan),
  FOREIGN KEY (ma_bo_de) REFERENCES bo_de(ma_bo_de) ON DELETE CASCADE,
  FOREIGN KEY (ma_phan) REFERENCES phan_thi(ma_phan)
);
CREATE TABLE bo_de_cau_hoi (
  ma_bo_de INT NOT NULL, ma_cau_hoi INT NOT NULL, thu_tu INT NOT NULL DEFAULT 0,
  PRIMARY KEY (ma_bo_de, ma_cau_hoi),
  FOREIGN KEY (ma_bo_de) REFERENCES bo_de(ma_bo_de) ON DELETE CASCADE,
  FOREIGN KEY (ma_cau_hoi) REFERENCES cau_hoi(ma_cau_hoi) ON DELETE CASCADE
);
CREATE TABLE lich_su_nhap_lieu (
  ma_nhap INT AUTO_INCREMENT PRIMARY KEY, ten_file VARCHAR(255) NOT NULL,
  dinh_dang_file ENUM('excel','word','pdf') NOT NULL, ma_nguoi_thuc_hien INT NOT NULL,
  so_cau_hoi_them INT NOT NULL DEFAULT 0, thoi_gian_nhap DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  trang_thai ENUM('dang_xu_ly','thanh_cong','that_bai') NOT NULL DEFAULT 'dang_xu_ly', ghi_chu_loi TEXT NULL,
  FOREIGN KEY (ma_nguoi_thuc_hien) REFERENCES nguoi_dung(ma_nguoi_dung)
);
CREATE TABLE luot_lam_bai (
  ma_luot INT AUTO_INCREMENT PRIMARY KEY, ma_nguoi_dung INT NOT NULL, ma_bo_de INT NOT NULL,
  loai_luot ENUM('luyen_tap','thi_thu') NOT NULL DEFAULT 'luyen_tap',
  thoi_gian_bat_dau DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, thoi_gian_ket_thuc DATETIME NULL,
  diem_nghe FLOAT NULL DEFAULT 0, diem_doc FLOAT NULL DEFAULT 0, tong_diem FLOAT NULL DEFAULT 0,
  trang_thai ENUM('dang_lam','hoan_thanh','huy') NOT NULL DEFAULT 'dang_lam',
  FOREIGN KEY (ma_nguoi_dung) REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
  FOREIGN KEY (ma_bo_de) REFERENCES bo_de(ma_bo_de) ON DELETE CASCADE
);
CREATE TABLE cau_tra_loi (
  ma_cau_tra_loi INT AUTO_INCREMENT PRIMARY KEY, ma_luot INT NOT NULL, ma_cau_hoi INT NOT NULL,
  ma_dap_an_chon INT NULL, dung_sai BOOLEAN NULL, thoi_gian_lam_giay INT NULL,
  FOREIGN KEY (ma_luot) REFERENCES luot_lam_bai(ma_luot) ON DELETE CASCADE,
  FOREIGN KEY (ma_cau_hoi) REFERENCES cau_hoi(ma_cau_hoi) ON DELETE CASCADE,
  FOREIGN KEY (ma_dap_an_chon) REFERENCES dap_an(ma_dap_an) ON DELETE SET NULL
);
CREATE TABLE tien_do_hoc_tap (
  ma_tien_do INT AUTO_INCREMENT PRIMARY KEY, ma_nguoi_dung INT NOT NULL, ma_phan INT NOT NULL,
  ma_danh_muc INT NULL, ty_le_dung FLOAT NOT NULL DEFAULT 0, tong_so_lan_lam INT NOT NULL DEFAULT 0,
  lan_cuoi_luyen_tap DATETIME NULL,
  FOREIGN KEY (ma_nguoi_dung) REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
  FOREIGN KEY (ma_phan) REFERENCES phan_thi(ma_phan),
  FOREIGN KEY (ma_danh_muc) REFERENCES danh_muc(ma_danh_muc) ON DELETE SET NULL
);
CREATE TABLE ly_thuyet_ngu_phap (
  ma_ly_thuyet INT AUTO_INCREMENT PRIMARY KEY, ma_danh_muc INT NULL, ma_phan INT NULL,
  tieu_de VARCHAR(200) NOT NULL, noi_dung LONGTEXT NOT NULL,
  cap_do ENUM('co_ban','nang_cao') NOT NULL DEFAULT 'co_ban', thu_tu_hien_thi INT NOT NULL DEFAULT 0,
  FOREIGN KEY (ma_danh_muc) REFERENCES danh_muc(ma_danh_muc) ON DELETE SET NULL,
  FOREIGN KEY (ma_phan) REFERENCES phan_thi(ma_phan) ON DELETE SET NULL
);
CREATE TABLE tu_vung (
  ma_tu_vung INT AUTO_INCREMENT PRIMARY KEY, ma_danh_muc INT NOT NULL, tu VARCHAR(150) NOT NULL,
  nghia TEXT NOT NULL, phien_am VARCHAR(100) NULL, tu_loai VARCHAR(50) NULL, vi_du TEXT NULL,
  cap_do ENUM('A1','A2','B1','B2','C1','C2') NOT NULL DEFAULT 'B1', audio_url VARCHAR(255) NULL,
  FOREIGN KEY (ma_danh_muc) REFERENCES danh_muc(ma_danh_muc) ON DELETE CASCADE
);
CREATE TABLE tu_vung_ca_nhan (
  ma_tvcn INT AUTO_INCREMENT PRIMARY KEY, ma_nguoi_dung INT NOT NULL, ma_tu_vung INT NOT NULL,
  trang_thai ENUM('chua_hoc','dang_hoc','da_thuoc') NOT NULL DEFAULT 'chua_hoc', lan_on_tap_cuoi DATETIME NULL,
  UNIQUE (ma_nguoi_dung, ma_tu_vung),
  FOREIGN KEY (ma_nguoi_dung) REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
  FOREIGN KEY (ma_tu_vung) REFERENCES tu_vung(ma_tu_vung) ON DELETE CASCADE
);
CREATE TABLE phien_chat_ai (
  ma_phien INT AUTO_INCREMENT PRIMARY KEY, ma_nguoi_dung INT NOT NULL, ma_cau_hoi INT NULL,
  thoi_gian_bat_dau DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ma_nguoi_dung) REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
  FOREIGN KEY (ma_cau_hoi) REFERENCES cau_hoi(ma_cau_hoi) ON DELETE SET NULL
);
CREATE TABLE tin_nhan_chat_ai (
  ma_tin_nhan INT AUTO_INCREMENT PRIMARY KEY, ma_phien INT NOT NULL,
  nguoi_gui ENUM('nguoi_dung','ai') NOT NULL, noi_dung TEXT NOT NULL,
  so_token_su_dung INT NOT NULL DEFAULT 0, chi_phi_uoc_tinh DECIMAL(10,6) NOT NULL DEFAULT 0,
  thoi_gian_tao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ma_phien) REFERENCES phien_chat_ai(ma_phien) ON DELETE CASCADE
);
CREATE TABLE lo_trinh_hoc_tap (
  ma_lo_trinh INT AUTO_INCREMENT PRIMARY KEY, ma_nguoi_dung INT NOT NULL, diem_hien_tai FLOAT NULL,
  diem_muc_tieu FLOAT NULL, so_ngay_du_kien INT NULL, ngay_bat_dau DATE NULL, ngay_du_kien_hoan_thanh DATE NULL,
  thoi_gian_tao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  trang_thai ENUM('dang_ap_dung','da_hoan_thanh','da_thay_the') NOT NULL DEFAULT 'dang_ap_dung',
  loi_khuyen TEXT NULL,
  FOREIGN KEY (ma_nguoi_dung) REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE
);
CREATE TABLE muc_lo_trinh (
  ma_muc INT AUTO_INCREMENT PRIMARY KEY, ma_lo_trinh INT NOT NULL, ma_phan INT NULL, ma_danh_muc INT NULL,
  muc_do_uu_tien TINYINT NOT NULL DEFAULT 2, ghi_chu VARCHAR(255) NULL, de_xuat VARCHAR(255) NULL,
  FOREIGN KEY (ma_lo_trinh) REFERENCES lo_trinh_hoc_tap(ma_lo_trinh) ON DELETE CASCADE,
  FOREIGN KEY (ma_phan) REFERENCES phan_thi(ma_phan) ON DELETE SET NULL,
  FOREIGN KEY (ma_danh_muc) REFERENCES danh_muc(ma_danh_muc) ON DELETE SET NULL
);

-- Dữ liệu cố định: 2 kỹ năng, 7 Part (ma_phan = số thứ tự Part)
INSERT INTO ky_nang(ma_ky_nang,ten_ky_nang,mo_ta) VALUES (1,'Nghe','Listening - Part 1-4'),(2,'Đọc','Reading - Part 5-7');
INSERT INTO phan_thi(ma_phan,ma_ky_nang,so_thu_tu_part,ten_phan) VALUES
 (1,1,1,'Part 1 - Photographs'),(2,1,2,'Part 2 - Question-Response'),(3,1,3,'Part 3 - Conversations'),(4,1,4,'Part 4 - Short Talks'),
 (5,2,5,'Part 5 - Incomplete Sentences'),(6,2,6,'Part 6 - Text Completion'),(7,2,7,'Part 7 - Reading Comprehension');
