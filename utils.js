exports.wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
exports.fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
// Chỉ lấy các field cho phép; chuỗi rỗng -> NULL
exports.pick = (o, keys) => { const d = {}; for (const k of keys) if (o[k] !== undefined) d[k] = o[k] === '' ? null : o[k]; return d; };
