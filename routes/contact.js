// routes/contact.js — Contact form submissions
const express = require('express');
const db      = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { sendContactNotification } = require('../utils/mailer');

const router = express.Router();

// POST /api/contact — submit contact form
router.post('/', async (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !message) {
    return res.status(400).json({ error: 'Name and message are required.' });
  }

  db.prepare('INSERT INTO contact_messages (name, email, phone, message) VALUES (?, ?, ?, ?)')
    .run(name, email || '', phone || '', message);

  // Notify admin by email
  sendContactNotification({ name, email, phone, message }).catch(e => console.error('Email error:', e));

  res.json({ message: 'Message received! We will contact you shortly.' });
});

// GET /api/contact — get all messages (admin)
router.get('/', requireAdmin, (req, res) => {
  const messages = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC').all();
  res.json({ messages, total: messages.length, unread: messages.filter(m => !m.read).length });
});

// PATCH /api/contact/:id/read — mark as read (admin)
router.patch('/:id/read', requireAdmin, (req, res) => {
  db.prepare('UPDATE contact_messages SET read = 1 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Marked as read.' });
});

module.exports = router;
