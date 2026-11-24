const express = require("express");
const {
  createNote,
  getNotes,
  getNote,
  updateNote,
  deleteNote,
} = require("../controllers/noteController");
const protect = require("../middleware/auth");

const router = express.Router();

router.use(protect);

router.post("/create", createNote);
router.get("/read", getNotes);
router.get("/read/:id", getNote);
router.put("/update/:id", updateNote);
router.delete("/delete/:id", deleteNote);

module.exports = router;
