const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const filename = path.resolve(process.env.DATABASE_FILE || './data/ubru.sqlite');
fs.mkdirSync(path.dirname(filename), { recursive: true });
const raw = new DatabaseSync(filename);
const db = {
  exec: sql => raw.exec(sql),
  prepare: sql => raw.prepare(sql),
  pragma: sql => raw.exec(`PRAGMA ${sql}`),
  transaction: fn => (...args) => { raw.exec('BEGIN IMMEDIATE'); try { const result=fn(...args); raw.exec('COMMIT'); return result; } catch(error) { raw.exec('ROLLBACK'); throw error; } },
  close: () => raw.close()
};
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK(role IN ('user','admin')) DEFAULT 'user',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  building TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK(capacity > 0),
  img TEXT NOT NULL DEFAULT '',
  features TEXT NOT NULL DEFAULT '[]',
  approval_required INTEGER NOT NULL DEFAULT 0 CHECK(approval_required IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL,
  people INTEGER NOT NULL CHECK(people > 0),
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  equipment TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('รออนุมัติ','อนุมัติแล้ว','ปฏิเสธ','ยกเลิก')),
  booked_by TEXT NOT NULL DEFAULT 'ผู้จอง',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bookings_room_date_status ON bookings(room_id,date,status);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id,created_at);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role_target TEXT NOT NULL DEFAULT 'user',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS issue_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  type TEXT NOT NULL,
  priority TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'รอตรวจสอบ',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'ทั่วไป',
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expired INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
`);

module.exports = db;
