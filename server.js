// server.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcryptjs");
const session = require("express-session");

const app = express();
const db = new sqlite3.Database("./messages.db");

// --- middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// session setup
const SESSION_SECRET = process.env.SESSION_SECRET || "change_this_secret";
app.use(
  session({
    name: "sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // true on production (https)
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// serve static frontend from /public
app.use(express.static(path.join(__dirname, "public")));

// --- DB setup ---
// Create users table
db.run(
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
);

// Create messages table (include user_id)
db.run(
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    message TEXT,
    user_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`
);

// Try to add user_id column if the table existed previously without it
db.run(`ALTER TABLE messages ADD COLUMN user_id INTEGER`, (err) => {
  // ignore error if column already exists (SQLite will produce an error)
  // We don't need to handle that error further.
});

// --- Helper middleware ---
function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: "Unauthorized. Please log in." });
}

// --- Auth routes ---

// Signup: { username, password }
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password required." });

    // check if username exists
    db.get(`SELECT id FROM users WHERE username = ?`, [username], (err, row) => {
      if (err) return res.status(500).json({ error: "DB error." });
      if (row) return res.status(400).json({ error: "Username already taken." });

      // hash password
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);

      db.run(
        `INSERT INTO users (username, password_hash) VALUES (?, ?)`,
        [username, hash],
        function (err2) {
          if (err2) return res.status(500).json({ error: "Error creating user." });

          // auto-login after signup
          req.session.userId = this.lastID;
          req.session.username = username;
          res.json({ success: true, message: "User created and logged in.", username });
        }
      );
    });
  } catch (e) {
    res.status(500).json({ error: "Server error." });
  }
});

// Login: { username, password }
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required." });

  db.get(`SELECT id, password_hash FROM users WHERE username = ?`, [username], (err, row) => {
    if (err) return res.status(500).json({ error: "DB error." });
    if (!row) return res.status(400).json({ error: "Invalid credentials." });

    const match = bcrypt.compareSync(password, row.password_hash);
    if (!match) return res.status(400).json({ error: "Invalid credentials." });

    // success: create session
    req.session.userId = row.id;
    req.session.username = username;
    res.json({ success: true, message: "Logged in.", username });
  });
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    res.clearCookie("sid");
    if (err) return res.status(500).json({ error: "Logout error." });
    res.json({ success: true, message: "Logged out." });
  });
});

// Who am I? (frontend can GET this)
app.get("/me", (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ id: req.session.userId, username: req.session.username });
  }
  return res.json(null);
});

// --- Message routes ---

// Get messages (anyone can view)
app.get("/messages", (req, res) => {
  db.all(`SELECT * FROM messages ORDER BY id DESC`, (err, rows) => {
    if (err) return res.status(500).json({ error: "Error reading messages." });
    res.json(rows);
  });
});

// Create message — only logged-in users
app.post("/submit", requireLogin, (req, res) => {
  // use username from session, ignore name in the body
  const userId = req.session.userId;
  const name = req.session.username || "Anonymous";
  const message = req.body.message;

  if (!message || !message.trim()) return res.status(400).json({ error: "Message required." });

  db.run(
    `INSERT INTO messages (name, message, user_id) VALUES (?, ?, ?)`,
    [name, message, userId],
    function (err) {
      if (err) return res.status(500).json({ error: "Error saving message." });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Update message — only owner can edit
app.post("/update", requireLogin, (req, res) => {
  const { id, message } = req.body;
  const userId = req.session.userId;
  if (!id || !message) return res.status(400).json({ error: "id and message required." });

  db.get(`SELECT user_id FROM messages WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: "DB error." });
    if (!row) return res.status(404).json({ error: "Message not found." });
    if (!row.user_id) return res.status(403).json({ error: "Cannot modify legacy message." });
    if (row.user_id !== userId) return res.status(403).json({ error: "Not allowed." });

    db.run(`UPDATE messages SET message = ? WHERE id = ?`, [message, id], function (err2) {
      if (err2) return res.status(500).json({ error: "Error updating message." });
      res.json({ success: true });
    });
  });
});

// Delete message — only owner
app.post("/delete", requireLogin, (req, res) => {
  const { id } = req.body;
  const userId = req.session.userId;
  if (!id) return res.status(400).json({ error: "id required." });

  db.get(`SELECT user_id FROM messages WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: "DB error." });
    if (!row) return res.status(404).json({ error: "Message not found." });
    if (!row.user_id) return res.status(403).json({ error: "Cannot delete legacy message." });
    if (row.user_id !== userId) return res.status(403).json({ error: "Not allowed." });

    db.run(`DELETE FROM messages WHERE id = ?`, [id], function (err2) {
      if (err2) return res.status(500).json({ error: "Error deleting message." });
      res.json({ success: true });
    });
  });
});

// fallback: serve index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
