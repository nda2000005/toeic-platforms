// AI Service Layer (NFR-06): tách riêng khỏi logic nghiệp vụ, muốn đổi nhà cung cấp AI chỉ cần sửa file này.
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../config/db');
let client;

async function call(system, messages, max = 900) {
  if (!process.env.ANTHROPIC_API_KEY) { const e = new Error('Chưa cấu hình ANTHROPIC_API_KEY trong file .env'); e.status = 503; throw e; }
  client = client || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let r;
  try {
    r = await client.messages.create({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5', max_tokens: max, system, messages });
  } catch (err) { const e = new Error('Trợ lý AI tạm thời không phản hồi: ' + err.message); e.status = 502; throw e; }
  const text = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  const tin = r.usage?.input_tokens || 0, tout = r.usage?.output_tokens || 0;
  const cost = (tin * (+process.env.PRICE_IN || 3) + tout * (+process.env.PRICE_OUT || 15)) / 1e6;
  return { text, tokens: tin + tout, cost: +cost.toFixed(6) };
}

const TUTOR = 'Bạn là gia sư TOEIC thân thiện. Trả lời bằng tiếng Việt, ngắn gọn, rõ ràng, có ví dụ tiếng Anh khi cần. ' +
  'Chỉ hỗ trợ các nội dung liên quan đến học tiếng Anh/TOEIC.';

async function loadQuestion(id) {
  const [[q]] = await db.query(`SELECT c.*,p.so_thu_tu_part,g.doan_van FROM cau_hoi c JOIN phan_thi p ON p.ma_phan=c.ma_phan
    LEFT JOIN nhom_cau_hoi g ON g.ma_nhom=c.ma_nhom WHERE c.ma_cau_hoi=?`, [id]);
  if (!q) return null;
  [q.dap_an] = await db.query('SELECT ma_dap_an,nhan_dap_an,noi_dung,la_dap_an_dung FROM dap_an WHERE ma_cau_hoi=? ORDER BY nhan_dap_an', [id]);
  return q;
}
const qText = q => `Part ${q.so_thu_tu_part}\n${q.doan_van ? 'Đoạn văn: ' + q.doan_van + '\n' : ''}Câu hỏi: ${q.noi_dung}\n` +
  q.dap_an.map(a => `${a.nhan_dap_an}. ${a.noi_dung}${a.la_dap_an_dung ? ' (ĐÁP ÁN ĐÚNG)' : ''}`).join('\n');

exports.loadQuestion = loadQuestion;
exports.explain = (q, chosenId) => {
  const chosen = chosenId && q.dap_an.find(a => a.ma_dap_an === +chosenId);
  const extra = chosen ? `\nHọc viên đã chọn đáp án ${chosen.nhan_dap_an}${chosen.la_dap_an_dung ? ' (đúng)' : ' (sai) - hãy giải thích vì sao đáp án này sai'}.` : '';
  return call(TUTOR, [{ role: 'user', content: `Giải thích câu TOEIC sau: vì sao đáp án đúng là đúng, các đáp án còn lại sai ở đâu, và nêu từ vựng/ngữ pháp cần nhớ.\n\n${qText(q)}${extra}` }]);
};
exports.chat = (history, message, q) => {
  const sys = TUTOR + (q ? '\n\nNgữ cảnh câu hỏi học viên đang làm:\n' + qText(q) : '');
  const msgs = history.map(m => ({ role: m.nguoi_gui === 'ai' ? 'assistant' : 'user', content: m.noi_dung }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  msgs.push({ role: 'user', content: message });
  return call(sys, msgs);
};
exports.advise = ({ cur, target, items }) => call(TUTOR,
  [{ role: 'user', content: `Học viên có điểm TOEIC hiện tại khoảng ${cur}, mục tiêu ${target}. Các phần còn yếu (ưu tiên 1 = yếu nhất):\n` +
    items.map(i => `- ${i.ten_phan}: ${i.ghi_chu}`).join('\n') + '\nHãy viết lời khuyên ôn luyện ngắn gọn (tối đa 120 từ) dựa trên số liệu này.' }], 400);
