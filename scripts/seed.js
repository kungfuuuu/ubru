require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

const rooms = [
  {name:'ห้องประชุม 1',type:'ห้องประชุม',building:'อาคาร 51 คณะเกษตรศาสตร์ ชั้น 1',capacity:20,img:'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',features:['โปรเจคเตอร์ 4K','ไมโครโฟนไร้สาย 2 ตัว','ไวท์บอร์ด','ระบบเสียง Dolby'],approvalRequired:true},
  {name:'ห้องประชุม 2',type:'ห้องปฏิบัติการ',building:'อาคาร 50 คณะเกษตรศาสตร์ ชั้น 2',capacity:30,img:'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80',features:['โปรเจคเตอร์','คอมพิวเตอร์ 30 เครื่อง','เครื่องปรับอากาศ'],approvalRequired:false},
  {name:'ห้องประชุม 3',type:'ห้องเรียน',building:'อาคาร 51 คณะเกษตรศาสตร์ ชั้น 3',capacity:25,img:'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=900&q=80',features:['จอแสดงผล','ไวท์บอร์ด','Wi-Fi ความเร็วสูง'],approvalRequired:true},
  {name:'ห้องประชุม 4',type:'ห้องประชุม',building:'อาคาร 51 คณะเกษตรศาสตร์ ชั้น 4',capacity:40,img:'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=900&q=80',features:['โปรเจคเตอร์ 2 เครื่อง','ระบบเสียง','ไมโครโฟน'],approvalRequired:false}
];

async function seed() {
  const seedUser = db.prepare(`INSERT INTO users(email,password_hash,name,code,department,role) VALUES(?,?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,name=excluded.name,role=excluded.role,active=1`);
  seedUser.run('user@ubru.test',await bcrypt.hash('UserTest2026!',12),'ผู้ใช้ทดสอบ','TEST-USER','FOR TEST / EDUCATION ONLY','user');
  seedUser.run('admin@ubru.test',await bcrypt.hash('AdminTest2026!',12),'ผู้ดูแลทดสอบ','TEST-ADMIN','FOR TEST / EDUCATION ONLY','admin');
  const count=db.prepare('SELECT COUNT(*) AS count FROM rooms').get().count;
  if (!count) {
    const insert=db.prepare('INSERT INTO rooms(name,type,building,capacity,img,features,approval_required) VALUES(?,?,?,?,?,?,?)');
    const insertAll=db.transaction(()=>rooms.forEach(r=>insert.run(r.name,r.type,r.building,r.capacity,r.img,JSON.stringify(r.features),r.approvalRequired?1:0)));
    insertAll();
  }
  if (!db.prepare('SELECT 1 FROM announcements LIMIT 1').get()) {
    const admin=db.prepare("SELECT id FROM users WHERE email='admin@ubru.test'").get();
    db.prepare('INSERT INTO announcements(title,body,category,created_by) VALUES(?,?,?,?)').run('ยินดีต้อนรับสู่ระบบจองห้อง','ระบบจองห้องสำหรับการทดสอบและการศึกษา สามารถทดลองค้นหาและจองห้องได้','ข่าวประชาสัมพันธ์',admin.id);
  }
  console.log('Seed complete. FOR TEST / EDUCATION ONLY');
  console.log('User: user@ubru.test / UserTest2026!');
  console.log('Admin: admin@ubru.test / AdminTest2026!');
  db.close();
}
seed().catch(error=>{console.error(error);process.exitCode=1;});
