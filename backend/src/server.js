require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/", (req, res) => res.json({ ok: true, api: "med-reminder" }));

app.use("/auth", require("./routes/auth"));
app.use("/caregiver", require("./routes/caregiver"));
app.use("/elderly", require("./routes/elderly"));



const port = process.env.PORT || 4000;
app.listen(port, () => console.log("🚀 API running on port", port));
