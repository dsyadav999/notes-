const mongoose = require("mongoose");
const Note = require("../models/Note");
const memoryStore = require("../config/memoryStore");

const isDbConnected = () => mongoose.connection.readyState === 1;
const validId = (id) => mongoose.Types.ObjectId.isValid(id);

const cleanCategory = (value) => {
  const c = typeof value === "string" ? value.trim().slice(0, 30) : "";
  return c || "General";
};

// POST /note/create
exports.createNote = async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const content = typeof req.body.content === "string" ? req.body.content : "";
    const category = req.body.category;
    if (!title) return res.status(400).json({ message: "Title is required." });

    const noteData = {
      user: req.userId,
      title,
      content,
      category: cleanCategory(category),
    };

    const note = isDbConnected()
      ? await Note.create(noteData)
      : memoryStore.notes.create(noteData);
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /note/read
exports.getNotes = async (req, res) => {
  try {
    const filter = { user: req.userId };
    if (req.query.category) filter.category = req.query.category;

    const notes = isDbConnected()
      ? await Note.find(filter).sort({ updatedAt: -1 }).lean()
      : memoryStore.notes.find(filter);
    res.json(notes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /note/read/:id
exports.getNote = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid id" });

    const note = isDbConnected()
      ? await Note.findOne({ _id: req.params.id, user: req.userId }).lean()
      : memoryStore.notes.findOne({ _id: req.params.id, user: req.userId });
    if (!note) return res.status(404).json({ message: "Note not found" });
    res.json(note);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /note/update/:id
exports.updateNote = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid id" });

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "Title is required." });

    const content = typeof req.body.content === "string" ? req.body.content : "";
    const update = { title, content };
    if (req.body.category !== undefined) update.category = cleanCategory(req.body.category);

    const note = isDbConnected()
      ? await Note.findOneAndUpdate(
          { _id: req.params.id, user: req.userId },
          update,
          { new: true, runValidators: true }
        ).lean()
      : memoryStore.notes.findOneAndUpdate(
          { _id: req.params.id, user: req.userId },
          update
        );
    if (!note) return res.status(404).json({ message: "Note not found" });
    res.json(note);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /note/delete/:id
exports.deleteNote = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid id" });

    const note = isDbConnected()
      ? await Note.findOneAndDelete({ _id: req.params.id, user: req.userId }).lean()
      : memoryStore.notes.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!note) return res.status(404).json({ message: "Note not found" });
    res.json({ message: "Note deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
