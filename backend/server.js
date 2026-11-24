require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");

const userRoutes = require("./routes/userRoutes");
const noteRoutes = require("./routes/noteRoutes");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CLIENT_URL || true,
    credentials: true,
  })
);

app.use("/user", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
}, userRoutes);

app.use("/note", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
}, noteRoutes);

// Mongoose offline fallback error handler
app.use((err, req, res, next) => {
  if (
    err.name === "MongooseError" ||
    err.name === "MongoNetworkError" ||
    (err.message && err.message.includes("buffering timed out"))
  ) {
    console.warn("[AI Studio] Database offline — returning mock empty response");
    if (req.method === "GET") {
      return res.json(req.path.endsWith("s") || req.path.endsWith("s/") ? [] : {});
    }
    return res
      .status(503)
      .json({ error: "Service temporarily unavailable (database offline)" });
  }
  next(err);
});

const distDir = path.join(__dirname, "../frontend/dist");
const indexHtml = path.join(distDir, "index.html");
let buildPromise = null;

const ensureFrontendBuilt = () => {
  if (fs.existsSync(indexHtml)) return Promise.resolve();
  if (!buildPromise) {
    buildPromise = new Promise((resolve, reject) => {
      exec(
        "npm --prefix frontend run build",
        { cwd: path.join(__dirname, "..") },
        (err, _stdout, stderr) => {
          if (err) {
            console.error("Frontend build failed:", stderr || err.message);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    }).finally(() => {
      buildPromise = null;
    });
  }
  return buildPromise;
};

app.use(async (req, res, next) => {
  if (!fs.existsSync(indexHtml)) {
    try {
      await ensureFrontendBuilt();
    } catch {
      return res.status(500).send("Frontend build failed");
    }
  }
  next();
});

app.use(
  "/assets",
  express.static(path.join(distDir, "assets"), {
    maxAge: "1y",
    immutable: true,
  })
);

app.use(
  express.static(distDir, {
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

app.get("*", (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(indexHtml);
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  connectDB();
  if (!fs.existsSync(indexHtml)) {
    ensureFrontendBuilt().catch(() => {});
  }
});
