const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';



app.use(cors());
app.use(express.json());
app.use(express.static('.')); 

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'entrance.html'));
});
app.get('/entrance.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'entrance.html'));
});
app.get('/profile.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'profile.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const db = new sqlite3.Database('./users.db', (err) => {
    if (err) {
        console.error('Ошибка подключения к БД:', err.message);
    } else {
        console.log('✅ Подключено к SQLite');
        initDatabase();
    }
});


function initDatabase() {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Ошибка создания таблицы:', err.message);
        } else {
            console.log('✅ Таблица users готова');
        }
    });
}


app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Заполните все поля' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.get('SELECT email FROM users WHERE email = ?', [email], (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            if (user) {
                return res.status(400).json({ error: 'Email уже зарегистрирован' });
            }

            db.run(
                'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
                [username, email, hashedPassword],
                function(err) {
                    if (err) {
                        return res.status(400).json({ error: 'Ошибка регистрации' });
                    }
                    res.json({ 
                        success: true, 
                        message: 'Регистрация успешна!' 
                    });
                }
            );
        });

    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});


app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        if (!user) {
            return res.status(400).json({ error: 'Неверный email или пароль' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Неверный email или пароль' });
        }

        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ 
            success: true, 
            token, 
            user: { id: user.id, username: user.username, email: user.email }
        });
    });
});


app.get('/api/profile', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Токен не найден' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Неверный токен' });
        }
        res.json({ user: decoded });
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
    console.log(`📊 БД: users.db`);
});