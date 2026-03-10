const express = require("express");
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

// ✅ แปลง Date เป็น local time string สำหรับ MySQL
function toLocalDT(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const y  = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d  = pad(date.getDate());
  const h  = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s  = pad(date.getSeconds());
  return {
    mysqlDT: `${y}-${mo}-${d} ${h}:${mi}:${s}`,
    dateStr: `${y}-${mo}-${d}`,
  };
}

function toDowToken(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return String(d.getDay());
}

// GET /elderly/schedules/:elderlyId
router.get("/schedules/:elderlyId", auth(["elderly"]), async (req, res) => {
  try {
    const { elderlyId } = req.params;
    if (Number(elderlyId) !== req.user.id)
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    const [rows] = await db.query(
      `SELECT s.id, s.time_hhmm, s.days_of_week, s.meal_relation,
              m.id AS medication_id, m.name AS medication_name, m.dosage, m.notes
       FROM schedules s
       JOIN medications m ON m.id = s.medication_id
       WHERE m.elderly_user_id = ?
       ORDER BY s.time_hhmm ASC`,
      [elderlyId]
    );
    res.json({ items: rows });
  } catch (err) {
    console.error("GET SCHEDULES ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

// POST /elderly/schedules
router.post("/schedules", auth(["elderly"]), async (req, res) => {
  try {
    const { name, dosage, notes, timeHHMM, daysOfWeek, mealRelation } = req.body;
    if (!name || !timeHHMM)
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });

    // ✅ บันทึก start_date เป็นวันที่สร้างอัตโนมัติ
    const { dateStr } = toLocalDT(new Date());

    const [medResult] = await db.query(
      `INSERT INTO medications (elderly_user_id, name, dosage, notes) VALUES (?, ?, ?, ?)`,
      [req.user.id, name, dosage || null, notes || null]
    );
    await db.query(
      `INSERT INTO schedules (medication_id, time_hhmm, days_of_week, meal_relation, start_date) VALUES (?, ?, ?, ?, ?)`,
      [medResult.insertId, timeHHMM,
       Array.isArray(daysOfWeek) ? daysOfWeek.join(",") : daysOfWeek || null,
       mealRelation || null,
       dateStr]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("CREATE SCHEDULE ERROR:", err);
    res.status(500).json({ message: "บันทึกไม่สำเร็จ" });
  }
});

// PUT /elderly/schedules/:id
router.put("/schedules/:id", auth(["elderly"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, dosage, notes, timeHHMM, daysOfWeek, mealRelation } = req.body;
    const [rows] = await db.query(
      `SELECT s.id, m.id AS medication_id, m.elderly_user_id
       FROM schedules s JOIN medications m ON m.id = s.medication_id WHERE s.id = ?`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    if (rows[0].elderly_user_id !== req.user.id)
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    await db.query(
      `UPDATE medications SET name = ?, dosage = ?, notes = ? WHERE id = ?`,
      [name, dosage || null, notes || null, rows[0].medication_id]
    );
    await db.query(
      `UPDATE schedules SET time_hhmm = ?, days_of_week = ?, meal_relation = ? WHERE id = ?`,
      [timeHHMM, Array.isArray(daysOfWeek) ? daysOfWeek.join(",") : daysOfWeek || null,
       mealRelation || null, id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("UPDATE SCHEDULE ERROR:", err);
    res.status(500).json({ message: "แก้ไขไม่สำเร็จ" });
  }
});

// DELETE /elderly/schedules/:id
router.delete("/schedules/:id", auth(["elderly"]), async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT s.id, m.elderly_user_id
       FROM schedules s JOIN medications m ON m.id = s.medication_id WHERE s.id = ?`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    if (rows[0].elderly_user_id !== req.user.id)
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    await db.query("DELETE FROM intake_logs WHERE schedule_id = ?", [id]);
    await db.query("DELETE FROM schedules WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE SCHEDULE ERROR:", err);
    res.status(500).json({ message: "ลบไม่สำเร็จ" });
  }
});

// GET /elderly/today?date=YYYY-MM-DD
router.get("/today", auth(["elderly"]), async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ message: "date required (YYYY-MM-DD)" });
  const dow = toDowToken(date);
  const [rows] = await db.query(
    `SELECT s.id AS scheduleId, s.time_hhmm AS timeHHMM, s.days_of_week AS daysOfWeek,
            s.meal_relation AS mealRelation, m.id AS medicationId,
            m.name AS medicationName, m.dosage, m.notes,
            (SELECT il.status FROM intake_logs il
             WHERE il.schedule_id = s.id AND il.elderly_user_id = ?
               AND DATE(il.taken_at) = ? ORDER BY il.taken_at DESC LIMIT 1) AS todayStatus
     FROM schedules s JOIN medications m ON m.id = s.medication_id
     WHERE m.elderly_user_id = ?
       AND (s.start_date IS NULL OR DATE(s.start_date) <= DATE(?))
       AND (s.days_of_week IS NULL OR FIND_IN_SET(?, REPLACE(s.days_of_week, ' ', '')) > 0)
     ORDER BY s.time_hhmm ASC`,
    [req.user.id, date, req.user.id, date, dow]
  );
  res.json({ date, dow, items: rows });
});

// POST /elderly/intake
router.post("/intake", auth(["elderly"]), async (req, res) => {
  const { scheduleId, status = "taken", takenAtISO } = req.body;
  if (!scheduleId) return res.status(400).json({ message: "scheduleId required" });
  if (!["taken", "late", "missed"].includes(status))
    return res.status(400).json({ message: "status must be taken | late | missed" });

  const takenAt = takenAtISO ? new Date(takenAtISO) : new Date();
  const { mysqlDT, dateStr } = toLocalDT(takenAt);

  const [existing] = await db.query(
    `SELECT id FROM intake_logs WHERE schedule_id = ? AND elderly_user_id = ? AND DATE(taken_at) = ?`,
    [scheduleId, req.user.id, dateStr]
  );
  if (existing.length > 0) {
    await db.query(`UPDATE intake_logs SET status = ?, taken_at = ? WHERE id = ?`,
      [status, mysqlDT, existing[0].id]);
  } else {
    await db.query(
      `INSERT INTO intake_logs(schedule_id, elderly_user_id, taken_at, status) VALUES (?,?,?,?)`,
      [scheduleId, req.user.id, mysqlDT, status]
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
      [req.user.id]
    );

    const medName     = scheduleInfo[0]?.medication_name ?? "ยา";
    const elderlyName = scheduleInfo[0]?.elderly_name ?? "ผู้สูงอายุ";
    const statusLabel = status === "taken"  ? "กินยาแล้ว ✓"
                      : status === "late"   ? "กินยาล่าช้า ⏰"
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
});

/* ===============================
   AUTO-MARK MISSED (ผู้สูงอายุเรียกเอง)
   ✅ ใช้ 60 นาที เพื่อให้ผู้สูงอายุมีเวลากดยืนยันมากขึ้น
================================= */
const MISSED_GRACE_MINUTES = 60;

router.post("/auto-missed", auth(["elderly"]), async (req, res) => {
  try {
    const elderlyId = req.user.id;
    const now = new Date();
    const { dateStr } = toLocalDT(now);
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
      if (s.start_date) {
        const start = new Date(s.start_date); start.setHours(0, 0, 0, 0);
        if (start > today) continue;
      }
      if (s.days_of_week) {
        const days = s.days_of_week.split(",").map(d => parseInt(d.trim()));
        if (!days.includes(todayDayNum)) continue;
      }

      const [h, m] = s.time_hhmm.split(":").map(Number);
      const scheduleMinutes = h * 60 + m;
      if (currentMinutes < scheduleMinutes + MISSED_GRACE_MINUTES) continue;

      const [existing] = await db.query(
        `SELECT id FROM intake_logs
         WHERE schedule_id = ? AND elderly_user_id = ? AND DATE(taken_at) = ?`,
        [s.id, elderlyId, dateStr]
      );
      if (existing.length > 0) continue;

      const { mysqlDT } = toLocalDT(now);
      await db.query(
        `INSERT INTO intake_logs (schedule_id, elderly_user_id, status, taken_at)
         VALUES (?, ?, 'missed', ?)`,
        [s.id, elderlyId, mysqlDT]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("AUTO MISSED ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

// GET /elderly/report
router.get("/report", auth(["elderly"]), async (req, res) => {
  try {
    const elderlyId = req.user.id;
    const { period = "day" } = req.query;

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

    function countActiveDays(schedule, start, end) {
      const allowedDays = schedule.days_of_week
        ? schedule.days_of_week.split(",").map(d => parseInt(d.trim()))
        : [0, 1, 2, 3, 4, 5, 6];
      const scheduleStart = schedule.start_date
        ? new Date(Math.max(new Date(schedule.start_date).getTime(), start.getTime()))
        : start;
      let count = 0;
      const cursor = new Date(scheduleStart);
      cursor.setHours(0, 0, 0, 0);
      const endCopy = new Date(end);
      endCopy.setHours(23, 59, 59, 999);
      while (cursor <= endCopy) {
        if (allowedDays.includes(cursor.getDay())) count++;
        cursor.setDate(cursor.getDate() + 1);
      }
      return count;
    }

    const [schedules] = await db.query(
      `SELECT s.id, s.days_of_week, s.start_date, m.id AS med_id, m.name AS med_name
       FROM schedules s JOIN medications m ON m.id = s.medication_id
       WHERE m.elderly_user_id = ?
         AND (s.start_date IS NULL OR DATE(s.start_date) <= DATE(?))`,
      [elderlyId, endDate]
    );

    const [logs] = await db.query(
      `SELECT schedule_id, status FROM intake_logs
       WHERE elderly_user_id = ? AND taken_at BETWEEN ? AND ?`,
      [elderlyId, startDate, endDate]
    );

    const taken  = logs.filter(l => l.status === "taken" || l.status === "late").length;
    const late   = logs.filter(l => l.status === "late").length;
    const missed = logs.filter(l => l.status === "missed").length;

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
        if (med.scheduleIds.includes(log.schedule_id)) med.taken++;
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

    res.json({ taken, late, missed, adherence, adherenceSoFar, totalFull, totalSoFar, drugs });
  } catch (err) {
    console.error("ELDERLY REPORT ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

// ⚠️ /:elderlyId ต้องอยู่ล่างสุดเสมอ
router.get("/:elderlyId", auth, async (req, res) => {
  try {
    const { elderlyId } = req.params;
    const [rows] = await db.query(
      "SELECT id, name, phone, age, address, disease FROM elderly WHERE id = ?",
      [elderlyId]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Elderly not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;