const db = require("../db");

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

async function checkMissedMedications() {
  try {
    const now = new Date();
    const todayStr = now.toLocaleDateString("en-CA");
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [schedules] = await db.query(
      `SELECT s.id AS schedule_id, s.time_hhmm, s.days_of_week,
              m.elderly_user_id, m.name AS medication_name,
              u.name AS elderly_name
       FROM schedules s
       JOIN medications m ON m.id = s.medication_id
       JOIN users u ON u.id = m.elderly_user_id
       WHERE (s.days_of_week IS NULL
         OR FIND_IN_SET(?, REPLACE(s.days_of_week, ' ', '')) > 0)
         AND (s.start_date IS NULL OR s.start_date <= ?)`,
      [String(now.getDay()), todayStr]
    );

    for (const schedule of schedules) {
      const [hh, mm] = schedule.time_hhmm.split(":").map(Number);
      const scheduleMinutes = hh * 60 + mm;
      const diffMinutes = currentMinutes - scheduleMinutes;

      const [logs] = await db.query(
        `SELECT id FROM intake_logs
         WHERE schedule_id = ? AND elderly_user_id = ? AND DATE(taken_at) = ?`,
        [schedule.schedule_id, schedule.elderly_user_id, todayStr]
      );

      if (logs.length > 0) continue;

      // +15 นาที → แจ้ง caregiver
      if (diffMinutes >= 15 && diffMinutes < 16) {
        const [caregivers] = await db.query(
          `SELECT u.fcm_token FROM users u
           JOIN care_relationships cr ON cr.caregiver_user_id = u.id
           WHERE cr.elderly_user_id = ? AND u.fcm_token IS NOT NULL`,
          [schedule.elderly_user_id]
        );

        for (const cg of caregivers) {
          if (!cg.fcm_token) continue;
          await sendExpoPush(
            cg.fcm_token,
            `🚨 ${schedule.elderly_name} ยังไม่กินยา!`,
            `${schedule.medication_name} เลยเวลามา 15 นาทีแล้ว`
          );
          console.log(`MISSED PUSH → caregiver for ${schedule.elderly_name}: ${schedule.medication_name}`);
        }
      }
    }
  } catch (err) {
    console.error("checkMissedMedications ERROR:", err);
  }
}

function startMissedMedicationJob() {
  console.log("⏰ Missed medication job started (check every 1 min)");
  setInterval(checkMissedMedications, 60 * 1000);
}

module.exports = { startMissedMedicationJob };