const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();

// Database
const db = new sqlite3.Database("./messages.db");

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files from public folder
app.use(express.static(path.join(__dirname, "public")));

// Create table if not exists
db.run(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  message TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Serve index.html on root request
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Save message
app.post("/submit", (req, res) => {
  const { name, message } = req.body;

  db.run(
    `INSERT INTO messages (name, message) VALUES (?, ?)`,
    [name, message],
    function (err) {
      if (err) return res.send("Error saving message.");
      res.send("✅ Message saved successfully!");
    }
  );
});

// Get all messages
app.get("/messages", (req, res) => {
  db.all(`SELECT * FROM messages ORDER BY id DESC`, (err, rows) => {
    if (err) return res.send("Error reading messages.");
    res.json(rows);
  });
});

// Update a message
app.post("/update", (req, res) => {
  const { id, message } = req.body;

  db.run(
    `UPDATE messages SET message = ? WHERE id = ?`,
    [message, id],
    function (err) {
      if (err) return res.send("Error updating message.");
      res.send("✏️ Message updated successfully!");
    }
  );
});

// Delete a message
app.post("/delete", (req, res) => {
  const { id } = req.body;

  db.run(`DELETE FROM messages WHERE id = ?`, [id], function (err) {
    if (err) return res.send("Error deleting message.");
    res.send("🗑 Message deleted successfully!");
  });
});

// Render-compatible PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
