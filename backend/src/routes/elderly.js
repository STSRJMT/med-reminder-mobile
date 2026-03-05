const express = require("express");
const db = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

// ── แก้ให้ return ตัวเลข "0"-"6" ตรงกับที่ caregiver บันทึก ──
// Frontend เก็บ days_of_week เป็น "0,1,2,3,4,5,6" (0=อาทิตย์, 1=จันทร์, ...)
function toDowToken(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return String(d.getDay()); // "0"=Sun, "1"=Mon, ..., "6"=Sat
}

// GET /elderly/today?date=YYYY-MM-DD
router.get("/today", auth(["elderly"]), async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ message: "date required (YYYY-MM-DD)" });

  const dow = toDowToken(date); // เช่น "5" สำหรับวันศุกร์

  const [rows] = await db.query(
    `
    SELECT 
      s.id AS scheduleId,
      s.time_hhmm AS timeHHMM,
      s.days_of_week AS daysOfWeek,
      m.id AS medicationId,
      m.name AS medicationName,
      m.dosage,
      m.notes,
      EXISTS(
        SELECT 1 FROM intake_logs il
        WHERE il.schedule_id = s.id
          AND il.elderly_user_id = ?
          AND DATE(il.taken_at) = ?
          AND il.status = 'taken'
      ) AS takenToday
    FROM schedules s
    JOIN medications m ON m.id = s.medication_id
    WHERE m.elderly_user_id = ?
      AND (
        s.days_of_week IS NULL
        OR FIND_IN_SET(?, REPLACE(s.days_of_week, ' ', '')) > 0
      )
    ORDER BY s.time_hhmm ASC
    `,
    [req.user.id, date, req.user.id, dow]
  );

  res.json({ date, dow, items: rows });
});

// POST /elderly/intake  body: { scheduleId, takenAtISO? }
router.post("/intake", auth(["elderly"]), async (req, res) => {
  const { scheduleId, takenAtISO } = req.body;
  if (!scheduleId) return res.status(400).json({ message: "scheduleId required" });

  const takenAt = takenAtISO ? new Date(takenAtISO) : new Date();
  const mysqlDT = takenAt.toISOString().slice(0, 19).replace("T", " ");

  await db.query(
    "INSERT INTO intake_logs(schedule_id, elderly_user_id, taken_at, status) VALUES (?,?,?, 'taken')",
    [scheduleId, req.user.id, mysqlDT]
  );

  res.json({ ok: true });
});

router.get("/:elderlyId", auth, async (req, res) => {
  try {
    const { elderlyId } = req.params;

    const [rows] = await db.query(
      "SELECT id, name, phone, age, address, disease FROM elderly WHERE id = ?",
      [elderlyId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Elderly not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;