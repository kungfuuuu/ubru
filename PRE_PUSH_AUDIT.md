# Pre-Push Security Audit — UBRU Innovation

วันที่ตรวจ: 2026-10-10  
ขอบเขต: `C:\Users\Justw\Downloads\ubru-main` เท่านั้น

## สรุปสถานะ

สถานะปัจจุบัน: **NOT READY TO PUSH — ต้องตรวจรายการด้านล่างก่อน**

ยังไม่มีการ Push, Commit, ลบฐานข้อมูล หรือแก้ไข Source Code จากการตรวจครั้งนี้

สาเหตุหลักที่ยังไม่ควรกด Push:

1. โฟลเดอร์นี้ยังไม่ใช่ Git repository (`.git` ไม่มีอยู่) จึงยังไม่มี Stage และ Git History ให้ตรวจ
2. มี `.env` และฐานข้อมูล SQLite จริงอยู่ในเครื่อง แม้ `.gitignore` จะ ignore ไว้แล้ว ต้องตรวจ `git status` อีกครั้งหลังสร้าง/เชื่อม repository
3. มีบัญชีและรหัสผ่านสำหรับ TEST hardcode ใน `scripts/seed.js` และ `scripts/smoke-test.js` ซึ่งไม่ใช่ Secret จริงตามบริบทการศึกษา แต่ห้ามใช้กับ Production
4. `npm audit` ตรวจไม่สำเร็จเพราะเครื่องมือเข้าถึง `registry.npmjs.org` ไม่ได้ จึงยังยืนยันช่องโหว่ของ Dependencies จากฐานข้อมูลออนไลน์ไม่ได้
5. รูปสมาชิกใน `assets/` อาจเป็นข้อมูลบุคคล ต้องยืนยันสิทธิ์ในการเผยแพร่ก่อนใช้ repository แบบ Public

## 1. ไฟล์และโฟลเดอร์ที่ตรวจสอบ

- `server.js`
- `db.js`
- `index.html`
- `script.js`
- `styles.css`
- `assets/`
- `scripts/seed.js`
- `scripts/smoke-test.js`
- `package.json`
- `package-lock.json`
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `.gitignore`
- `.env` และ `.env.example` — ตรวจเฉพาะชื่อ/รูปแบบ/ความยาวค่า ไม่แสดงค่าจริง
- `DEPLOY.md`
- `SECURITY_AUDIT.md`
- `data/` — ตรวจพบฐานข้อมูลและไฟล์ WAL/SHM แต่ไม่ได้เปิดเผยข้อมูลในรายงาน
- `deploy-output/ubru-innovation-deploy.zip` — ตรวจรายชื่อไฟล์ภายใน

## 2. ผลตรวจสอบ Git

| รายการ | สถานะ | หลักฐาน |
|---|---|---|
| Git repository | ต้องแก้ไขก่อน Push | `git status` แจ้งว่าไม่ใช่ Git repository; ไม่พบ `.git` |
| Staged files | ต้องตรวจสอบเพิ่มเติม | ยังไม่มี repository จึงไม่มี Stage |
| Tracked files | ต้องตรวจสอบเพิ่มเติม | ยังไม่มี repository จึงใช้ `git ls-files` ไม่ได้ |
| Added/modified/deleted files | ต้องตรวจสอบเพิ่มเติม | ยังไม่มี Git baseline ให้เปรียบเทียบ |
| Git history | ต้องตรวจสอบเพิ่มเติม | ยังไม่มี `.git` ใน Project Root |
| `.gitignore` | ผ่านบางส่วน | Ignore `node_modules/`, `data/`, `.env`, `npm-debug.log*` |
| ZIP ใน `deploy-output/` | ต้องแก้ไขก่อน Push | ไม่ได้ถูก ignore; อาจถูก `git add .` เพิ่มโดยไม่ตั้งใจ |

ข้อสรุป: ยังไม่มีการ Push ใด ๆ จากโฟลเดอร์นี้ และไม่สามารถยืนยันประวัติของ repository เดิมได้จาก Project Root ปัจจุบัน

## 3. ข้อมูลลับและข้อมูลที่ไม่ควรขึ้น GitHub

### ผ่าน / ความเสี่ยงถูกลดแล้ว

- `.env` มีตัวแปร `NODE_ENV`, `PORT`, `SESSION_SECRET`, `DATABASE_FILE` และถูก ignore โดย `.gitignore`
- `.dockerignore` กรอง `.env`, `data/`, `.git`, log และ ZIP ออกจาก Docker Build Context
- `Dockerfile` ไม่ได้ `COPY .env` หรือ `data/` เข้า Image
- ไม่พบหลักฐานของ Private Key หรือ API Key ที่เป็นรูปแบบชัดเจนจากการสแกนแบบไม่แสดงค่า
- ไม่พบไฟล์ขนาดใหญ่เกิน 5 MB นอก `node_modules/`

### ต้องแก้ไข/ตรวจสอบก่อน Push

- ห้าม `git add -f .env` หรือ `git add -f data/`
- อย่าใช้ `git add .` จนกว่าจะตรวจรายการ staged เพราะ `deploy-output/` ไม่ได้อยู่ใน `.gitignore`
- แนะนำให้เก็บ `ubru-innovation-deploy.zip` ไว้เป็นไฟล์ส่งงานแยกจาก Source Repository หรือเพิ่ม `deploy-output/` ใน `.gitignore` หากไม่ต้องการเก็บ ZIP ใน GitHub
- `scripts/seed.js` และ `scripts/smoke-test.js` มี credentials สำหรับบัญชีทดสอบแบบ hardcode; เป็นข้อมูล TEST แต่ห้ามใช้ค่าดังกล่าวใน Production และควรทำ repository เป็น Private หากอาจารย์ไม่ได้กำหนดให้ Public
- `DEPLOY.md` มีคำแนะนำบัญชีทดสอบตามที่ระบบต้องใช้ จัดเป็นข้อมูลทดสอบ ไม่ใช่ Production credential

### ฐานข้อมูลและ Backup

ตรวจพบไฟล์ต่อไปนี้ในเครื่อง:

- `data/ubru.sqlite`
- `data/ubru.sqlite-shm`
- `data/ubru.sqlite-wal`

ไฟล์เหล่านี้อาจมีบัญชีทดสอบ ประวัติการจอง การแจ้งปัญหา และ Session จึงต้องไม่ Push และไม่ใส่ใน ZIP สำหรับเผยแพร่ เว้นแต่มีเหตุผลและได้รับอนุญาตโดยชัดเจน

## 4. ผลตรวจ Application Security จาก Source Code

### ผ่าน / พบการป้องกันใน Source Code

- Authentication ตรวจ Session/Tab Session ก่อน API ที่ต้องเข้าสู่ระบบ
- Authorization ของ Admin ใช้ `requireAdmin` ฝั่ง Server ไม่ได้พึ่ง Frontend เพียงอย่างเดียว
- API สำคัญของ Admin เช่น users, rooms, reports, announcements, booking decision และ issue status มีการตรวจสิทธิ์ Admin
- ผู้ใช้ทั่วไปเห็นรายการจองของตนเองเป็นหลัก และ Calendar จำกัดรายละเอียดของรายการของผู้อื่น
- ใช้ `bcryptjs` hash password ด้วย cost factor 12 ตอนสร้างบัญชี
- มี CSRF token และบังคับกับคำขอที่เปลี่ยนแปลงข้อมูล รวมถึง Login
- มี Login rate limit ในหน่วยความจำ 20 ครั้งต่อ IP ภายใน 15 นาที
- SQL ส่วนใหญ่ใช้ Prepared Statement และมีการตรวจ input ด้วย `express-validator`
- การจองตรวจห้องที่ใช้งานได้ จำนวนคน วันที่ เวลา และเวลาซ้อนกันใน Transaction
- การอนุมัติจาก Admin ตรวจเวลาซ้อนกันซ้ำอีกครั้ง
- การยกเลิกตรวจเจ้าของรายการ/สิทธิ์ Admin และกฎล่วงหน้า 24 ชั่วโมง
- มี Security Headers หลัก ได้แก่ `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP และ HSTS เมื่อเป็น Production
- Static files จำกัดอยู่ที่ `assets/` และ route ของ HTML/CSS/JS ใช้ path ที่กำหนดตายตัว ไม่พบ route อ่าน path จากผู้ใช้โดยตรง
- Error response ฝั่งผู้ใช้ไม่ส่ง stack trace เมื่อเป็น 500

### ต้องเฝ้าระวัง / ความเสี่ยงคงเหลือ

| ระดับ | รายการ | หลักฐาน/ผลกระทบ |
|---|---|---|
| Medium | CSP ยังมี `'unsafe-inline'` ใน `script-src` และ `style-src` | ลดประสิทธิภาพของ CSP หากเกิด XSS ในอนาคต; ควรแยก inline script/style หรือใช้ nonce เมื่อมีเวลาปรับปรุง |
| Medium | Login rate limit เป็น in-memory และจำกัดตาม IP | รีเซ็ตเมื่อ Restart และไม่แชร์ข้ามหลาย instance; Production ควรใช้ reverse proxy/WAF หรือ store ที่แชร์กัน |
| Medium | มี test credentials ใน Source Code | ผู้ที่เข้าถึง repository จะทราบบัญชีทดสอบ; ใช้เฉพาะ TEST/EDUCATION และห้ามใช้ข้อมูลจริง |
| Low/Medium | `img` อนุญาต URL `https:` จากผู้ดูแล | ควรจำกัด allowlist ของ host หาก Production ไม่ต้องการให้โหลด resource จากโดเมนภายนอก |
| Low | มี `script.js` ส่วน UI ที่ใช้ `innerHTML` หลายจุด | มี helper `esc()` และ `safeImageUrl()` ในจุดสำคัญ แต่ควรทดสอบทุกหน้าด้วย payload XSS ก่อน Production |
| Low | ต้องยืนยันการตั้งค่า HTTPS และ Reverse Proxy จริง | Cookie `secure` และ HSTS ทำงานเมื่อ `NODE_ENV=production`; ต้องใช้ HTTPS จริงเมื่อเผยแพร่ |

ไม่พบหลักฐานจาก Source Code ว่าผู้ใช้ทั่วไปสามารถเรียก Admin API ได้โดยตรงโดยไม่ผ่าน `requireAdmin` แต่ยังไม่ได้ทำ Dynamic API test ครบทุก Endpoint ในรอบนี้

## 5. ตรวจสอบข้อมูลการจองและแจ้งปัญหา

- การจองใหม่ตรวจ overlap ใน Server และใช้ Transaction
- Admin approval ตรวจ overlap ซ้ำก่อนเปลี่ยนสถานะ
- User cancel ตรวจว่าเป็นเจ้าของรายการ หรือเป็น Admin
- User อ่าน `/api/bookings` ได้เฉพาะรายการของตน; Admin ใช้ `?all=1` ได้
- User อ่าน issue reports ได้เฉพาะของตน; Admin อ่านทั้งหมด และการเปลี่ยนสถานะเป็น Admin-only
- การเปลี่ยนสถานะแจ้งปัญหาเขียนลง SQLite และสร้าง Notification ให้ผู้แจ้ง
- Frontend มีการ escape ข้อมูลที่นำไปสร้าง HTML ในจุดสำคัญ แต่สิทธิ์ยังถูกบังคับซ้ำที่ Server

## 6. ผลตรวจ Build และ Test จริง

### ผ่าน

- `node --check server.js` — PASS
- `node --check db.js` — PASS
- `node --check script.js` — PASS
- `node --check scripts/seed.js` — PASS
- `node --check scripts/smoke-test.js` — PASS
- `package.json` — JSON parse PASS
- `package-lock.json` — Node JSON parse PASS
- ไม่มี `build` script ใน `package.json`

### ยังไม่ได้รันโดยตั้งใจ

- `scripts/smoke-test.js` **ไม่ได้รัน** เพราะ script ทำ INSERT/UPDATE/DELETE กับ SQLite และอาจสร้าง/ลบบัญชี รายการจอง ห้อง ประกาศ และ Notification หากรันกับ `data/ubru.sqlite` ต้นฉบับจะกระทบข้อมูลจริงใน Project
- `scripts/seed.js` **ไม่ได้รัน** เพราะแก้ไข/สร้างข้อมูลในฐานข้อมูล
- ไม่มี Docker Build หรือ Container ถูกสั่งจากการตรวจรอบนี้

### npm audit

- สั่ง `npm audit --omit=dev` แล้ว แต่ตรวจไม่สำเร็จจากเครือข่าย: `registry.npmjs.org` resolve ไม่ได้
- จึงยังไม่มีผลยืนยันจำนวนช่องโหว่จาก npm advisory database
- ห้ามตีความผลนี้ว่า Dependencies ปลอดภัย

## 7. รายการที่ยังไม่ได้ตรวจสอบ

- Git History เดิม เนื่องจากไม่มี `.git` ใน Project Root
- รายการ staged จริงก่อน Commit เนื่องจากยังไม่มี repository
- Runtime smoke test แบบ isolated copy ของฐานข้อมูล
- ผล `npm audit` จากเครือข่ายที่เข้าถึง npm registry ได้
- HTTPS, Reverse Proxy, Domain, Firewall และ Secret Manager ของ Hosting จริง
- Consent/สิทธิ์เผยแพร่รูปใน `assets/member-*.webp` และ `assets/advisor.webp`

## 8. สิ่งที่แก้ไข

ไม่มีการแก้ไข Source Code, Configuration, Database, Assets หรือ Git state จากการตรวจครั้งนี้  
สร้างเฉพาะไฟล์รายงานนี้: `PRE_PUSH_AUDIT.md`

## 9. สิ่งที่ควรทำก่อนกด Push

1. ตัดสินใจก่อนว่า repository จะเป็น Public หรือ Private
2. ตรวจสิทธิ์เผยแพร่รูปสมาชิกทั้งหมดใน `assets/`; ถ้าไม่มี consent ให้เปลี่ยนเป็นรูปที่ได้รับอนุญาตก่อนเผยแพร่
3. ตรวจให้แน่ใจว่า `.env`, `data/`, `node_modules/`, log และ ZIP ไม่อยู่ในรายการที่จะ Commit
4. ถ้าไม่ต้องการให้ ZIP อยู่ใน GitHub ให้เพิ่ม `deploy-output/` ใน `.gitignore` ก่อนสร้าง repository หรือ stage แบบเลือกไฟล์
5. สร้าง/เชื่อม Git repository แล้วตรวจ `git status`, `git diff --cached --name-status` และ `git ls-files` ก่อน Commit
6. ตรวจ Git History ของ repository จริงด้วย secret scanner หากมีประวัติเก่า
7. รัน `npm audit --omit=dev` ใหม่จากเครือข่ายที่เข้าถึง npm registry ได้
8. หากต้องการรัน Smoke Test ให้ใช้ฐานข้อมูลทดสอบแยกต่างหาก ไม่ใช่ `data/ubru.sqlite` ต้นฉบับ
9. Production ต้องสร้าง `SESSION_SECRET` ใหม่จาก Secret Manager และไม่ใช้ `.env`/บัญชี TEST ใน Production

## สถานะสุดท้าย

**NOT READY TO PUSH** จนกว่าจะตรวจรายการในหัวข้อ 9 โดยเฉพาะการตั้ง Git repository, staged file list, สิทธิ์รูปภาพ และการแยกข้อมูลทดสอบออกจาก Production

รายงานนี้ไม่ได้อ้างว่าระบบปลอดภัย 100% และไม่ได้ยืนยัน Runtime/Docker เนื่องจากยังไม่ได้ทดสอบในสภาพแวดล้อมดังกล่าว
