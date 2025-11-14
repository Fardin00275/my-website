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
      secure: false,       // FIXED for Render
      sameSite: "lax",     // FIXED for Render
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

// serve static frontend
app.use(express.static(path.join(__dirname, "public")));

// --- DB setup ---
db.run(
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
);

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

// Try to add user_id column for older DBs
db.run(`ALTER TABLE messages ADD COLUMN user_id INTEGER`, () => {});

// --- Middleware ---
function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: "Unauthorized. Please log in." });
}

// --- Auth routes ---
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password required." });

    db.get(`SELECT id FROM users WHERE username = ?`, [username], (err, row) => {
      if (err) return res.status(500).json({ error: "DB error." });
      if (row) return res.status(400).json({ error: "Username already taken." });

      const hash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));

      db.run(
        `INSERT INTO users (username, password_hash) VALUES (?, ?)`,
        [username, hash],
        function (err2) {
          if (err2) return res.status(500).json({ error: "Error creating user." });

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

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required." });

  db.get(`SELECT id, password_hash FROM users WHERE username = ?`, [username], (err, row) => {
    if (err) return res.status(500).json({ error: "DB error." });
    if (!row) return res.status(400).json({ error: "Invalid credentials." });

    if (!bcrypt.compareSync(password, row.password_hash))
      return res.status(400).json({ error: "Invalid credentials." });

    req.session.userId = row.id;
    req.session.username = username;

    res.json({ success: true, message: "Logged in.", username });
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ success: true, message: "Logged out." });
  });
});

app.get("/me", (req, res) => {
  if (req.session && req.session.userId)
    return res.json({ id: req.session.userId, username: req.session.username });

  res.json(null);
});

// --- Message routes ---
app.get("/messages", (req, res) => {
  db.all(`SELECT * FROM messages ORDER BY id DESC`, (err, rows) => {
    if (err) return res.status(500).json({ error: "Error reading messages." });
    res.json(rows);
  });
});

app.post("/submit", requireLogin, (req, res) => {
  const userId = req.session.userId;
  const name = req.session.username;
  const message = req.body.message;

  if (!message || !message.trim())
    return res.status(400).json({ error: "Message required." });

  db.run(
    `INSERT INTO messages (name, message, user_id) VALUES (?, ?, ?)`,
    [name, message, userId],
    function (err) {
      if (err) return res.status(500).json({ error: "Error saving message." });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.post("/update", requireLogin, (req, res) => {
  const { id, message } = req.body;
  const userId = req.session.userId;

  db.get(`SELECT user_id FROM messages WHERE id = ?`, [id], (err, row) => {
    if (!row) return res.status(404).json({ error: "Message not found." });
    if (row.user_id !== userId)
      return res.status(403).json({ error: "Not allowed." });

    db.run(`UPDATE messages SET message = ? WHERE id = ?`, [message, id], function (err2) {
      if (err2) return res.status(500).json({ error: "Error updating message." });
      res.json({ success: true });
    });
  });
});

app.post("/delete", requireLogin, (req, res) => {
  const { id } = req.body;
  const userId = req.session.userId;

  db.get(`SELECT user_id FROM messages WHERE id = ?`, [id], (err, row) => {
    if (!row) return res.status(404).json({ error: "Message not found." });
    if (row.user_id !== userId)
      return res.status(403).json({ error: "Not allowed." });

    db.run(`DELETE FROM messages WHERE id = ?`, [id], function (err2) {
      if (err2) return res.status(500).json({ error: "Error deleting message." });
      res.json({ success: true });
    });
  });
});

// fallback for / main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
