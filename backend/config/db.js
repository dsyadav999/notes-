const mongoose = require("mongoose");

mongoose.set("bufferCommands", false);

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn("[AI Studio] MONGO_URI not set — using in-memory store");
    return false;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    console.log("MongoDB connected");
    return true;
  } catch (err) {
    console.warn("MongoDB not connected — using in-memory store:", err.message);
    return false;
  }
};

module.exports = connectDB;
