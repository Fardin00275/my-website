const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./messages.db");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

// Create table if not exists
db.run(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  message TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);


// Simple GET routes
app.get("/", (req, res) => {
  res.send("Hello! Your Node.js backend is working!");
});

app.get("/about", (req, res) => {
  res.send("This is the ABOUT page of your backend.");
});

app.get("/hello", (req, res) => {
  res.send("Hello Rashed! Your backend can say hello now.");
});

app.get("/api/info", (req, res) => {
  res.json({
    name: "My First Backend",
    language: "Node.js",
    author: "rashed",
    status: "Working perfectly!"
  });
});

// ✅ Correct POST route (saves to database)
app.post("/submit", (req, res) => {
  const name = req.body.name;
  const message = req.body.message;

  db.run(
    `INSERT INTO messages (name, message) VALUES (?, ?)`,
    [name, message],
    function (err) {
      if (err) {
        return res.send("Error saving message.");
      }

      res.send("✅ Message saved successfully!");
    }
  );
});

// ✅ Route to view all messages
app.get("/messages", (req, res) => {
  db.run(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  message TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

  db.all(`SELECT * FROM messages`, (err, rows) => {
    if (err) {
      return res.send("Error reading messages.");
    }

    res.json(rows);
  });
});
// ✅ Update a message
app.post("/update", (req, res) => {
  const { id, message } = req.body;
  db.run(`UPDATE messages SET message = ? WHERE id = ?`, [message, id], function (err) {
    if (err) return res.send("Error updating message.");
    res.send("✅ Message updated successfully!");
  });
});

// ✅ Delete a message
app.post("/delete", (req, res) => {
  const { id } = req.body;
  db.run(`DELETE FROM messages WHERE id = ?`, [id], function (err) {
    if (err) return res.send("Error deleting message.");
    res.send("🗑 Message deleted successfully!");
  });
});

// Start server
app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});