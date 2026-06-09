const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'svoy-tourist-secret-2024';

app.use(cors());
app.use(express.json());
app.use(express.static('.'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const db = new sqlite3.Database('./users.db', (err) => {
  if (err) console.error('DB error:', err.message);
  else initDatabase();
});

function initDatabase() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT,
    check_in TEXT,
    check_out TEXT,
    guests INTEGER DEFAULT 1,
    price REAL,
    status TEXT DEFAULT 'confirmed',
    booking_number TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT,
    price TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, item_type, item_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Токен не найден' });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Неверный токен' });
    req.user = decoded;
    next();
  });
}

function generateBookingNumber() {
  return 'BK' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Заполните все поля' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    const hashedPassword = await bcrypt.hash(password, 10);
    db.get('SELECT email FROM users WHERE email = ? OR username = ?', [email, username], (err, user) => {
      if (err) return res.status(500).json({ error: 'Ошибка сервера' });
      if (user) return res.status(400).json({ error: 'Email или имя пользователя уже используется' });
      db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword], function(err) {
        if (err) return res.status(400).json({ error: 'Ошибка регистрации' });
        const token = jwt.sign({ userId: this.lastID, username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: 'Регистрация успешна!', token, user: { id: this.lastID, username, email } });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Заполните все поля' });
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (!user) return res.status(400).json({ error: 'Неверный email или пароль' });
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(400).json({ error: 'Неверный email или пароль' });
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email } });
  });
});

app.get('/api/profile', authMiddleware, (req, res) => {
  db.get('SELECT id, username, email, created_at FROM users WHERE id = ?', [req.user.userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ user });
  });
});

app.put('/api/profile', authMiddleware, async (req, res) => {
  const { username, email, currentPassword, newPassword } = req.body;
  db.get('SELECT * FROM users WHERE id = ?', [req.user.userId], async (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
    const nextUsername = username || user.username;
    const nextEmail = email || user.email;
    if (newPassword) {
      const isValid = await bcrypt.compare(currentPassword || '', user.password);
      if (!isValid) return res.status(400).json({ error: 'Неверный текущий пароль' });
      const hashed = await bcrypt.hash(newPassword, 10);
      db.run('UPDATE users SET username=?, email=?, password=? WHERE id=?', [nextUsername, nextEmail, hashed, req.user.userId], (e) => {
        if (e) return res.status(400).json({ error: 'Email уже используется' });
        res.json({ success: true, message: 'Профиль обновлён' });
      });
    } else {
      db.run('UPDATE users SET username=?, email=? WHERE id=?', [nextUsername, nextEmail, req.user.userId], (e) => {
        if (e) return res.status(400).json({ error: 'Email already used' });
        res.json({ success: true, message: 'Профиль обновлён' });
      });
    }
  });
});

app.post('/api/bookings', authMiddleware, (req, res) => {
  const { type, title, location, check_in, check_out, guests, price } = req.body;
  if (!type || !title) return res.status(400).json({ error: 'Укажите тип и название' });
  const booking_number = generateBookingNumber();
  db.run(`INSERT INTO bookings (user_id, type, title, location, check_in, check_out, guests, price, booking_number)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [req.user.userId, type, title, location, check_in, check_out, guests || 1, price, booking_number], function(err) {
    if (err) return res.status(500).json({ error: 'Ошибка создания бронирования' });
    res.json({ success: true, booking_number, booking_id: this.lastID });
  });
});

app.get('/api/bookings', authMiddleware, (req, res) => {
  db.all('SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC', [req.user.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    res.json({ bookings: rows });
  });
});

app.delete('/api/bookings/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM bookings WHERE id = ? AND user_id = ?', [req.params.id, req.user.userId], function(err) {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (this.changes === 0) return res.status(404).json({ error: 'Бронирование не найдено' });
    res.json({ success: true });
  });
});

app.post('/api/favorites', authMiddleware, (req, res) => {
  const { item_type, item_id, title, location, price, image_url } = req.body;
  db.run(`INSERT OR IGNORE INTO favorites (user_id, item_type, item_id, title, location, price, image_url)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, [req.user.userId, item_type, item_id, title, location, price, image_url], function(err) {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    res.json({ success: true, added: this.changes > 0 });
  });
});

app.delete('/api/favorites/:itemType/:itemId', authMiddleware, (req, res) => {
  db.run('DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?', [req.user.userId, req.params.itemType, req.params.itemId], function(err) {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    res.json({ success: true, removed: this.changes > 0 });
  });
});

app.get('/api/favorites', authMiddleware, (req, res) => {
  db.all('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC', [req.user.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    res.json({ favorites: rows });
  });
});

app.post('/api/subscribe', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Укажите email' });
  db.run('INSERT OR IGNORE INTO subscriptions (email) VALUES (?)', [email], function(err) {
    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
    if (this.changes === 0) return res.json({ success: true, message: 'Вы уже подписаны' });
    res.json({ success: true, message: 'Вы успешно подписались!' });
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));