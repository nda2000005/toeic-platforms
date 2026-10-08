require('dotenv').config();
const express = require('express'), cors = require('cors'), path = require('path');
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/exams', require('./routes/exam'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/roadmap', require('./routes/roadmap'));
app.use('/api/learn', require('./routes/learn'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', (req, res) => res.status(404).json({ message: 'Không tìm thấy API' }));

app.use(express.static(path.join(__dirname, '../frontend')));
app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Lỗi máy chủ: ' + err.message });
});
app.listen(process.env.PORT || 3000, () => console.log('Server chạy tại http://localhost:' + (process.env.PORT || 3000)));
