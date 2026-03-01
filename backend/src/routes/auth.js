const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

/**
 * POST /auth/register-caregiver
 * body: { name, email, password }
 */
router.post("/register-caregiver", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, password required" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [r] = await db.query(
      "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'caregiver')",
      [name, email, password_hash]
    );

    res.json({ caregiverUserId: r.insertId });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

/**
 * POST /auth/login (caregiver)
 * body: { email, password }
 */
router.post("/login", async (req, res) => {
  try {
    console.log("LOGIN BODY:", req.body);

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email & password required" });
    }

    const [rows] = await db.query(
      "SELECT * FROM users WHERE email=? AND role='caregiver' LIMIT 1",
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "invalid credentials" });
    }

    const user = rows[0];

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: { id: user.id, role: user.role, name: user.name }
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

/**
 * POST /auth/login-elderly
 * body: { phone, pin }
 */
router.post("/login-elderly", async (req, res) => {
  try {
    const { phone, pin } = req.body;

    if (!phone || !pin) {
      return res.status(400).json({ message: "phone & pin required" });
    }

    const [rows] = await db.query(
      "SELECT * FROM users WHERE phone=? AND role='elderly' LIMIT 1",
      [phone]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "not found" });
    }

    const user = rows[0];

    const ok = await bcrypt.compare(String(pin), user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "wrong pin" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: { id: user.id, role: user.role, name: user.name }
    });

  } catch (err) {
    console.error("ELDERLY LOGIN ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
