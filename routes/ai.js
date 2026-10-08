// Module Trợ lý AI: giải thích đáp án (FR-04) + chat hỏi đáp (FR-05). Mọi hội thoại được lưu kèm token/chi phí.
const r = require('express').Router();
const db = require('../config/db'), ai = require('../services/aiService');
const { wrap, fail } = require('../utils'), { auth } = require('../middleware/auth');
r.use(auth);

const newSession = async (uid, cau) => (await db.query('INSERT INTO phien_chat_ai(ma_nguoi_dung,ma_cau_hoi) VALUES(?,?)', [uid, cau || null]))[0].insertId;
const log = (ph, who, text, tokens = 0, cost = 0) =>
  db.query('INSERT INTO tin_nhan_chat_ai(ma_phien,nguoi_gui,noi_dung,so_token_su_dung,chi_phi_uoc_tinh) VALUES(?,?,?,?,?)', [ph, who, text, tokens, cost]);

r.post('/explain', wrap(async (req, res) => {
  const { ma_cau_hoi, ma_dap_an_chon, force } = req.body;
  const q = await ai.loadQuestion(ma_cau_hoi);
  if (!q) fail(404, 'Không tìm thấy câu hỏi');
  if (q.giai_thich && !ma_dap_an_chon && !force) return res.json({ text: q.giai_thich, saved: true });
  const out = await ai.explain(q, ma_dap_an_chon);
  const ph = await newSession(req.user.id, ma_cau_hoi);
  await log(ph, 'nguoi_dung', 'Giải thích câu hỏi #' + ma_cau_hoi);
  await log(ph, 'ai', out.text, out.tokens, out.cost);
  res.json({ text: out.text, ma_phien: ph });
}));

r.post('/chat', wrap(async (req, res) => {
  let { ma_phien, message, ma_cau_hoi } = req.body;
  if (!message?.trim()) fail(400, 'Hãy nhập câu hỏi');
  if (ma_phien) {
    const [[s]] = await db.query('SELECT 1 x FROM phien_chat_ai WHERE ma_phien=? AND ma_nguoi_dung=?', [ma_phien, req.user.id]);
    if (!s) fail(404, 'Không tìm thấy phiên chat');
  } else ma_phien = await newSession(req.user.id, ma_cau_hoi);
  const [hist] = await db.query('SELECT nguoi_gui,noi_dung FROM tin_nhan_chat_ai WHERE ma_phien=? ORDER BY ma_tin_nhan DESC LIMIT 10', [ma_phien]);
  const out = await ai.chat(hist.reverse(), message.trim(), ma_cau_hoi ? await ai.loadQuestion(ma_cau_hoi) : null);
  await log(ma_phien, 'nguoi_dung', message.trim());
  await log(ma_phien, 'ai', out.text, out.tokens, out.cost);
  res.json({ ma_phien, text: out.text });
}));
module.exports = r;
