const base = process.env.TEST_URL || 'http://localhost:3000';
const db = require('../db');
function assert(condition, message) { if (!condition) throw new Error(message); }
class ApiClient {
  cookie = '';
  csrf = '';
  async request(path, method='GET', body) {
    const headers={Accept:'application/json'};
    if(this.cookie)headers.Cookie=this.cookie;
    if(body!==undefined)headers['Content-Type']='application/json';
    if(method!=='GET'&&this.csrf)headers['X-CSRF-Token']=this.csrf;
    const response=await fetch(`${base}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const setCookie=response.headers.get('set-cookie');if(setCookie)this.cookie=setCookie.split(';')[0];
    const data=await response.json().catch(()=>({}));return {status:response.status,data};
  }
  async login(email,password){const token=await this.request('/api/csrf');assert(token.status===200,'CSRF endpoint should respond');this.csrf=token.data.csrfToken;const result=await this.request('/api/auth/login','POST',{email,password});assert(result.status===200,`Login failed: ${result.data.error}`);this.csrf=result.data.csrfToken;return result.data.user;}
}
async function findSlot(client,roomId,avoidDates=[]){
  for(let attempt=0;attempt<500;attempt++){
    const offset=Math.floor(Math.random()*360),date=new Date(Date.UTC(2098,0,1)+offset*86400000).toISOString().slice(0,10),hour=8+Math.floor(Math.random()*9);
    if(avoidDates.includes(date))continue;
    const startTime=`${String(hour).padStart(2,'0')}:00`,endTime=`${String(hour+1).padStart(2,'0')}:00`;
    const check=await client.request(`/api/availability?date=${date}&roomId=${roomId}&start=${startTime}&end=${endTime}`);
    if(check.status===200&&!check.data.bookings.length)return {date,startTime,endTime};
  }
  throw new Error('Could not find an unused test booking slot');
}
async function run(){
  const user=new ApiClient(),admin=new ApiClient();
  assert((await user.login('user@ubru.test','UserTest2026!')).role==='user','User login role mismatch');
  if(process.env.CHECK_RESTART==='1'){
    const persisted=await user.request('/api/bookings');
    assert(persisted.data.bookings.some(b=>b.purpose==='Smoke test special booking'),'SQLite booking should survive a server restart');
  }
  const rooms=(await user.request('/api/rooms')).data.rooms;
  const general=rooms.find(r=>!r.approvalRequired),special=rooms.find(r=>r.approvalRequired);
  assert(general&&special,'Seed must include both general and special rooms');
  const generalSlot=await findSlot(user,general.id),specialSlot=await findSlot(user,special.id),rejectSlot=await findSlot(user,special.id,[specialSlot.date]),adminSlot=await findSlot(user,general.id,[generalSlot.date]);
  const bookingBody=(roomId,slot,purpose)=>({roomId,date:slot.date,startTime:slot.startTime,endTime:slot.endTime,purpose,people:2,equipment:['ไมโครโฟนไร้สาย'],note:'FOR TEST / EDUCATION ONLY'});
  const auto=await user.request('/api/bookings','POST',bookingBody(general.id,generalSlot,'Smoke test general booking'));
  assert(auto.status===201&&auto.data.booking.status==='อนุมัติแล้ว','General room should auto-approve');
  const collisionEnd=`${String(Number(generalSlot.startTime.slice(0,2))+1).padStart(2,'0')}:30`;
  const collision=await user.request('/api/bookings','POST',bookingBody(general.id,{...generalSlot,endTime:collisionEnd},'Smoke test overlapping booking'));
  assert(collision.status===409,'Overlapping booking must be rejected');
  const pending=await user.request('/api/bookings','POST',bookingBody(special.id,specialSlot,'Smoke test special booking'));
  assert(pending.status===201&&pending.data.booking.status==='รออนุมัติ','Special room should wait for approval');
  const calendar=await user.request(`/api/calendar?from=${specialSlot.date}&to=${specialSlot.date}`);
  assert(calendar.data.bookings.some(b=>b.id===pending.data.booking.id),'Calendar should return bookings from SQLite');
  const otherDetails=calendar.data.bookings.find(b=>b.id===pending.data.booking.id);
  assert(otherDetails.purpose==='Smoke test special booking','A user should see their own calendar details');
  const toReject=await user.request('/api/bookings','POST',bookingBody(special.id,rejectSlot,'Smoke test reject booking'));
  assert(toReject.status===201,'Second special booking should be created');
  assert((await admin.login('admin@ubru.test','AdminTest2026!')).role==='admin','Admin login role mismatch');
  assert((await admin.request('/api/admin/dashboard')).status===200,'Admin dashboard should load');
  assert((await admin.request('/api/reports')).status===200,'Admin reports should load');
  assert((await admin.request('/api/users')).status===200,'Admin should manage users');
  const createdUser=await admin.request('/api/users','POST',{name:'Smoke test account',email:'smoke-user@ubru.test',password:'SmokeUser2026!',code:'SMOKE-USER',department:'FOR TEST / EDUCATION ONLY'});
  assert(createdUser.status===201&&createdUser.data.user.role==='user','Admin should create a User account');
  const storedHash=db.prepare('SELECT password_hash FROM users WHERE id=?').get(createdUser.data.user.id).password_hash;
  assert(storedHash!=='SmokeUser2026!'&&await require('bcryptjs').compare('SmokeUser2026!',storedHash),'New user password must be stored as a bcrypt hash');
  const addedUserSession=new ApiClient();
  assert((await addedUserSession.login('smoke-user@ubru.test','SmokeUser2026!')).role==='user','Newly created User should be able to log in');
  assert((await addedUserSession.request('/api/auth/logout','POST',{})).status===200,'Newly created User should be able to log out');
  const adminBookings=await admin.request('/api/bookings?all=1');
  assert(adminBookings.status===200&&adminBookings.data.bookings.some(b=>b.id===pending.data.booking.id),'Admin should see pending booking');
  const generalPending=db.prepare("INSERT INTO bookings(user_id,room_id,name,code,department,purpose,people,date,start_time,end_time,status) VALUES(NULL,?,'Smoke test staff','TEST','FOR TEST / EDUCATION ONLY','Smoke test invalid general pending',1,?,? ,?,'รออนุมัติ')").run(general.id,adminSlot.date,adminSlot.startTime,adminSlot.endTime);
  assert((await admin.request(`/api/bookings/${generalPending.lastInsertRowid}/decision`,'PATCH',{decision:'approve'})).status===409,'Admin must not approve general-room bookings');
  db.prepare('DELETE FROM bookings WHERE id=?').run(generalPending.lastInsertRowid);
  const overlapRow=db.prepare("INSERT INTO bookings(user_id,room_id,name,code,department,purpose,people,date,start_time,end_time,status) VALUES(NULL,?,'Smoke test collision','TEST','FOR TEST / EDUCATION ONLY','Smoke test injected collision',1,?,?,?,'อนุมัติแล้ว')").run(special.id,specialSlot.date,specialSlot.startTime,specialSlot.endTime);
  assert((await admin.request(`/api/bookings/${pending.data.booking.id}/decision`,'PATCH',{decision:'approve'})).status===409,'Admin approval must recheck overlapping bookings');
  db.prepare('DELETE FROM bookings WHERE id=?').run(overlapRow.lastInsertRowid);
  assert((await admin.request(`/api/bookings/${pending.data.booking.id}/decision`,'PATCH',{decision:'approve'})).status===200,'Admin approval failed');
  assert((await admin.request(`/api/bookings/${toReject.data.booking.id}/decision`,'PATCH',{decision:'reject'})).status===200,'Admin rejection failed');
  const issue=await user.request('/api/issues','POST',{roomId:general.id,type:'โปรเจคเตอร์',priority:'เร่งด่วน',detail:'Smoke test report for equipment'});
  assert(issue.status===201,'User issue report should be saved');
  assert((await admin.request(`/api/issues/${issue.data.issue.id}`,'PATCH',{status:'กำลังดำเนินการ'})).status===200,'Admin should manage issue status');
  const announcement=await admin.request('/api/announcements','POST',{category:'ทดสอบ',title:'Smoke test notice',body:'FOR TEST / EDUCATION ONLY'});
  assert(announcement.status===201,'Admin should publish announcement');
  assert((await user.request('/api/announcements')).data.announcements.some(a=>a.id===announcement.data.announcement.id),'User should see database announcement');
  assert((await admin.request(`/api/announcements/${announcement.data.announcement.id}`,'PATCH',{category:'ทดสอบ',title:'Smoke test notice edited',body:'FOR TEST / EDUCATION ONLY',active:true})).status===200,'Admin should edit announcement');
  const testRoom=await admin.request('/api/rooms','POST',{name:'Smoke test room',type:'ห้องทดสอบ',building:'FOR TEST / EDUCATION ONLY',capacity:4,features:['ไมโครโฟน'],approvalRequired:false,img:''});
  assert(testRoom.status===201,'Admin should create room');
  assert((await admin.request(`/api/rooms/${testRoom.data.room.id}`,'PUT',{name:'Smoke test room edited',type:'ห้องทดสอบ',building:'FOR TEST / EDUCATION ONLY',capacity:5,features:[],approvalRequired:true,img:''})).status===200,'Admin should edit room');
  assert((await admin.request(`/api/rooms/${testRoom.data.room.id}`,'DELETE')).status===200,'Admin should delete room');
  assert((await admin.request(`/api/announcements/${announcement.data.announcement.id}`,'DELETE')).status===200,'Admin should delete announcement');
  const notices=await user.request('/api/notifications');
  assert(notices.data.notifications.some(n=>n.message.includes(specialSlot.date)),'User should receive booking notifications');
  assert(!notices.data.notifications.some(n=>n.title==='มีรายงานปัญหาห้อง'),'User must not receive admin-only issue notifications');
  assert((await admin.request('/api/notifications')).data.notifications.some(n=>n.title==='มีรายงานปัญหาห้อง'),'Admin should receive user issue notifications');
  const csrfBlocked=await fetch(`${base}/api/notifications`,{method:'DELETE',headers:{Cookie:user.cookie}});
  assert(csrfBlocked.status===403,'State-changing requests must require CSRF token');
  assert((await user.request(`/api/bookings/${auto.data.booking.id}/cancel`,'PATCH',{})).status===200,'User should be able to cancel own booking');
  const adminBooked=await admin.request('/api/admin/bookings','POST',{roomId:general.id,date:adminSlot.date,startTime:adminSlot.startTime,endTime:adminSlot.endTime,name:'Smoke test staff',code:'TEST-STAFF',equipment:[]});
  assert(adminBooked.status===201,'Admin should book for staff');
  const privateCalendar=await user.request(`/api/calendar?from=${adminSlot.date}&to=${adminSlot.date}`);
  const otherBooking=privateCalendar.data.bookings.find(b=>b.id===adminBooked.data.booking.id);
  assert(otherBooking&&!('name' in otherBooking)&&!('purpose' in otherBooking)&&!('equipment' in otherBooking),'A user calendar must not expose other users\' booking details');
  assert((await user.request(`/api/bookings/${adminBooked.data.booking.id}/cancel`,'PATCH',{})).status===403,'User must not change another person\'s booking');
  assert((await user.request('/api/users')).status===403,'User must not access admin user management');
  assert((await user.request('/api/auth/logout','POST',{})).status===200,'User should log out');
  assert((await user.request('/api/auth/me')).data.user===null,'Logged-out session should no longer authenticate');
  assert((await admin.request('/api/auth/logout','POST',{})).status===200,'Admin should log out');
  assert((await admin.request('/api/auth/me')).data.user===null,'Logged-out admin session should no longer authenticate');
  if(process.env.KEEP_TEST_DATA!=='1'){
    db.transaction(()=>{
      const testBookings=db.prepare("SELECT date FROM bookings WHERE purpose LIKE 'Smoke test %'").all();
      for(const row of testBookings)db.prepare("DELETE FROM notifications WHERE message LIKE '%' || ? || '%'").run(row.date);
      db.prepare("DELETE FROM bookings WHERE purpose LIKE 'Smoke test %'").run();
      db.prepare("DELETE FROM issue_reports WHERE detail='Smoke test report for equipment'").run();
      db.prepare("DELETE FROM notifications WHERE (title='มีรายงานปัญหาห้อง' AND message LIKE '%ผู้ใช้ทดสอบ แจ้งโปรเจคเตอร์%') OR (title='อัปเดตการแจ้งปัญหา' AND message LIKE '%กำลังดำเนินการ%') OR (title='ประกาศใหม่' AND message='Smoke test notice')").run();
      db.prepare("DELETE FROM announcements WHERE title LIKE 'Smoke test notice%'").run();
      db.prepare("DELETE FROM rooms WHERE name LIKE 'Smoke test room%' AND active=0").run();
      db.prepare("DELETE FROM users WHERE email='smoke-user@ubru.test' AND code='SMOKE-USER'").run();
    })();
  }
  console.log(JSON.stringify({ok:true,persistenceBookingId:pending.data.booking.id,adminBookingId:adminBooked.data.booking.id},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
