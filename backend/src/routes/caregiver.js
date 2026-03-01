const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

/* ===============================
   Helper: calculate age
================================= */
function calculateAge(birthDate) {
  const today = new Date();
  const birth = new Date(birthDate);

  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/* ===============================
   Helper: format date YYYY-MM-DD
   (กัน timezone shift)
================================= */
function formatDateOnly(dateInput) {
  const d = new Date(dateInput);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/* ===============================
   CREATE ELDERLY
================================= */
router.post("/create-elderly", auth(["caregiver"]), async (req, res) => {
  try {
    const { name, phone, pin, birthDate, address, disease } = req.body;

    if (!name || !phone || !pin || !birthDate) {
      return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
    }

    // 🔎 เช็กเบอร์ซ้ำ
    const [dup] = await db.query(
      "SELECT id FROM users WHERE phone = ?",
      [phone]
    );

    if (dup.length > 0) {
      return res.status(409).json({
        message: "เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว",
      });
    }

    const password_hash = await bcrypt.hash(String(pin), 10);

    // 🔥 แปลง ISO → YYYY-MM-DD
    const formattedBirthDate = formatDateOnly(birthDate);

    // 1️⃣ สร้าง user ผู้สูงอายุ
    const [r] = await db.query(
      `
      INSERT INTO users (name, phone, email, password_hash, role)
      VALUES (?, ?, NULL, ?, 'elderly')
      `,
      [name, phone, password_hash]
    );

    const elderlyUserId = r.insertId;

    // 2️⃣ ผูก caregiver ↔ elderly
    await db.query(
      `
      INSERT INTO care_relationships (caregiver_user_id, elderly_user_id)
      VALUES (?, ?)
      `,
      [req.user.id, elderlyUserId]
    );

    // 3️⃣ เพิ่ม profile
    await db.query(
      `
      INSERT INTO elderly_profiles (user_id, birth_date, address, disease)
      VALUES (?, ?, ?, ?)
      `,
      [
        elderlyUserId,
        formattedBirthDate,
        address || null,
        disease || null,
      ]
    );

    res.json({ elderlyUserId });

  } catch (err) {
    console.error("CREATE ELDERLY ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   GET ELDERLY LIST
================================= */
router.get("/elderly", auth(["caregiver"]), async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT 
        u.id,
        u.name,
        u.phone,
        p.birth_date,
        p.address,
        p.disease
      FROM users u
      JOIN care_relationships c ON c.elderly_user_id = u.id
      LEFT JOIN elderly_profiles p ON p.user_id = u.id
      WHERE c.caregiver_user_id = ?
      ORDER BY u.name ASC
      `,
      [req.user.id]
    );

    const result = rows.map((item) => ({
      ...item,
      age: item.birth_date
        ? calculateAge(item.birth_date)
        : null,
    }));

    res.json({ items: result });

  } catch (err) {
    console.error("GET ELDERLY ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   GET SCHEDULES
================================= */
router.get("/schedules", auth(["caregiver"]), async (req, res) => {
  try {
    const { elderlyId } = req.query;

    if (!elderlyId) {
      return res.status(400).json({ message: "elderlyId required" });
    }

    const [rows] = await db.query(
      `
      SELECT 
        s.id,
        s.time_hhmm,
        s.days_of_week,
        m.name AS medication_name,
        m.dosage,
        m.notes
      FROM schedules s
      JOIN medications m ON m.id = s.medication_id
      WHERE m.elderly_user_id = ?
      ORDER BY s.time_hhmm ASC
      `,
      [elderlyId]
    );

    res.json({ items: rows });

  } catch (err) {
    console.error("GET SCHEDULE ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   CREATE SCHEDULE
================================= */
router.post("/schedules", auth(["caregiver"]), async (req, res) => {
  try {
    const {
      elderlyUserId,
      name,
      dosage,
      notes,
      timeHHMM,
      daysOfWeek,
    } = req.body;

    if (!elderlyUserId || !name || !timeHHMM) {
      return res.status(400).json({
        message: "ข้อมูลไม่ครบ",
      });
    }

    const [medResult] = await db.query(
      `
      INSERT INTO medications (elderly_user_id, name, dosage, notes)
      VALUES (?, ?, ?, ?)
      `,
      [elderlyUserId, name, dosage || null, notes || null]
    );

    const medicationId = medResult.insertId;

    await db.query(
      `
      INSERT INTO schedules (medication_id, time_hhmm, days_of_week)
      VALUES (?, ?, ?)
      `,
      [
        medicationId,
        timeHHMM,
        Array.isArray(daysOfWeek)
          ? daysOfWeek.join(",")
          : daysOfWeek || null,
      ]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error("CREATE SCHEDULE ERROR:", err);
    res.status(500).json({ message: "บันทึกไม่สำเร็จ" });
  }
});

/* ===============================
   DELETE ELDERLY
================================= */
router.delete("/elderly/:id", auth(["caregiver"]), async (req, res) => {
  try {
    const elderlyUserId = req.params.id;
    const caregiverId = req.user.id;

    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [caregiverId, elderlyUserId]
    );

    if (rel.length === 0) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์ลบข้อมูลนี้" });
    }

    await db.query("DELETE FROM elderly_profiles WHERE user_id = ?", [
      elderlyUserId,
    ]);

    await db.query("DELETE FROM care_relationships WHERE elderly_user_id = ?", [
      elderlyUserId,
    ]);

    await db.query(
      "DELETE FROM users WHERE id = ? AND role = 'elderly'",
      [elderlyUserId]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error("DELETE ELDERLY ERROR:", err);
    res.status(500).json({ message: "ลบข้อมูลไม่สำเร็จ" });
  }
});

module.exports = router;
