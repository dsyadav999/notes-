const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const memoryStore = require("../config/memoryStore");

const isDbConnected = () => mongoose.connection.readyState === 1;
const getJwtSecret = () => process.env.JWT_SECRET || "note-world-dev-secret";
const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const getCookieOptions = (req) => {
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  return {
    httpOnly: true,
    sameSite: isHttps ? "none" : "lax",
    secure: isHttps,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
};

const sendToken = (req, res, user) => {
  const token = jwt.sign({ id: user._id }, getJwtSecret(), { expiresIn: "7d" });
  res.cookie("token", token, getCookieOptions(req));
  return token;
};

// POST /user/register
exports.register = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const exists = isDbConnected()
      ? await User.findOne({ email }).lean()
      : memoryStore.users.findOneByEmail(email);
    if (exists) {
      return res.status(400).json({ message: "An account with this email already exists." });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = isDbConnected()
      ? await User.create({ name, email, password: hashed })
      : memoryStore.users.create({ name, email, password: hashed });

    const token = sendToken(req, res, user);
    res.status(201).json({ id: user._id, name: user.name, email: user.email, token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /user/login
exports.login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = isDbConnected()
      ? await User.findOne({ email }).lean()
      : memoryStore.users.findOneByEmail(email);
    if (!user) return res.status(400).json({ message: "Invalid email or password." });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: "Invalid email or password." });

    const token = sendToken(req, res, user);
    res.json({ id: user._id, name: user.name, email: user.email, token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /user/logout
exports.logout = (req, res) => {
  res.clearCookie("token", getCookieOptions(req));
  res.json({ message: "Signed out successfully" });
};

// GET /user/me
exports.me = async (req, res) => {
  try {
    if (isDbConnected()) {
      const user = await User.findById(req.userId).select("-password").lean();
      if (!user) return res.status(404).json({ message: "User not found" });
      return res.json(user);
    }

    const user = memoryStore.users.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password: _pw, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
