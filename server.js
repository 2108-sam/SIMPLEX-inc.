// server.js — Simplex Inc. Backend API
require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const path        = require('path');

const app = express();

// ── SECURITY MIDDLEWARE ──
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5500',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));

// ── RATE LIMITING ──
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests. Please try again later.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // stricter for auth routes
  message: { error: 'Too many login attempts. Please wait 15 minutes.' }
});

app.use(limiter);

// ── BODY PARSERS ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── STATIC FILES ──
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── HEALTH CHECK ──
app.get('/api/health', (req, res) => {
  res.json({
    status:  'online',
    service: 'Simplex Inc. API',
    version: '1.0.0',
    time:    new Date().toISOString()
  });
});

// ── ROUTES ──
app.use('/api/auth',     authLimiter, require('./routes/auth'));
app.use('/api/products',              require('./routes/products'));
app.use('/api/orders',                require('./routes/orders'));
app.use('/api/payments',              require('./routes/payments'));
app.use('/api/users',                 require('./routes/users'));
app.use('/api/contact',               require('./routes/contact'));

// ── 404 HANDLER ──
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ── ERROR HANDLER ──
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error. Please try again.' });
});

// ── START ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Simplex Inc. Backend running on port ${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base:    http://localhost:${PORT}/api`);
  console.log(`❤️  Health:     http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
