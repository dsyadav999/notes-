const mongoose = require("mongoose");

const users = new Map();
const notes = new Map();

const newId = () => new mongoose.Types.ObjectId().toString();

const memoryStore = {
  users: {
    findOneByEmail(email) {
      const normalized = String(email || "").trim().toLowerCase();
      for (const user of users.values()) {
        if (user.email === normalized) return { ...user };
      }
      return null;
    },
    findById(id) {
      const user = users.get(String(id));
      return user ? { ...user } : null;
    },
    create({ name, email, password }) {
      const now = new Date().toISOString();
      const user = {
        _id: newId(),
        name: String(name || "").trim(),
        email: String(email || "").trim().toLowerCase(),
        password,
        createdAt: now,
        updatedAt: now,
      };
      users.set(user._id, user);
      return { ...user };
    },
  },
  notes: {
    create({ user, title, content = "", category = "General" }) {
      const now = new Date().toISOString();
      const note = {
        _id: newId(),
        user: String(user),
        title: String(title || "").trim(),
        content: typeof content === "string" ? content : "",
        category: String(category || "General").trim().slice(0, 30) || "General",
        createdAt: now,
        updatedAt: now,
      };
      notes.set(note._id, note);
      return { ...note };
    },
    find(filter) {
      const result = [];
      for (const note of notes.values()) {
        if (note.user !== String(filter.user)) continue;
        if (filter.category && note.category !== filter.category) continue;
        result.push({ ...note });
      }
      result.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      return result;
    },
    findOne({ _id, user }) {
      const note = notes.get(String(_id));
      if (!note || note.user !== String(user)) return null;
      return { ...note };
    },
    findOneAndUpdate({ _id, user }, update) {
      const note = notes.get(String(_id));
      if (!note || note.user !== String(user)) return null;
      if (update.title !== undefined) {
        const trimmedTitle = String(update.title).trim();
        if (!trimmedTitle) {
          const err = new Error("Path `title` is required.");
          err.name = "ValidationError";
          throw err;
        }
        note.title = trimmedTitle;
      }
      if (update.content !== undefined) note.content = String(update.content);
      if (update.category !== undefined) {
        note.category = String(update.category).trim().slice(0, 30) || "General";
      }
      note.updatedAt = new Date().toISOString();
      notes.set(note._id, note);
      return { ...note };
    },
    findOneAndDelete({ _id, user }) {
      const note = notes.get(String(_id));
      if (!note || note.user !== String(user)) return null;
      notes.delete(note._id);
      return { ...note };
    },
  },
};

module.exports = memoryStore;
