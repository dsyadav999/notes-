const jwt = require("jsonwebtoken");

const getJwtSecret = () => process.env.JWT_SECRET || "note-world-dev-secret";

const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = req.cookies?.token || bearerToken;
  if (!token) return res.status(401).json({ message: "Not logged in" });

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = protect;
