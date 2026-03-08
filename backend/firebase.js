// firebase.js
const admin = require("firebase-admin");
const serviceAccount = require("./med-reminder-43a40-firebase-adminsdk-fbsvc-3f610a323f.json"); // ชื่อไฟล์ที่ดาวน์โหลดมา

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;