require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { startMissedMedicationJob } = require("./jobs/missedMedicationJob");

const app = express();

/* =============================
   Middlewares
============================= */

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

/* =============================
   Test Route
============================= */

app.get("/", (req, res) => {
  res.json({
    ok: true,
    api: "med-reminder",
    message: "API is working",
  });
});

/* =============================
   Routes
============================= */

app.use("/auth", require("./routes/auth"));
app.use("/caregiver", require("./routes/caregiver"));
app.use("/elderly", require("./routes/elderly"));

/* =============================
   Start Server
============================= */

const port = process.env.PORT || 4000;

app.listen(port, "0.0.0.0", () => {
  console.log("🚀 API running on port", port);

  // ✅ เริ่ม cron job หลัง server start
  startMissedMedicationJob();
});