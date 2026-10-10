# UBRU Innovation — Security Audit

วันที่ตรวจสอบ: 10 ตุลาคม 2026  
ขอบเขต: `ubru-main` และ `deploy-output/`  
โหมด: Static review และ safe test เท่านั้น ไม่ได้ Push หรือ Deploy

## 1. สรุปผล

ระบบเป็น Node.js/Express + SQLite มี Backend/API, Session, CSRF, สิทธิ์ User/Admin และ Docker/Docker Compose

สถานะสำหรับส่งงาน: **READY FOR DEPLOYMENT PACKAGE WITH DOCKER RUNTIME UNTESTED**  
สถานะสำหรับเปิด Production สาธารณะ: **NOT READY** จนกว่าจะตั้ง HTTPS, เปลี่ยน Secret, แยกฐานข้อมูลใหม่ และตรวจ Runtime จริง

ห้ามอัปโหลด `ubru-main` ทั้งโฟลเดอร์ เพราะมี `.env` และฐานข้อมูลจริง ให้ใช้ `deploy-output/ubru-innovation-deploy.zip` แทน

## 2. Technology Stack

- Node.js `>=22.13`, Express 4
- `express-session` พร้อม SQLite session store
- `bcryptjs` และ `express-validator`
- SQLite พร้อม WAL และ foreign keys
- Frontend HTML/CSS/JavaScript แบบ client-rendered
- Dockerfile `node:22-bookworm-slim`, Docker Compose และ named volume

## 3. ขอบเขตและข้อจำกัด

ตรวจ source, config, manifest/lockfile, API routes, database, frontend, ignore files และ ZIP contents ภายใน Project Root เท่านั้น

- ไม่ได้รัน Docker Build หรือ Start Container
- ไม่ได้ทำ external penetration test, HTTPS หรือ firewall test
- ไม่มี `.git` ใน workspace จึงตรวจ Git tracked files/history ไม่ได้
- `npm audit` รอบนี้ไม่ได้รับ vulnerability report จาก registry จึงยังยืนยันผลล่าสุดไม่ได้
- Safe smoke test เต็มชุดเปิด local socket ใน execution sandbox ไม่ได้ จึงไม่อ้างว่า runtime ผ่าน

## 4. Findings by Severity

### HIGH — ต้นฉบับมี Secret และฐานข้อมูลจริง

พบ `.env` ที่มี `SESSION_SECRET` และพบ `data/ubru.sqlite`, `ubru.sqlite-shm`, `ubru.sqlite-wal` ซึ่งอาจมีข้อมูลผู้ใช้ การจอง และ session

ผลกระทบ: หากอัปโหลด `ubru-main` ผ่านเว็บหรือ Git โดยตรง อาจเผยแพร่ Secret และข้อมูลจริงได้ แม้ `.gitignore`/`.dockerignore` จะช่วยกรองเฉพาะ workflow ที่ใช้ไฟล์เหล่านั้น

คำแนะนำ: ใช้ ZIP ที่จัดแพ็กเกจแล้ว หรือสร้างสำเนาสำหรับอัปโหลดโดยตัด `.env`, `data/`, `node_modules/`, `.git/`, logs และ backup ออก ห้ามลบต้นฉบับเพื่อแก้ปัญหา

### MEDIUM — Dependency audit ล่าสุดยังยืนยันไม่ได้

`npm ls --omit=dev --depth=0` ผ่าน และ manifest/lockfile parse ได้ แต่ `npm audit --omit=dev` ไม่ได้รับผลจาก registry ในสภาพแวดล้อมนี้

คำแนะนำ: รันบนเครื่องที่เข้าถึง registry ได้ และแก้เฉพาะรายการที่ยืนยันแล้ว ห้ามใช้ `npm audit fix --force` อัตโนมัติ

### MEDIUM — ไม่มี TLS ใน Compose

Compose เปิด `3000:3000` และตั้ง `HOST=0.0.0.0` ถูกต้องสำหรับ Docker แต่การเข้าถึงตรงยังเป็น HTTP

คำแนะนำ: ใช้ reverse proxy + HTTPS + firewall หากเปิดสาธารณะ และอย่าเปิดระบบ TEST ตรงสู่อินเทอร์เน็ต

### LOW — Login rate limit เป็น in-memory

มี limit 20 ครั้งต่อ IP ต่อ 15 นาที แต่ reset เมื่อ restart และไม่แชร์ข้ามหลาย instance ควรใช้ shared store/WAF ใน Production จริง

### LOW — CSP ยังมี `unsafe-inline`

Frontend ใช้ inline event handlers จึงต้องอนุญาต `unsafe-inline` ซึ่งลดความเข้มงวดของ XSS protection ควรย้ายไป event listeners และใช้ nonce/hash ภายหลัง โดยทดสอบ UI ซ้ำ

### INFORMATIONAL — รูปภาพอาจเป็นข้อมูลส่วนบุคคล

พบรูป `advisor.webp` และ `member-*.webp` รวม 6 ไฟล์ใน `assets/` ไม่ได้ลบหรือแก้ไข ควรตรวจ consent ก่อนเผยแพร่สาธารณะ

### INFORMATIONAL — ไม่มีระบบอัปโหลดไฟล์

ไม่พบ multipart upload หรือ endpoint รับไฟล์ หัวข้อ File Upload Security จึงไม่เกี่ยวข้องกับระบบปัจจุบัน

## 5. Secrets and Repository

- `.env`/`.env.example` มีตัวแปรหลักครบ
- ZIP ใช้ Secret test ที่สร้างใหม่และไม่ใช้ค่า source เดิม
- ไม่พบรูปแบบ API key, private key หรือ token ที่รู้จักใน source/config ที่ตรวจ
- `.gitignore` กรอง `node_modules/`, `data/`, `.env`, logs
- `.dockerignore` กรอง `.env`, `data/`, `node_modules/`, `.git`, logs และไฟล์ชั่วคราว
- ZIP ไม่มี `.git`, `node_modules`, `data`, SQLite, logs หรือ backup
- ตรวจ Git history ไม่ได้เพราะไม่มี `.git`; หาก Secret เคยถูกเผยแพร่ที่อื่นให้ rotate/revoke

## 6. Authentication and Authorization

ผ่านจาก source:

- Login ใช้ `bcrypt.compare`; การสร้างผู้ใช้ใช้ `bcrypt.hash` cost 12
- Cookie มี `httpOnly`, `sameSite=strict`, `secure` เมื่อ production
- มี CSRF token แบบสุ่มและตรวจด้วย `timingSafeEqual`
- State-changing API ต้องมี CSRF token และ Login มี rate limit
- Role ตรวจจากฐานข้อมูลฝั่ง Server ไม่เชื่อถือ Browser Storage
- Route สำคัญใช้ `requireAuth`; route Admin ใช้ `requireAdmin`
- User อ่าน/ยกเลิก booking ของตัวเองเท่านั้น และไม่เห็นรายละเอียด booking ของผู้อื่น
- Issue status, rooms, users, reports และ announcements ฝั่ง Admin ถูกป้องกัน

## 7. Booking Business Logic

ตรวจพบการตรวจวันที่ย้อนหลัง, เวลาเริ่ม/สิ้นสุด, capacity, booking ซ้อน, approval ของห้องพิเศษ, overlap ซ้ำตอน Admin approve, สิทธิ์ยกเลิก และข้อจำกัดยกเลิกล่วงหน้า 24 ชั่วโมง

## 8. Frontend Security

- มี `esc()` สำหรับ encode HTML จำนวนมาก
- `safeImageUrl` จำกัดรูปเป็น same-origin หรือ HTTPS
- ไม่พบ `eval`, `new Function` หรือ `document.write`
- มี CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` และ `Permissions-Policy`
- ยังมี `innerHTML`, inline handlers และ resource จาก CDN/Unsplash/Google Fonts จึงควร harden เพิ่มก่อน Production

## 9. Backend and Database

- ใช้ prepared statements/parameter binding ใน query รับ input หลัก
- `DATABASE_FILE` รองรับ environment variable และ Docker ใช้ `/app/data/ubru.sqlite`
- SQLite เปิด foreign keys/WAL และ session เก็บใน SQLite
- JSON request จำกัด 32 KB
- Error response ไม่ส่ง stack trace ให้ client
- Docker ใช้ non-root `USER node`, explicit `COPY` และ named volume
- ไม่มี host/drive mount และไม่มี `COPY .`

## 10. Deployment Package

แพ็กเกจ `ubru-innovation-deploy.zip` ตรวจแล้วว่ามีไฟล์จำเป็น 21 รายการ, `HOST=0.0.0.0`, named volume `ubru_data:/app/data`, และไม่มี source database/Secret เดิม

ห้ามใช้ `.env` test ใน Production และห้ามโพสต์ ZIP ที่มี `.env` ต่อสาธารณะ

## 11. Tests Executed

- สำรวจไฟล์และ configuration ใน Project Root
- Parse `package.json`/`package-lock.json`
- `node --check server.js`
- `node --check script.js`
- `docker compose --env-file .env config --quiet`
- `npm ls --omit=dev --depth=0`
- ตรวจ routes, auth, database, Docker, ignore files และ ZIP contents
- สร้างสำเนาชั่วคราวและรัน `scripts/seed.js` กับฐานข้อมูลชั่วคราวสำเร็จ แล้วลบสำเนา

## 12. Tests Not Executed

- Docker Build/Start และ Docker runtime
- Smoke test เต็มชุด เพราะ sandbox ไม่อนุญาตเปิด local socket port ชั่วคราว
- Seed/Smoke กับ `data/ubru.sqlite` ต้นฉบับ
- HTTPS, firewall, reverse proxy และ external penetration test
- Dependency vulnerability count ล่าสุดจาก registry
- Git history

## 13. Fixes Applied

ไม่มีการแก้ source, ลบไฟล์, ลบฐานข้อมูล หรือเปลี่ยน business logic ใน Audit รอบนี้ สร้างเฉพาะรายงานนี้และใช้สำเนาชั่วคราวสำหรับ safe test ซึ่งถูกลบแล้ว

## 14. Remaining Risks Before Production

1. อย่าอัปโหลด `ubru-main` ทั้งโฟลเดอร์
2. เปลี่ยน/rotate Secret และสร้างฐานข้อมูลใหม่
3. ใช้บัญชีจริงที่ตั้งรหัสผ่านใหม่ ไม่ใช้บัญชี test
4. ใช้ HTTPS, reverse proxy และ firewall
5. ตรวจ consent รูปสมาชิก
6. รัน `npm audit --omit=dev` บนเครื่องที่เข้าถึง registry ได้
7. ทดสอบ Docker runtime ใน environment แยก
8. พิจารณา shared rate limit และ CSP nonce/hash

## 15. Final Status

**สำหรับส่งอาจารย์:** READY FOR DEPLOYMENT PACKAGE WITH DOCKER RUNTIME UNTESTED  
**สำหรับเปิด Production สาธารณะ:** NOT READY

ไฟล์ที่ควรส่ง/Deploy คือ `deploy-output/ubru-innovation-deploy.zip` ไม่ใช่ `ubru-main` ต้นฉบับทั้งโฟลเดอร์
