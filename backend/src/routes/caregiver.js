const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

// ✅ ส่ง Push ผ่าน Expo Push API
async function sendExpoPush(expoPushToken, title, body) {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: expoPushToken,
        title,
        body,
        sound: "default",
        priority: "high",
      }),
    });
  } catch (err) {
    console.error("EXPO PUSH ERROR:", err);
  }
}

function getTodayLocalStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateAge(birthDate) {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatDateOnly(dateInput) {
  const d = new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function countActiveDays(schedule, startDate, endDate) {
  const allowedDays = schedule.days_of_week
    ? schedule.days_of_week.split(",").map(d => parseInt(d.trim()))
    : [0, 1, 2, 3, 4, 5, 6];

  const scheduleStart = schedule.start_date
    ? new Date(Math.max(new Date(schedule.start_date).getTime(), startDate.getTime()))
    : startDate;

  let count = 0;
  const cursor = new Date(scheduleStart);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (cursor <= end) {
    if (allowedDays.includes(cursor.getDay())) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/* ===============================
   CREATE ELDERLY
================================= */
router.post("/create-elderly", auth(["caregiver"]), async (req, res) => {
  try {
    const { name, phone, pin, birthDate, address, disease } = req.body;
    if (!name || !phone || !pin || !birthDate)
      return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });

    const [dup] = await db.query("SELECT id FROM users WHERE phone = ?", [phone]);
    if (dup.length > 0)
      return res.status(409).json({ message: "เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว" });

    const password_hash = await bcrypt.hash(String(pin), 10);
    const formattedBirthDate = formatDateOnly(birthDate);

    const [r] = await db.query(
      `INSERT INTO users (name, phone, email, password_hash, role) VALUES (?, ?, NULL, ?, 'elderly')`,
      [name, phone, password_hash]
    );
    const elderlyUserId = r.insertId;

    await db.query(
      `INSERT INTO care_relationships (caregiver_user_id, elderly_user_id) VALUES (?, ?)`,
      [req.user.id, elderlyUserId]
    );
    await db.query(
      `INSERT INTO elderly_profiles (user_id, birth_date, address, disease) VALUES (?, ?, ?, ?)`,
      [elderlyUserId, formattedBirthDate, address || null, disease || null]
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
      `SELECT u.id, u.name, u.phone, p.birth_date, p.address, p.disease
       FROM users u
       JOIN care_relationships c ON c.elderly_user_id = u.id
       LEFT JOIN elderly_profiles p ON p.user_id = u.id
       WHERE c.caregiver_user_id = ?
       ORDER BY u.name ASC`,
      [req.user.id]
    );
    const result = rows.map((item) => ({
      ...item,
      age: item.birth_date ? calculateAge(item.birth_date) : null,
    }));
    res.json({ items: result });
  } catch (err) {
    console.error("GET ELDERLY ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   GET ELDERLY BY ID
================================= */
router.get("/elderly/:id", auth(["caregiver"]), async (req, res) => {
  try {
    const { id } = req.params;
    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, id]
    );
    if (rel.length === 0) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const [rows] = await db.query(
      `SELECT u.id, u.name, u.phone, p.birth_date, p.address, p.disease
       FROM users u LEFT JOIN elderly_profiles p ON p.user_id = u.id
       WHERE u.id = ?`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   UPDATE ELDERLY
================================= */
router.put("/elderly/:id", auth(["caregiver"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, pin, birthDate, address, disease } = req.body;

    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, id]
    );
    if (rel.length === 0) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    if (phone) {
      const [dup] = await db.query("SELECT id FROM users WHERE phone = ? AND id != ?", [phone, id]);
      if (dup.length > 0) return res.status(409).json({ message: "เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว" });
    }

    await db.query(`UPDATE users SET name = ?, phone = ? WHERE id = ?`, [name, phone, id]);
    if (pin) {
      const password_hash = await bcrypt.hash(String(pin), 10);
      await db.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [password_hash, id]);
    }

    const formattedBirthDate = birthDate ? formatDateOnly(birthDate) : null;
    const [profileExists] = await db.query(`SELECT id FROM elderly_profiles WHERE user_id = ?`, [id]);

    if (profileExists.length > 0) {
      await db.query(
        `UPDATE elderly_profiles SET birth_date = ?, address = ?, disease = ? WHERE user_id = ?`,
        [formattedBirthDate, address || null, disease || null, id]
      );
    } else {
      await db.query(
        `INSERT INTO elderly_profiles (user_id, birth_date, address, disease) VALUES (?, ?, ?, ?)`,
        [id, formattedBirthDate, address || null, disease || null]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   DELETE ELDERLY
================================= */
router.delete("/elderly/:id", auth(["caregiver"]), async (req, res) => {
  try {
    const { id } = req.params;
    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, id]
    );
    if (rel.length === 0) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    await db.query(`DELETE FROM intake_logs WHERE elderly_user_id = ?`, [id]);
    await db.query(`DELETE FROM schedules WHERE medication_id IN (SELECT id FROM medications WHERE elderly_user_id = ?)`, [id]);
    await db.query(`DELETE FROM medications WHERE elderly_user_id = ?`, [id]);
    await db.query(`DELETE FROM elderly_profiles WHERE user_id = ?`, [id]);
    await db.query(`DELETE FROM care_relationships WHERE elderly_user_id = ?`, [id]);
    await db.query(`DELETE FROM users WHERE id = ?`, [id]);

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE ELDERLY ERROR:", err);
    res.status(500).json({ message: "ลบไม่สำเร็จ" });
  }
});

/* ===============================
   GET SCHEDULES (list)
================================= */
router.get("/schedules", auth(["caregiver"]), async (req, res) => {
  try {
    const { elderlyId } = req.query;
    if (!elderlyId) return res.status(400).json({ message: "elderlyId required" });

    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, elderlyId]
    );
    if (rel.length === 0) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" });

    const [rows] = await db.query(
      `SELECT s.id, s.time_hhmm, s.days_of_week, s.meal_relation, s.start_date,
              m.name AS medication_name, m.dosage, m.notes
       FROM schedules s
       JOIN medications m ON m.id = s.medication_id
       WHERE m.elderly_user_id = ?
       ORDER BY s.time_hhmm ASC`,
      [elderlyId]
    );

    res.json({ items: rows });
  } catch (err) {
    console.error("GET SCHEDULE ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   GET SCHEDULE BY ID
================================= */
router.get("/schedules/:id", auth(["caregiver"]), async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT s.id, s.time_hhmm, s.days_of_week, s.meal_relation, s.start_date,
              m.id AS medication_id, m.name AS medication_name, m.dosage, m.notes, m.elderly_user_id
       FROM schedules s
       JOIN medications m ON m.id = s.medication_id
       WHERE s.id = ?`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });

    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, rows[0].elderly_user_id]
    );
    if (rel.length === 0) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    res.json(rows[0]);
  } catch (err) {
    console.error("GET SCHEDULE BY ID ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   CREATE SCHEDULE
================================= */
router.post("/schedules", auth(["caregiver"]), async (req, res) => {
  try {
    const { elderlyUserId, name, dosage, notes, timeHHMM, daysOfWeek, mealRelation, startDate } = req.body;
    if (!elderlyUserId || !name || !timeHHMM)
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });

    const [medResult] = await db.query(
      `INSERT INTO medications (elderly_user_id, name, dosage, notes) VALUES (?, ?, ?, ?)`,
      [elderlyUserId, name, dosage || null, notes || null]
    );

    await db.query(
      `INSERT INTO schedules (medication_id, time_hhmm, days_of_week, meal_relation, start_date)
       VALUES (?, ?, ?, ?, ?)`,
      [
        medResult.insertId,
        timeHHMM,
        Array.isArray(daysOfWeek) ? daysOfWeek.join(",") : daysOfWeek || null,
        mealRelation || null,
        startDate || null,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("CREATE SCHEDULE ERROR:", err);
    res.status(500).json({ message: "บันทึกไม่สำเร็จ" });
  }
});

/* ===============================
   UPDATE SCHEDULE
================================= */
router.put("/schedules/:id", auth(["caregiver"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, dosage, notes, timeHHMM, daysOfWeek, mealRelation } = req.body;

    const [rows] = await db.query(
      `SELECT s.id, m.id AS medication_id, m.elderly_user_id
       FROM schedules s JOIN medications m ON m.id = s.medication_id WHERE s.id = ?`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });

    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, rows[0].elderly_user_id]
    );
    if (rel.length === 0) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    await db.query(
      `UPDATE medications SET name = ?, dosage = ?, notes = ? WHERE id = ?`,
      [name, dosage || null, notes || null, rows[0].medication_id]
    );
    await db.query(
      `UPDATE schedules SET time_hhmm = ?, days_of_week = ?, meal_relation = ? WHERE id = ?`,
      [
        timeHHMM,
        Array.isArray(daysOfWeek) ? daysOfWeek.join(",") : daysOfWeek || null,
        mealRelation || null,
        id,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("UPDATE SCHEDULE ERROR:", err);
    res.status(500).json({ message: "แก้ไขไม่สำเร็จ" });
  }
});

/* ===============================
   DELETE SCHEDULE
================================= */
router.delete("/schedules/:id", auth(["caregiver"]), async (req, res) => {
  try {
    const scheduleId = req.params.id;
    await db.query("DELETE FROM intake_logs WHERE schedule_id = ?", [scheduleId]);
    await db.query("DELETE FROM schedules WHERE id = ?", [scheduleId]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE SCHEDULE ERROR:", err);
    res.status(500).json({ message: "ลบไม่สำเร็จ" });
  }
});

/* ===============================
   GET REPORT
================================= */
router.get("/report/:elderlyId", auth(["caregiver"]), async (req, res) => {
  try {
    const { elderlyId } = req.params;
    const { period = "day" } = req.query;

    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, elderlyId]
    );
    if (rel.length === 0) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" });

    const now = new Date();
    let startDate, endDate;

    if (period === "day") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endDate   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (period === "week") {
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      startDate = new Date(now);
      startDate.setDate(now.getDate() + diffToMonday);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [schedules] = await db.query(
      `SELECT s.id, s.days_of_week, s.start_date, m.id AS med_id, m.name AS med_name
       FROM schedules s JOIN medications m ON m.id = s.medication_id
       WHERE m.elderly_user_id = ?
         AND (s.start_date IS NULL OR s.start_date <= ?)`,
      [elderlyId, endDate]
    );

    const [logs] = await db.query(
      `SELECT schedule_id, status, taken_at FROM intake_logs
       WHERE elderly_user_id = ? AND taken_at BETWEEN ? AND ?`,
      [elderlyId, startDate, endDate]
    );

    const taken   = logs.filter(l => l.status === "taken" || l.status === "late").length;
    const late    = logs.filter(l => l.status === "late").length;
    const missed  = logs.filter(l => l.status === "missed").length;
    const skipped = logs.filter(l => l.status === "skipped").length;

    const medMap = new Map();
    for (const s of schedules) {
      if (!medMap.has(s.med_id)) {
        medMap.set(s.med_id, { name: s.med_name, scheduleIds: [], taken: 0, totalFull: 0, totalSoFar: 0 });
      }
      const entry = medMap.get(s.med_id);
      entry.scheduleIds.push(s.id);
      entry.totalFull  += countActiveDays(s, startDate, endDate);
      entry.totalSoFar += countActiveDays(s, startDate, todayEnd);
    }

    for (const log of logs.filter(l => l.status === "taken" || l.status === "late")) {
      for (const [, med] of medMap) {
        if (med.scheduleIds.includes(log.schedule_id)) med.taken += 1;
      }
    }

    const drugs = [...medMap.values()].map(m => ({
      name: m.name,
      taken: m.taken,
      totalFull: m.totalFull,
      totalSoFar: m.totalSoFar,
      percentage:      m.totalFull  > 0 ? Math.round((m.taken / m.totalFull)  * 100) : 0,
      percentageSoFar: m.totalSoFar > 0 ? Math.round((m.taken / m.totalSoFar) * 100) : 0,
    }));

    const totalFull  = drugs.reduce((sum, d) => sum + d.totalFull,  0);
    const totalSoFar = drugs.reduce((sum, d) => sum + d.totalSoFar, 0);
    const adherence      = totalFull  > 0 ? Math.round((taken / totalFull)  * 100) : 0;
    const adherenceSoFar = totalSoFar > 0 ? Math.round((taken / totalSoFar) * 100) : 0;

    res.json({ taken, late, missed, skipped, adherence, adherenceSoFar, totalFull, totalSoFar, drugs });
  } catch (err) {
    console.error("GET REPORT ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   AUTO-MARK MISSED
   เรียกตอนโหลด report — ตรวจยาที่เลยเวลา 30 นาทีแล้วยังไม่กิน
================================= */
router.post("/auto-missed/:elderlyId", auth(["caregiver"]), async (req, res) => {
  try {
    const { elderlyId } = req.params;

    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, elderlyId]
    );
    if (rel.length === 0) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const now = new Date();
    const todayStr = now.toLocaleDateString("en-CA");
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayDayNum = now.getDay();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [schedules] = await db.query(
      `SELECT s.id, s.time_hhmm, s.days_of_week, s.start_date
       FROM schedules s
       JOIN medications m ON m.id = s.medication_id
       WHERE m.elderly_user_id = ?`,
      [elderlyId]
    );

    for (const s of schedules) {
      // เช็คว่าวันนี้ต้องกินมั้ย
      if (s.start_date) {
        const start = new Date(s.start_date); start.setHours(0, 0, 0, 0);
        if (start > today) continue;
      }
      if (s.days_of_week) {
        const days = s.days_of_week.split(",").map(d => parseInt(d.trim()));
        if (!days.includes(todayDayNum)) continue;
      }

      // เช็คว่าเลยเวลากิน + 30 นาทีแล้วหรือยัง
      const [h, m] = s.time_hhmm.split(":").map(Number);
      const scheduleMinutes = h * 60 + m;
      if (currentMinutes < scheduleMinutes + 60) continue;

      // เช็คว่ามี log วันนี้แล้วหรือยัง
      const [existing] = await db.query(
        `SELECT id FROM intake_logs
         WHERE schedule_id = ? AND elderly_user_id = ? AND DATE(taken_at) = ?`,
        [s.id, elderlyId, todayStr]
      );
      if (existing.length > 0) continue;

      // บันทึก missed
      await db.query(
        `INSERT INTO intake_logs (schedule_id, elderly_user_id, status, taken_at)
         VALUES (?, ?, 'missed', NOW())`,
        [s.id, elderlyId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("AUTO MISSED ERROR:", err);
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
    const todayStr = new Date().toLocaleDateString("en-CA");

    const [rows] = await db.query(
      `SELECT s.id, s.time_hhmm, s.days_of_week, s.meal_relation, s.start_date,
              m.name AS medication_name, m.dosage, m.notes
       FROM schedules s
       JOIN medications m ON m.id = s.medication_id
       WHERE m.elderly_user_id = ?
       ORDER BY s.time_hhmm ASC`,
      [elderlyId]
    );

    const dayNameMap = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySchedules = rows.filter((row) => {
      if (row.start_date) {
        const start = new Date(row.start_date);
        start.setHours(0, 0, 0, 0);
        if (start > today) return false;
      }
      if (!row.days_of_week) return true;
      const days = row.days_of_week.split(",").map((d) => d.trim());
      return days.includes(String(todayNum)) || days.includes(dayNameMap[todayNum]);
    });

    const [logs] = await db.query(
      `SELECT schedule_id, status FROM intake_logs
       WHERE elderly_user_id = ? AND DATE(taken_at) = ?`,
      [elderlyId, todayStr]
    );

    const logMap = {};
    for (const log of logs) logMap[log.schedule_id] = log.status;

    const result = todaySchedules.map((s) => ({ ...s, status: logMap[s.id] || null }));
    res.json({ items: result });
  } catch (err) {
    console.error("TODAY ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   LOG INTAKE + Expo Push Notification
================================= */
router.post("/intake-logs", auth(["caregiver"]), async (req, res) => {
  try {
    const { scheduleId, elderlyId, status } = req.body;
    if (!scheduleId || !elderlyId || !status)
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });

    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, elderlyId]
    );
    if (rel.length === 0) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const todayStr = new Date().toLocaleDateString("en-CA");
    const [existing] = await db.query(
      `SELECT id FROM intake_logs WHERE schedule_id = ? AND elderly_user_id = ? AND DATE(taken_at) = ?`,
      [scheduleId, elderlyId, todayStr]
    );

    if (existing.length > 0) {
      await db.query(`UPDATE intake_logs SET status = ?, taken_at = NOW() WHERE id = ?`, [status, existing[0].id]);
    } else {
      await db.query(
        `INSERT INTO intake_logs (schedule_id, elderly_user_id, status, taken_at) VALUES (?, ?, ?, NOW())`,
        [scheduleId, elderlyId, status]
      );
    }

    res.json({ ok: true });

    try {
      const [scheduleInfo] = await db.query(
        `SELECT m.name AS medication_name, u.name AS elderly_name
         FROM schedules s
         JOIN medications m ON m.id = s.medication_id
         JOIN users u ON u.id = m.elderly_user_id
         WHERE s.id = ?`,
        [scheduleId]
      );

      const [caregivers] = await db.query(
        `SELECT u.fcm_token FROM users u
         JOIN care_relationships cr ON cr.caregiver_user_id = u.id
         WHERE cr.elderly_user_id = ? AND u.fcm_token IS NOT NULL`,
        [elderlyId]
      );

      const medName     = scheduleInfo[0]?.medication_name ?? "ยา";
      const elderlyName = scheduleInfo[0]?.elderly_name ?? "ผู้สูงอายุ";
      const statusLabel = status === "taken" ? "กินยาแล้ว ✓"
                        : status === "late"  ? "กินยาล่าช้า ⏰"
                        : "ข้ามมื้อยา ✗";

      for (const cg of caregivers) {
        if (!cg.fcm_token) continue;
        await sendExpoPush(
          cg.fcm_token,
          `${elderlyName} — ${statusLabel}`,
          `ยา "${medName}"`
        );
      }
    } catch (pushErr) {
      console.error("PUSH NOTIFICATION ERROR:", pushErr);
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   SAVE FCM TOKEN
================================= */
router.post("/fcm-token", auth(["caregiver"]), async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "token required" });
    await db.query("UPDATE users SET fcm_token = ? WHERE id = ?", [token, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("FCM TOKEN ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   GET SCHEDULE SIBLINGS
================================= */
router.get("/schedules/:id/siblings", auth(["caregiver"]), async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT s.id, s.time_hhmm, m.id AS medication_id, m.elderly_user_id
       FROM schedules s JOIN medications m ON m.id = s.medication_id WHERE s.id = ?`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });

    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, rows[0].elderly_user_id]
    );
    if (rel.length === 0) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const [siblings] = await db.query(
      `SELECT id, time_hhmm FROM schedules WHERE medication_id = ? ORDER BY time_hhmm ASC`,
      [rows[0].medication_id]
    );

    res.json({ medication_id: rows[0].medication_id, schedules: siblings });
  } catch (err) {
    res.status(500).json({ message: "server error" });
  }
});

/* ===============================
   GET SCHEDULES BY DATE (history)
================================= */
router.get("/history/:elderlyId", auth(["caregiver"]), async (req, res) => {
  try {
    const { elderlyId } = req.params;
    const { date } = req.query;

    if (!date) return res.status(400).json({ message: "date required" });

    const [rel] = await db.query(
      "SELECT 1 FROM care_relationships WHERE caregiver_user_id = ? AND elderly_user_id = ?",
      [req.user.id, elderlyId]
    );
    if (rel.length === 0) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const targetDate = new Date(date);
    const targetDayNum = targetDate.getDay();
    targetDate.setHours(0, 0, 0, 0);

    const dayNameMap = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };

    const [rows] = await db.query(
      `SELECT s.id, s.time_hhmm, s.days_of_week, s.meal_relation, s.start_date,
              m.name AS medication_name, m.dosage, m.notes
       FROM schedules s
       JOIN medications m ON m.id = s.medication_id
       WHERE m.elderly_user_id = ?
       ORDER BY s.time_hhmm ASC`,
      [elderlyId]
    );

    const filtered = rows.filter((row) => {
      if (row.start_date) {
        const start = new Date(row.start_date);
        start.setHours(0, 0, 0, 0);
        if (start > targetDate) return false;
      }
      if (!row.days_of_week) return true;
      const days = row.days_of_week.split(",").map((d) => d.trim());
      return days.includes(String(targetDayNum)) || days.includes(dayNameMap[targetDayNum]);
    });

    const [logs] = await db.query(
      `SELECT schedule_id, status FROM intake_logs
       WHERE elderly_user_id = ? AND DATE(taken_at) = ?`,
      [elderlyId, date]
    );

    const logMap = {};
    for (const log of logs) logMap[log.schedule_id] = log.status;

    const result = filtered.map((s) => ({ ...s, status: logMap[s.id] || null }));
    res.json({ items: result });
  } catch (err) {
    console.error("HISTORY ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
