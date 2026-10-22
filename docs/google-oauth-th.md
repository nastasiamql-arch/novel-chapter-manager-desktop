# วิธีแก้ 400: redirect_uri_mismatch (Google Docs) — Novel Chapter Manager Desktop

สำหรับโปรแกรม Desktop v2.0.0-alpha.2 เป็นต้นไป

## ทำไมถึงเกิด

Google ปฏิเสธ `redirect_uri` หากไม่ตรงกับประเภท OAuth Client ID.
โปรแกรม Desktop ใช้ browser + loopback callback เช่น `http://127.0.0.1:<port>`
และต้องใช้ OAuth Client ID ประเภท **Desktop app** ไม่ใช่ **Web application**.
Google อนุญาตให้แอป Desktop ใช้พอร์ตที่ระบบสุ่มให้ โดยไม่ต้องเพิ่ม Redirect URI เอง.

## ตั้งค่าทีละขั้น

1. เปิด https://console.cloud.google.com/apis/credentials แล้วเลือก Google Cloud Project ที่จะใช้กับแอป
2. ที่ **Google Auth Platform > Clients** กด **Create client** แล้วเลือก **Desktop app**
3. ตั้งชื่อ เช่น `Novel Chapter Manager Desktop` และสร้าง Client
4. คัดลอก **Client ID** ซึ่งลงท้าย `.apps.googleusercontent.com` เท่านั้น (ไม่ต้องคัดลอก Client Secret)
5. ตรวจว่าเปิด **Google Docs API** แล้ว และกำหนด **Audience / Test users** ให้บัญชีที่จะใช้ หากโครงการยังอยู่ใน Testing
6. เปิดโปรแกรม v2.0.0-alpha.2 หรือใหม่กว่า ไปหน้า Google Docs เปลี่ยน Client ID เดิมเป็น Desktop Client ID แล้วกดเชื่อมใหม่

**อย่า** เพิ่ม `/oauth/callback` ต่อท้าย Redirect URI และอย่าพยายามกำหนดพอร์ต localhost คงที่ เพราะโปรแกรมใช้พอร์ตสุ่มทุกครั้ง

## ถ้ายังพบข้อผิดพลาด

- ตรวจว่า Client ID ที่นำมาใช้เป็นชนิด **Desktop app** จริง ไม่ใช่ Web application
- ตรวจว่ารันโปรแกรมรุ่นใหม่ ไม่ใช่ตัวติดตั้ง v2.0.0-alpha.1
- หากแก้ Google Cloud เพิ่งเสร็จ บางการตั้งค่าอาจใช้เวลาจึงมีผล
- หากข้อผิดพลาดเปลี่ยนเป็น `access_denied` ตรวจ Audience / Test users และสิทธิ์ API ตามข้อความของ Google
- ในหน้า Google ให้เปิด **รายละเอียดข้อผิดพลาด** เพื่อตรวจค่า `redirect_uri` โดย **อย่าส่ง authorization code, access token หรือ client secret ให้ผู้อื่น**

## ขอบเขตของการทดสอบ

โปรแกรมมีชุดทดสอบอัตโนมัติสำหรับ redirect URI, PKCE, state และการรับ callback ภายในเครื่อง
การลงชื่อเข้าใช้จริงต้องใช้บัญชี Google และการกำหนดสิทธิ์ของเจ้าของ Google Cloud Project

อ้างอิง: https://developers.google.com/identity/protocols/oauth2/native-app
