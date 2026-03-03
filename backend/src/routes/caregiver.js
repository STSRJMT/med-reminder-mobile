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
    const formattedBirthDate = formatDateOnly(birthDate);

    const [r] = await db.query(
      `
      INSERT INTO users (name, phone, email, password_hash, role)
      VALUES (?, ?, NULL, ?, 'elderly')
      `,
      [name, phone, password_hash]
    );

    const elderlyUserId = r.insertId;

    await db.query(
      `
      INSERT INTO care_relationships (caregiver_user_id, elderly_user_id)
      VALUES (?, ?)
      `,
      [req.user.id, elderlyUserId]
    );

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
   GET SCHEDULES (มี meal_relation + permission check)
================================= */
router.get("/schedules", auth(["caregiver"]), async (req, res) => {
  try {
    const { elderlyId } = req.query;

    if (!elderlyId) {
      return res.status(400).json({ message: "elderlyId required" });
    }

    // ✅ เช็คสิทธิ์ก่อน
    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, elderlyId]
    );

    if (rel.length === 0) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" });
    }

    const [rows] = await db.query(
      `
      SELECT 
        s.id,
        s.time_hhmm,
        s.days_of_week,
        s.meal_relation,
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
      mealRelation,
    } = req.body;

    if (!elderlyUserId || !name || !timeHHMM) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
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
      INSERT INTO schedules (medication_id, time_hhmm, days_of_week, meal_relation)
      VALUES (?, ?, ?, ?)
      `,
      [
        medicationId,
        timeHHMM,
        Array.isArray(daysOfWeek)
          ? daysOfWeek.join(",")
          : daysOfWeek || null,
        mealRelation || null,
      ]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error("CREATE SCHEDULE ERROR:", err);
    res.status(500).json({ message: "บันทึกไม่สำเร็จ" });
  }
});

/* ===============================
   DELETE SCHEDULE
================================= */
router.delete("/schedules/:id", auth(["caregiver"]), async (req, res) => {
  try {
    const scheduleId = req.params.id;

    await db.query(
      "DELETE FROM schedules WHERE id = ?",
      [scheduleId]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error("DELETE SCHEDULE ERROR:", err);
    res.status(500).json({ message: "ลบไม่สำเร็จ" });
  }
});

/* ===============================
   GET REPORT (สรุปการกินยา)
================================= */
/* ===============================
   GET REPORT
================================= */
router.get("/report/:elderlyId", auth(["caregiver"]), async (req, res) => {
  try {
    const { elderlyId } = req.params;
    const { period = "day" } = req.query;

    // เช็คสิทธิ์
    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, elderlyId]
    );
    if (rel.length === 0) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" });
    }

    // กำหนดช่วงวันที่
    const now = new Date();
    let startDate, endDate;

    if (period === "day") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endDate   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (period === "week") {
      const day = now.getDay();
      startDate = new Date(now);
      startDate.setDate(now.getDate() - day);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    // ดึง schedules ทั้งหมดของคนนี้
    const [schedules] = await db.query(
      `SELECT s.id, m.id AS med_id, m.name AS med_name
       FROM schedules s
       JOIN medications m ON m.id = s.medication_id
       WHERE m.elderly_user_id = ?`,
      [elderlyId]
    );

    // ดึง intake_logs ในช่วงเวลา ✅ ใช้ชื่อตารางที่ถูกต้อง
    const [logs] = await db.query(
      `SELECT schedule_id, status, taken_at
       FROM intake_logs
       WHERE elderly_user_id = ? AND taken_at BETWEEN ? AND ?`,
      [elderlyId, startDate, endDate]
    );

    const taken   = logs.filter(l => l.status === "taken").length;
    const missed  = logs.filter(l => l.status === "missed").length;
    const skipped = logs.filter(l => l.status === "skipped").length;
    const total   = schedules.length;
    const adherence = total > 0 ? Math.round((taken / total) * 100) : 0;

    // รายละเอียดแต่ละยา
    const medMap = new Map();
    for (const s of schedules) {
      if (!medMap.has(s.med_id)) {
        medMap.set(s.med_id, {
          name: s.med_name,
          scheduleIds: [],
          taken: 0,
          total: 0,
        });
      }
      medMap.get(s.med_id).scheduleIds.push(s.id);
      medMap.get(s.med_id).total += 1;
    }

    for (const log of logs.filter(l => l.status === "taken")) {
      for (const [, med] of medMap) {
        if (med.scheduleIds.includes(log.schedule_id)) {
          med.taken += 1;
        }
      }
    }

    const drugs = [...medMap.values()].map(m => ({
      name: m.name,
      taken: m.taken,
      total: m.total,
      percentage: m.total > 0 ? Math.round((m.taken / m.total) * 100) : 0,
    }));

    res.json({ taken, missed, skipped, adherence, drugs });

  } catch (err) {
    console.error("GET REPORT ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});


/* ===============================
   GET TODAY'S SCHEDULES
================================= */
router.get("/today/:elderlyId", auth(["caregiver"]), async (req, res) => {
  try {
    const { elderlyId } = req.params;

    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, elderlyId]
    );
    if (rel.length === 0) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const todayNum = new Date().getDay();
    const todayStr = new Date().toISOString().slice(0, 10);

    const [rows] = await db.query(
      // ✅ เพิ่ม s.days_of_week เข้ามาด้วย
      `SELECT s.id, s.time_hhmm, s.days_of_week, s.meal_relation,
              m.name AS medication_name, m.dosage, m.notes
       FROM schedules s
       JOIN medications m ON m.id = s.medication_id
       WHERE m.elderly_user_id = ?
       ORDER BY s.time_hhmm ASC`,
      [elderlyId]
    );

    const dayNameMap = {
      0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat"
    };

    const todaySchedules = rows.filter((row) => {
      if (!row.days_of_week) return true;
      const days = row.days_of_week.split(",").map((d) => d.trim());
      return (
        days.includes(String(todayNum)) ||
        days.includes(dayNameMap[todayNum])
      );
    });

    const [logs] = await db.query(
      `SELECT schedule_id, status FROM intake_logs
       WHERE elderly_user_id = ? AND DATE(taken_at) = ?`,
      [elderlyId, todayStr]
    );

    const logMap = {};
    for (const log of logs) logMap[log.schedule_id] = log.status;

    const result = todaySchedules.map((s) => ({
      ...s,
      status: logMap[s.id] || null,
    }));

    res.json({ items: result });

  } catch (err) {
    console.error("TODAY ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   LOG INTAKE
================================= */
router.post("/intake-logs", auth(["caregiver"]), async (req, res) => {
  try {
    const { scheduleId, elderlyId, status } = req.body;
    // status: "taken" | "late" | "missed"

    if (!scheduleId || !elderlyId || !status) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
    }

    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, elderlyId]
    );
    if (rel.length === 0) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    // upsert — ถ้ามีอยู่แล้วให้อัปเดต
    const todayStr = new Date().toISOString().slice(0, 10);
    const [existing] = await db.query(
      `SELECT id FROM intake_logs WHERE schedule_id = ? AND elderly_user_id = ? AND DATE(taken_at) = ?`,
      [scheduleId, elderlyId, todayStr]
    );

    if (existing.length > 0) {
      await db.query(
        `UPDATE intake_logs SET status = ?, taken_at = NOW() WHERE id = ?`,
        [status, existing[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO intake_logs (schedule_id, elderly_user_id, status, taken_at) VALUES (?, ?, ?, NOW())`,
        [scheduleId, elderlyId, status]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "server error" });
  }
});

module.exports = router;