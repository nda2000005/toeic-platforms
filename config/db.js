const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost', port: +process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'toeic_db', charset: 'utf8mb4',
  waitForConnections: true, connectionLimit: 10, dateStrings: true
});
// Chạy nhiều lệnh trong 1 transaction
pool.tx = async fn => {
  const c = await pool.getConnection();
  try { await c.beginTransaction(); const r = await fn(c); await c.commit(); return r; }
  catch (e) { await c.rollback(); throw e; } finally { c.release(); }
};
module.exports = pool;
