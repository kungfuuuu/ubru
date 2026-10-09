require('dotenv').config();
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { body, param, query, validationResult } = require('express-validator');
const db = require('./db');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) app.set('trust proxy', 1);
if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error('Set SESSION_SECRET to at least 32 characters in production.');
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
class SQLiteSessionStore extends session.Store {
  get(sid, callback) { try { const row=db.prepare('SELECT sess,expired FROM sessions WHERE sid=?').get(sid); if(!row)return callback(null,null); if(row.expired<=Date.now()){this.destroy(sid,()=>callback(null,null));return;} callback(null,JSON.parse(row.sess)); } catch(error) { callback(error); } }
  set(sid,sess,callback=()=>{}) { try { const expires=sess.cookie?.expires?new Date(sess.cookie.expires).getTime():Date.now()+8*60*60*1000; db.prepare('INSERT INTO sessions(sid,sess,expired) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess,expired=excluded.expired').run(sid,JSON.stringify(sess),expires);callback(null); } catch(error){callback(error);} }
  destroy(sid,callback=()=>{}) { try { db.prepare('DELETE FROM sessions WHERE sid=?').run(sid);callback(null); } catch(error){callback(error);} }
  touch(sid,sess,callback=()=>{}) { try { const expires=sess.cookie?.expires?new Date(sess.cookie.expires).getTime():Date.now()+8*60*60*1000;db.prepare('UPDATE sessions SET expired=? WHERE sid=?').run(expires,sid);callback(null); } catch(error){callback(error);} }
}
app.use(session({
  store: new SQLiteSessionStore(),
  name: 'ubru.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret-before-deploying',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: isProduction, maxAge: 8 * 60 * 60 * 1000 }
}));

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
db.prepare('DELETE FROM sessions WHERE expired<=?').run(Date.now());
const publicUser = row => row && ({ id: row.id, email: row.email, name: row.name, code: row.code, department: row.department, role: row.role, active: Boolean(row.active) });
const roomView = row => ({ id: row.id, name: row.name, type: row.type, building: row.building, capacity: row.capacity, img: row.img, features: JSON.parse(row.features || '[]'), approvalRequired: Boolean(row.approval_required), active: Boolean(row.active) });
const bookingView = row => ({ id: row.id, roomId: row.room_id, userId: row.user_id, name: row.name, code: row.code, department: row.department, purpose: row.purpose, people: row.people, date: row.date, startTime: row.start_time, endTime: row.end_time, time: `${row.start_time} - ${row.end_time} น.`, equipment: JSON.parse(row.equipment || '[]'), note: row.note, status: row.status, bookedBy: row.booked_by, createdAt: row.created_at, roomName: row.room_name, building: row.building, roomType: row.room_type, approvalRequired: Boolean(row.approval_required) });
const roomSelect = `SELECT b.*, r.name AS room_name, r.building, r.type AS room_type, r.approval_required FROM bookings b JOIN rooms r ON r.id=b.room_id`;
const currentUser = req => req.session.user ? db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(req.session.user.id) : null;
function requireAuth(req, res, next) { const user = currentUser(req); if (!user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' }); req.user = user; next(); }
function requireAdmin(req, res, next) { if (req.user?.role !== 'admin') return res.status(403).json({ error: 'ไม่มีสิทธิ์ผู้ดูแลระบบ' }); next(); }
function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const expected = req.session.csrfToken, provided = req.get('x-csrf-token');
  if (!expected || !provided || expected.length !== provided.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) return res.status(403).json({ error: 'CSRF token ไม่ถูกต้อง กรุณาโหลดหน้าใหม่' });
  next();
}
app.use('/api', (req,res,next) => { if (req.path === '/csrf' || req.path === '/auth/login') return next(); csrf(req,res,next); });
const validate = (req,res,next) => { const errors = validationResult(req); if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg, details: errors.array() }); next(); };
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
const minutes = value => { const match = /^(\d{2}):(\d{2})$/.exec(String(value)); return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? Number(match[1]) * 60 + Number(match[2]) : NaN; };
const bangkokDate = () => Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
const todayInBangkok = () => { const parts=bangkokDate(); return `${parts.year}-${parts.month}-${parts.day}`; };
function notify({ userId = null, role = 'user', title, message, type = 'info' }) {
  db.prepare('INSERT INTO notifications(user_id,role_target,title,message,type) VALUES(?,?,?,?,?)').run(userId, role, title, message, type);
}
function overlap(roomId,date,start,end,excludeId) {
  return db.prepare(`SELECT id FROM bookings WHERE room_id=? AND date=? AND status IN ('รออนุมัติ','อนุมัติแล้ว') AND (? IS NULL OR id<>?) AND start_time < ? AND end_time > ? LIMIT 1`)
    .get(roomId,date,excludeId ?? null,excludeId ?? null,end,start);
}

app.get('/api/csrf', (req,res) => { req.session.csrfToken ||= crypto.randomBytes(32).toString('hex'); res.json({ csrfToken: req.session.csrfToken }); });
app.post('/api/auth/login', csrf, [body('email').isEmail().withMessage('กรุณากรอกอีเมลให้ถูกต้อง'), body('password').isString().isLength({ min: 8, max: 200 }).withMessage('รหัสผ่านไม่ถูกต้อง')], validate, asyncRoute(async (req,res) => {
  const user = db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE AND active=1').get(req.body.email.trim());
  const bcrypt = require('bcryptjs');
  if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  await new Promise((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));
  req.session.user = { id: user.id };
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.json({ user: publicUser(user), csrfToken: req.session.csrfToken });
}));
app.post('/api/auth/logout', requireAuth, (req,res) => req.session.destroy(err => { if (err) return res.status(500).json({ error: 'ออกจากระบบไม่สำเร็จ' }); res.clearCookie('ubru.sid', { httpOnly:true, sameSite:'strict', secure:isProduction }); res.json({ ok:true }); }));
app.get('/api/auth/me', (req,res) => res.json({ user: publicUser(currentUser(req)) }));

app.get('/api/rooms', requireAuth, (req,res) => res.json({ rooms: db.prepare('SELECT * FROM rooms WHERE active=1 ORDER BY id').all().map(roomView) }));
app.get('/api/availability', requireAuth, [query('date').custom(validDate).withMessage('วันที่ไม่ถูกต้อง'), query('start').optional().custom(v=>Number.isFinite(minutes(v))).withMessage('เวลาเริ่มไม่ถูกต้อง'), query('end').optional().custom(v=>Number.isFinite(minutes(v))).withMessage('เวลาสิ้นสุดไม่ถูกต้อง'), query('roomId').optional().isInt({min:1})], validate, (req,res) => {
  const rows = db.prepare(`${roomSelect} WHERE b.date=? AND b.status IN ('รออนุมัติ','อนุมัติแล้ว') ORDER BY b.start_time`).all(req.query.date);
  const records = rows.filter(row => (!req.query.roomId || row.room_id === Number(req.query.roomId)) && (!req.query.start || !req.query.end || (row.start_time < req.query.end && row.end_time > req.query.start))).map(row=>({id:row.id,roomId:row.room_id,date:row.date,startTime:row.start_time,endTime:row.end_time,status:row.status,roomName:row.room_name}));
  res.json({ bookings: records });
});
app.get('/api/calendar', requireAuth, [query('from').custom(validDate),query('to').custom(validDate)], validate, (req,res) => {
  const rows=db.prepare(`${roomSelect} WHERE b.date BETWEEN ? AND ? AND b.status IN ('รออนุมัติ','อนุมัติแล้ว') ORDER BY b.date,b.start_time`).all(req.query.from,req.query.to);
  res.json({bookings:rows.map(row=>({id:row.id,roomId:row.room_id,date:row.date,startTime:row.start_time,endTime:row.end_time,status:row.status,...(req.user.role==='admin'||row.user_id===req.user.id?{name:row.name,purpose:row.purpose,equipment:JSON.parse(row.equipment||'[]')}:{} )}))});
});
app.get('/api/bookings', requireAuth, (req,res) => {
  const all = req.user.role === 'admin' && req.query.all === '1';
  const rows = all ? db.prepare(`${roomSelect} ORDER BY b.date DESC,b.start_time`).all() : db.prepare(`${roomSelect} WHERE b.user_id=? ORDER BY b.date DESC,b.start_time`).all(req.user.id);
  res.json({ bookings: rows.map(bookingView) });
});
app.post('/api/bookings', requireAuth, [body('roomId').isInt({min:1}), body('date').custom(validDate).withMessage('วันที่ไม่ถูกต้อง'), body('startTime').custom(v=>Number.isFinite(minutes(v))), body('endTime').custom(v=>Number.isFinite(minutes(v))), body('purpose').trim().isLength({min:2,max:500}), body('people').isInt({min:1,max:1000}), body('equipment').optional().isArray({max:30}), body('note').optional().isString().isLength({max:1000})], validate, (req,res) => {
  const result = db.transaction(() => {
    const roomRow = db.prepare('SELECT * FROM rooms WHERE id=? AND active=1').get(Number(req.body.roomId));
    if (!roomRow) throw Object.assign(new Error('ไม่พบห้องที่เลือก'),{status:404});
    const today=todayInBangkok();
    if(req.body.date<today)throw Object.assign(new Error('ไม่สามารถจองวันที่ผ่านมาแล้วได้'),{status:400});
    const start = req.body.startTime, end = req.body.endTime;
    if (minutes(end) <= minutes(start)) throw Object.assign(new Error('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น'),{status:400});
    if (Number(req.body.people) > roomRow.capacity) throw Object.assign(new Error('จำนวนผู้เข้าร่วมเกินความจุห้อง'),{status:400});
    if (overlap(roomRow.id,req.body.date,start,end)) throw Object.assign(new Error('ช่วงเวลานี้มีการจองแล้ว กรุณาเลือกเวลาอื่น'),{status:409});
    const status = roomRow.approval_required ? 'รออนุมัติ' : 'อนุมัติแล้ว';
    const user = req.user;
    const info = db.prepare(`INSERT INTO bookings(user_id,room_id,name,code,department,purpose,people,date,start_time,end_time,equipment,note,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(user.id,roomRow.id,user.name,user.code,user.department,req.body.purpose.trim(),Number(req.body.people),req.body.date,start,end,JSON.stringify(req.body.equipment||[]),String(req.body.note||''),status);
    const booking = db.prepare(`${roomSelect} WHERE b.id=?`).get(info.lastInsertRowid);
    if (status === 'รออนุมัติ') notify({role:'admin',title:'มีคำขอจองห้องใหม่',message:`${user.name} ขอจอง ${roomRow.name} วันที่ ${req.body.date}`});
    else notify({userId:user.id,title:'การจองได้รับอนุมัติอัตโนมัติ',message:`จอง ${roomRow.name} วันที่ ${req.body.date} สำเร็จ`,type:'success'});
    return bookingView(booking);
  })();
  res.status(201).json({ booking: result });
});
app.post('/api/admin/bookings', requireAuth, requireAdmin, [body('roomId').isInt({min:1}),body('date').custom(validDate),body('startTime').custom(v=>Number.isFinite(minutes(v))),body('endTime').custom(v=>Number.isFinite(minutes(v))),body('name').trim().isLength({min:2,max:120}),body('code').trim().isLength({min:2,max:80}),body('purpose').optional().isString().isLength({max:500}),body('equipment').optional().isArray({max:30})], validate, (req,res) => {
  const result=db.transaction(()=>{
    const r=db.prepare('SELECT * FROM rooms WHERE id=? AND active=1').get(Number(req.body.roomId));if(!r)throw Object.assign(new Error('ไม่พบห้อง'),{status:404});
    if(req.body.date<todayInBangkok())throw Object.assign(new Error('ไม่สามารถจองวันที่ผ่านมาแล้วได้'),{status:400});
    if(minutes(req.body.endTime)<=minutes(req.body.startTime))throw Object.assign(new Error('ช่วงเวลาไม่ถูกต้อง'),{status:400});
    if(Number(req.body.people||1)>r.capacity)throw Object.assign(new Error('จำนวนผู้เข้าร่วมเกินความจุห้อง'),{status:400});
    if(overlap(r.id,req.body.date,req.body.startTime,req.body.endTime))throw Object.assign(new Error('ช่วงเวลานี้มีการจองแล้ว'),{status:409});
    const info=db.prepare("INSERT INTO bookings(user_id,room_id,name,code,department,purpose,people,date,start_time,end_time,equipment,status,booked_by) VALUES(NULL,?,?,?,?,?,1,?,?,?,?,'อนุมัติแล้ว','แอดมิน')")
      .run(r.id,req.body.name.trim(),req.body.code.trim(),'บุคลากร',req.body.purpose||'แอดมินจองให้บุคลากร',req.body.date,req.body.startTime,req.body.endTime,JSON.stringify(req.body.equipment||[]));
    return db.prepare(`${roomSelect} WHERE b.id=?`).get(info.lastInsertRowid);
  })();res.status(201).json({booking:bookingView(result)});
});
app.patch('/api/bookings/:id/cancel', requireAuth, [param('id').isInt({min:1})], validate, (req,res) => {
  const result = db.transaction(() => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(req.params.id));
    if (!booking) throw Object.assign(new Error('ไม่พบรายการจอง'),{status:404});
    if (req.user.role !== 'admin' && booking.user_id !== req.user.id) throw Object.assign(new Error('ไม่มีสิทธิ์แก้ไขรายการของผู้อื่น'),{status:403});
    if (booking.status === 'ยกเลิก' || booking.status === 'ปฏิเสธ') throw Object.assign(new Error('รายการนี้ไม่สามารถยกเลิกได้'),{status:400});
    db.prepare("UPDATE bookings SET status='ยกเลิก' WHERE id=?").run(booking.id);
    if (booking.user_id) notify({userId:booking.user_id,title:'ยกเลิกการจองแล้ว',message:`รายการจองวันที่ ${booking.date} ถูกยกเลิก`});
    return db.prepare(`${roomSelect} WHERE b.id=?`).get(booking.id);
  })();
  res.json({ booking: bookingView(result) });
});
app.patch('/api/bookings/:id/decision', requireAuth, requireAdmin, [param('id').isInt({min:1}), body('decision').isIn(['approve','reject'])], validate, (req,res) => {
  const result = db.transaction(() => {
    const booking = db.prepare('SELECT b.*,r.approval_required FROM bookings b JOIN rooms r ON r.id=b.room_id WHERE b.id=?').get(Number(req.params.id));
    if (!booking) throw Object.assign(new Error('ไม่พบรายการจอง'),{status:404});
    if (booking.status !== 'รออนุมัติ') throw Object.assign(new Error('รายการนี้ไม่ได้อยู่ระหว่างรออนุมัติ'),{status:409});
    if (!booking.approval_required) throw Object.assign(new Error('อนุมัติได้เฉพาะคำขอจากห้องพิเศษ'),{status:409});
    if (req.body.decision === 'approve' && overlap(booking.room_id,booking.date,booking.start_time,booking.end_time,booking.id)) throw Object.assign(new Error('ช่วงเวลานี้ชนกับรายการจองอื่น ไม่สามารถอนุมัติได้'),{status:409});
    const status = req.body.decision === 'approve' ? 'อนุมัติแล้ว' : 'ปฏิเสธ';
    db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status,booking.id);
    if (booking.user_id) notify({userId:booking.user_id,title:status === 'อนุมัติแล้ว'?'การจองได้รับอนุมัติ':'คำขอจองถูกปฏิเสธ',message:`รายการจองวันที่ ${booking.date} ${status}`,type:status === 'อนุมัติแล้ว'?'success':'warning'});
    return db.prepare(`${roomSelect} WHERE b.id=?`).get(booking.id);
  })();
  res.json({ booking: bookingView(result) });
});

app.post('/api/issues', requireAuth, [body('roomId').isInt({min:1}), body('type').trim().isLength({min:2,max:100}), body('priority').isIn(['ปกติ','เร่งด่วน','เร่งด่วนมาก']), body('detail').trim().isLength({min:5,max:2000})], validate, (req,res) => {
  if(!db.prepare('SELECT id FROM rooms WHERE id=? AND active=1').get(Number(req.body.roomId)))return res.status(400).json({error:'ไม่พบห้องที่เลือก'});
  const info = db.prepare('INSERT INTO issue_reports(user_id,room_id,type,priority,detail) VALUES(?,?,?,?,?)').run(req.user.id,Number(req.body.roomId),req.body.type.trim(),req.body.priority,req.body.detail.trim());
  notify({role:'admin',title:'มีรายงานปัญหาห้อง',message:`${req.user.name} แจ้ง${req.body.type} (${req.body.priority})`});
  res.status(201).json({ issue: db.prepare('SELECT * FROM issue_reports WHERE id=?').get(info.lastInsertRowid) });
});
app.get('/api/issues', requireAuth, (req,res) => {
  const rows = req.user.role==='admin' ? db.prepare('SELECT i.*,u.name AS user_name,r.name AS room_name FROM issue_reports i JOIN users u ON u.id=i.user_id JOIN rooms r ON r.id=i.room_id ORDER BY i.created_at DESC').all() : db.prepare('SELECT i.*,r.name AS room_name FROM issue_reports i JOIN rooms r ON r.id=i.room_id WHERE i.user_id=? ORDER BY i.created_at DESC').all(req.user.id);
  res.json({ issues: rows });
});
app.patch('/api/issues/:id', requireAuth, requireAdmin, [param('id').isInt({min:1}), body('status').isIn(['รอตรวจสอบ','กำลังดำเนินการ','แก้ไขแล้ว','ปิดเรื่อง'])], validate, (req,res) => {
  const issue = db.prepare('SELECT * FROM issue_reports WHERE id=?').get(Number(req.params.id));
  if (!issue) return res.status(404).json({error:'ไม่พบรายงานปัญหา'});
  db.prepare('UPDATE issue_reports SET status=? WHERE id=?').run(req.body.status,issue.id);
  notify({userId:issue.user_id,title:'อัปเดตการแจ้งปัญหา',message:`สถานะรายงานปัญหาเปลี่ยนเป็น ${req.body.status}`});
  res.json({ok:true});
});

app.get('/api/notifications', requireAuth, (req,res) => {
  const rows = req.user.role==='admin' ? db.prepare("SELECT * FROM notifications WHERE role_target IN ('admin','all') OR user_id=? ORDER BY created_at DESC").all(req.user.id) : db.prepare("SELECT * FROM notifications WHERE user_id=? OR role_target='all' ORDER BY created_at DESC").all(req.user.id);
  res.json({ notifications: rows });
});
app.patch('/api/notifications/read-all', requireAuth, (req,res) => { db.prepare("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE (user_id=? OR (role_target=? AND ?='admin') OR role_target='all') AND read_at IS NULL").run(req.user.id,req.user.role,req.user.role); res.json({ok:true}); });
app.delete('/api/notifications', requireAuth, (req,res) => { if(req.user.role==='admin') db.prepare("DELETE FROM notifications WHERE user_id=? OR role_target='admin'").run(req.user.id); else db.prepare('DELETE FROM notifications WHERE user_id=?').run(req.user.id); res.json({ok:true}); });

app.get('/api/announcements', requireAuth, (req,res) => res.json({ announcements: db.prepare(`SELECT id,title,body,category,active,created_at FROM announcements ${req.user.role==='admin'?'':'WHERE active=1'} ORDER BY created_at DESC`).all() }));
app.post('/api/announcements', requireAuth, requireAdmin, [body('title').trim().isLength({min:2,max:150}),body('body').trim().isLength({min:2,max:2000}),body('category').optional().trim().isLength({max:50})], validate, (req,res) => {
  const info=db.prepare('INSERT INTO announcements(title,body,category,created_by) VALUES(?,?,?,?)').run(req.body.title.trim(),req.body.body.trim(),req.body.category||'ทั่วไป',req.user.id);
  notify({role:'all',title:'ประกาศใหม่',message:req.body.title.trim()});
  res.status(201).json({announcement:db.prepare('SELECT * FROM announcements WHERE id=?').get(info.lastInsertRowid)});
});
app.patch('/api/announcements/:id', requireAuth, requireAdmin, [param('id').isInt({min:1}),body('title').trim().isLength({min:2,max:150}),body('body').trim().isLength({min:2,max:2000}),body('category').optional().trim().isLength({max:50}),body('active').optional().isBoolean()], validate, (req,res) => {
  const info=db.prepare('UPDATE announcements SET title=?,body=?,category=?,active=? WHERE id=?').run(req.body.title.trim(),req.body.body.trim(),req.body.category||'ทั่วไป',req.body.active===false?0:1,Number(req.params.id));
  if(!info.changes)return res.status(404).json({error:'ไม่พบประกาศ'});res.json({ok:true});
});
app.delete('/api/announcements/:id', requireAuth, requireAdmin, [param('id').isInt({min:1})], validate, (req,res) => { const info=db.prepare('DELETE FROM announcements WHERE id=?').run(Number(req.params.id));res.status(info.changes?200:404).json(info.changes?{ok:true}:{error:'ไม่พบประกาศ'}); });

app.post('/api/rooms', requireAuth, requireAdmin, [body('name').trim().isLength({min:2,max:120}),body('type').trim().isLength({min:2,max:80}),body('building').trim().isLength({min:2,max:200}),body('capacity').isInt({min:1,max:10000}),body('features').optional().isArray({max:40}),body('img').optional().isString().isLength({max:1000}),body('approvalRequired').isBoolean()], validate, (req,res) => {
  const info=db.prepare('INSERT INTO rooms(name,type,building,capacity,img,features,approval_required) VALUES(?,?,?,?,?,?,?)').run(req.body.name.trim(),req.body.type.trim(),req.body.building.trim(),Number(req.body.capacity),String(req.body.img||''),JSON.stringify(req.body.features||[]),req.body.approvalRequired?1:0);
  res.status(201).json({room:roomView(db.prepare('SELECT * FROM rooms WHERE id=?').get(info.lastInsertRowid))});
});
app.put('/api/rooms/:id', requireAuth, requireAdmin, [param('id').isInt({min:1}),body('name').trim().isLength({min:2,max:120}),body('type').trim().isLength({min:2,max:80}),body('building').trim().isLength({min:2,max:200}),body('capacity').isInt({min:1,max:10000}),body('features').optional().isArray({max:40}),body('img').optional().isString().isLength({max:1000}),body('approvalRequired').isBoolean()], validate, (req,res) => {
  const info=db.prepare('UPDATE rooms SET name=?,type=?,building=?,capacity=?,img=?,features=?,approval_required=? WHERE id=?').run(req.body.name.trim(),req.body.type.trim(),req.body.building.trim(),Number(req.body.capacity),String(req.body.img||''),JSON.stringify(req.body.features||[]),req.body.approvalRequired?1:0,Number(req.params.id));
  if(!info.changes)return res.status(404).json({error:'ไม่พบห้อง'});res.json({room:roomView(db.prepare('SELECT * FROM rooms WHERE id=?').get(Number(req.params.id)))});
});
app.delete('/api/rooms/:id', requireAuth, requireAdmin, [param('id').isInt({min:1})], validate, (req,res) => {
  const room=db.prepare('SELECT id FROM rooms WHERE id=?').get(Number(req.params.id));if(!room)return res.status(404).json({error:'ไม่พบห้อง'});
  const future=db.prepare("SELECT 1 FROM bookings WHERE room_id=? AND status IN ('รออนุมัติ','อนุมัติแล้ว') AND date>=? LIMIT 1").get(room.id,todayInBangkok());if(future)return res.status(409).json({error:'ลบห้องไม่ได้เพราะมีรายการจองที่ยังใช้งานอยู่'});
  db.prepare('UPDATE rooms SET active=0 WHERE id=?').run(room.id);res.json({ok:true});
});

app.post('/api/users', requireAuth, requireAdmin, [
  body('email').trim().isEmail().normalizeEmail().withMessage('กรุณากรอกอีเมลให้ถูกต้อง'),
  body('password').isString().isLength({min:8,max:200}).withMessage('รหัสผ่านต้องมี 8-200 ตัวอักษร'),
  body('name').trim().isLength({min:2,max:120}).withMessage('กรุณากรอกชื่อ 2-120 ตัวอักษร'),
  body('code').optional({checkFalsy:true}).trim().isLength({max:80}),
  body('department').optional({checkFalsy:true}).trim().isLength({max:160})
], validate, asyncRoute(async (req,res) => {
  const email=req.body.email.trim().toLowerCase();
  if(db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(email))return res.status(409).json({error:'อีเมลนี้มีบัญชีในระบบแล้ว'});
  const bcrypt=require('bcryptjs');
  const passwordHash=await bcrypt.hash(req.body.password,12);
  try {
    const info=db.prepare("INSERT INTO users(email,password_hash,name,code,department,role) VALUES(?,?,?,?,?,'user')")
      .run(email,passwordHash,req.body.name.trim(),String(req.body.code||'').trim(),String(req.body.department||'').trim());
    res.status(201).json({user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid))});
  } catch(error) {
    if(error.code==='SQLITE_CONSTRAINT_UNIQUE')return res.status(409).json({error:'อีเมลนี้มีบัญชีในระบบแล้ว'});
    throw error;
  }
}));
app.get('/api/users', requireAuth, requireAdmin, (req,res) => res.json({users:db.prepare('SELECT id,email,name,code,department,role,active,created_at FROM users ORDER BY id').all()}));
app.patch('/api/users/:id', requireAuth, requireAdmin, [param('id').isInt({min:1}),body('role').optional().isIn(['user','admin']),body('active').optional().isBoolean()], validate, (req,res) => {
  const target=db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id));if(!target)return res.status(404).json({error:'ไม่พบผู้ใช้'});
  if(target.id===req.user.id && (req.body.role==='user'||req.body.active===false))return res.status(400).json({error:'ไม่สามารถลดสิทธิ์หรือปิดบัญชีของตัวเองได้'});
  if(target.role==='admin'&&(req.body.role==='user'||req.body.active===false)&&db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND active=1").get().count<=1)return res.status(400).json({error:'ระบบต้องมีผู้ดูแลที่ใช้งานได้อย่างน้อยหนึ่งบัญชี'});
  db.prepare('UPDATE users SET role=COALESCE(?,role),active=COALESCE(?,active) WHERE id=?').run(req.body.role||null,typeof req.body.active==='boolean'?(req.body.active?1:0):null,target.id);
  res.json({ok:true});
});
app.get('/api/reports', requireAuth, requireAdmin, (req,res) => {
  const totals=db.prepare("SELECT COUNT(*) total, SUM(status='รออนุมัติ') pending, SUM(status='อนุมัติแล้ว') approved, SUM(status='ยกเลิก') cancelled FROM bookings").get();
  const byRoom=db.prepare('SELECT r.id,r.name,COUNT(b.id) AS count FROM rooms r LEFT JOIN bookings b ON b.room_id=r.id GROUP BY r.id ORDER BY count DESC,r.name').all();
  const byMonth=db.prepare("SELECT substr(date,1,7) AS month,COUNT(*) AS count FROM bookings WHERE status IN ('อนุมัติแล้ว','รออนุมัติ') GROUP BY month ORDER BY month DESC LIMIT 12").all();
  res.json({totals,byRoom,byMonth,users:db.prepare('SELECT COUNT(*) AS count FROM users WHERE active=1').get().count,rooms:db.prepare('SELECT COUNT(*) AS count FROM rooms WHERE active=1').get().count,issues:db.prepare("SELECT COUNT(*) AS count FROM issue_reports WHERE status NOT IN ('แก้ไขแล้ว','ปิดเรื่อง')").get().count});
});
app.get('/api/admin/dashboard', requireAuth, requireAdmin, (req,res) => {
  res.json({rooms:db.prepare('SELECT COUNT(*) count FROM rooms WHERE active=1').get().count,bookingsToday:db.prepare("SELECT COUNT(*) count FROM bookings WHERE date=? AND status IN ('รออนุมัติ','อนุมัติแล้ว')").get(todayInBangkok()).count,pending:db.prepare("SELECT COUNT(*) count FROM bookings WHERE status='รออนุมัติ'").get().count,users:db.prepare('SELECT COUNT(*) count FROM users WHERE active=1').get().count});
});

app.use('/assets',express.static(path.join(__dirname,'assets'),{dotfiles:'deny',fallthrough:false}));
app.get(['/','/index.html'],(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.get('/styles.css',(req,res)=>res.sendFile(path.join(__dirname,'styles.css')));
app.get('/script.js',(req,res)=>res.sendFile(path.join(__dirname,'script.js')));
app.use((err,req,res,next)=>{ if((err.status||500)>=500)console.error(err); if(res.headersSent)return next(err); res.status(err.status||500).json({error:err.status?err.message:'เกิดข้อผิดพลาดในระบบ'}); });
const port=Number(process.env.PORT)||3000;
app.listen(port,()=>console.log(`UBRU room booking server listening on http://localhost:${port}`));
