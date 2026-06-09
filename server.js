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

const db = new sqlite3.Database('./users.db');

function initDatabase() {
  db.serialize(() => {
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
  });
}
function auth(req,res,next){ const token=(req.headers.authorization||'').split(' ')[1]; if(!token) return res.status(401).json({error:'no token'}); jwt.verify(token,JWT_SECRET,(e,d)=>{ if(e) return res.status(401).json({error:'bad token'}); req.user=d; next();}); }
function num(){ return 'BK'+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,6).toUpperCase(); }

app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'index.html')));
['entrance','profile','payment','confirmation','search-results','hotel-detail','excursion-booking','destinations','attractions','hotels','index'].forEach(f=>{
  app.get('/'+(f==='index'?'':f+'.html'), (req,res)=>res.sendFile(path.join(__dirname,f==='index'?'index.html':f+'.html')));
});

app.post('/api/register', async (req,res)=>{
  try{
    const {username,email,password}=req.body;
    if(!username||!email||!password) return res.status(400).json({error:'Заполните все поля'});
    if(password.length<6) return res.status(400).json({error:'Пароль минимум 6 символов'});
    const hash=await bcrypt.hash(password,10);
    db.get('SELECT 1 FROM users WHERE email=? OR username=?',[email,username],(e,row)=>{
      if(e) return res.status(500).json({error:'Ошибка сервера'});
      if(row) return res.status(400).json({error:'Email или имя пользователя уже используется'});
      db.run('INSERT INTO users (username,email,password) VALUES (?,?,?)',[username,email,hash],function(err){
        if(err) return res.status(400).json({error:'Ошибка регистрации'});
        const token=jwt.sign({userId:this.lastID,username},JWT_SECRET,{expiresIn:'7d'});
        res.json({success:true,token,user:{id:this.lastID,username,email}});
      });
    });
  } catch { res.status(500).json({error:'Ошибка сервера'}); }
});

app.post('/api/login',(req,res)=>{
  const {email,password}=req.body;
  if(!email||!password) return res.status(400).json({error:'Заполните все поля'});
  db.get('SELECT * FROM users WHERE email=?',[email],async(e,user)=>{
    if(e) return res.status(500).json({error:'Ошибка сервера'});
    if(!user) return res.status(400).json({error:'Неверный email или пароль'});
    const ok = await bcrypt.compare(password,user.password);
    if(!ok) return res.status(400).json({error:'Неверный email или пароль'});
    const token=jwt.sign({userId:user.id,username:user.username},JWT_SECRET,{expiresIn:'7d'});
    res.json({success:true,token,user:{id:user.id,username:user.username,email:user.email}});
  });
});

app.get('/api/profile',auth,(req,res)=>{
  db.get('SELECT id,username,email,created_at FROM users WHERE id=?',[req.user.userId],(e,user)=>{
    if(e||!user) return res.status(404).json({error:'Пользователь не найден'});
    res.json({user});
  });
});

app.put('/api/profile',auth,async(req,res)=>{
  const {username,email,currentPassword,newPassword}=req.body;
  db.get('SELECT * FROM users WHERE id=?',[req.user.userId],async(e,user)=>{
    if(e||!user) return res.status(404).json({error:'Пользователь не найден'});
    const nextUsername=username||user.username;
    const nextEmail=email||user.email;
    if(newPassword){
      const ok = await bcrypt.compare(currentPassword||'', user.password);
      if(!ok) return res.status(400).json({error:'Неверный текущий пароль'});
      const hash = await bcrypt.hash(newPassword,10);
      db.run('UPDATE users SET username=?, email=?, password=? WHERE id=?',[nextUsername,nextEmail,hash,req.user.userId],err=>{ if(err) return res.status(400).json({error:'Email already used'}); res.json({success:true}); });
    } else {
      db.run('UPDATE users SET username=?, email=? WHERE id=?',[nextUsername,nextEmail,req.user.userId],err=>{ if(err) return res.status(400).json({error:'Email already used'}); res.json({success:true}); });
    }
  });
});

app.post('/api/bookings',auth,(req,res)=>{ const {type,title,location,check_in,check_out,guests,price}=req.body; if(!type||!title) return res.status(400).json({error:'Укажите тип и название'}); db.run('INSERT INTO bookings (user_id,type,title,location,check_in,check_out,guests,price,booking_number) VALUES (?,?,?,?,?,?,?,?,?)',[req.user.userId,type,title,location||'',check_in||'',check_out||'',guests||1,price||0,num()],function(err){ if(err) return res.status(500).json({error:'Ошибка создания бронирования'}); res.json({success:true,booking_id:this.lastID}); }); });
app.get('/api/bookings',auth,(req,res)=>{ db.all('SELECT * FROM bookings WHERE user_id=? ORDER BY created_at DESC',[req.user.userId],(e,rows)=>{ if(e) return res.status(500).json({error:'Ошибка сервера'}); res.json({bookings:rows}); }); });
app.delete('/api/bookings/:id',auth,(req,res)=>{ db.run('DELETE FROM bookings WHERE id=? AND user_id=?',[req.params.id,req.user.userId],function(e){ if(e) return res.status(500).json({error:'Ошибка сервера'}); res.json({success:this.changes>0}); }); });
app.post('/api/favorites',auth,(req,res)=>{ const {item_type,item_id,title,location,price,image_url}=req.body; db.run('INSERT OR REPLACE INTO favorites (user_id,item_type,item_id,title,location,price,image_url) VALUES (?,?,?,?,?,?,?)',[req.user.userId,item_type,item_id,title,location||'',price||'',image_url||''],function(e){ if(e) return res.status(500).json({error:'Ошибка сервера'}); res.json({success:true}); }); });
app.delete('/api/favorites/:type/:id',auth,(req,res)=>{ db.run('DELETE FROM favorites WHERE user_id=? AND item_type=? AND item_id=?',[req.user.userId,req.params.type,req.params.id],function(e){ if(e) return res.status(500).json({error:'Ошибка сервера'}); res.json({success:true}); }); });
app.get('/api/favorites',auth,(req,res)=>{ db.all('SELECT * FROM favorites WHERE user_id=? ORDER BY created_at DESC',[req.user.userId],(e,rows)=>{ if(e) return res.status(500).json({error:'Ошибка сервера'}); res.json({favorites:rows}); }); });
app.post('/api/subscribe',(req,res)=>{ const {email}=req.body; if(!email) return res.status(400).json({error:'Укажите email'}); db.run('INSERT OR IGNORE INTO subscriptions (email) VALUES (?)',[email],function(e){ if(e) return res.status(500).json({error:'Ошибка сервера'}); res.json({success:true,message:this.changes?'Вы успешно подписались!':'Вы уже подписаны'}); }); });

initDatabase();
app.listen(PORT,()=>console.log('Server running on port '+PORT));
