// routes/payments.js — PayPal, M-Pesa (Daraja), Card (Flutterwave)
const express = require('express');
const https   = require('https');
const db      = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────
// PAYPAL
// ─────────────────────────────────────────────

// GET /api/payments/paypal/config — return public client ID to frontend
router.get('/paypal/config', (req, res) => {
  res.json({
    clientId: process.env.PAYPAL_CLIENT_ID,
    currency: 'USD',
    receiverEmail: process.env.PAYPAL_RECEIVER_EMAIL
  });
});

// POST /api/payments/paypal/create-order — create a PayPal order
router.post('/paypal/create-order', requireAuth, async (req, res) => {
  const { amountKES } = req.body;
  if (!amountKES) return res.status(400).json({ error: 'Amount is required.' });

  // Convert KES → USD (approximate rate; use a live exchange API in production)
  const usd = (amountKES / 130).toFixed(2);

  try {
    const accessToken = await getPayPalToken();
    const order = await createPayPalOrder(accessToken, usd);
    res.json({ id: order.id, usd, kes: amountKES });
  } catch (err) {
    console.error('PayPal error:', err);
    res.status(500).json({ error: 'Failed to create PayPal order. Check PayPal credentials.' });
  }
});

// POST /api/payments/paypal/capture — capture after customer approves
router.post('/paypal/capture', requireAuth, async (req, res) => {
  const { orderId, orderRef } = req.body;
  try {
    const accessToken = await getPayPalToken();
    const capture = await capturePayPalOrder(accessToken, orderId);

    // Mark order as paid
    if (orderRef) {
      db.prepare(`UPDATE orders SET payment_status='completed', payment_ref=?, updated_at=datetime('now') WHERE id=?`)
        .run(`PAYPAL-${capture.id}`, orderRef);
    }
    res.json({ success: true, capture });
  } catch (err) {
    console.error('PayPal capture error:', err);
    res.status(500).json({ error: 'PayPal capture failed.' });
  }
});

async function getPayPalToken() {
  const base = process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json();
  return data.access_token;
}

async function createPayPalOrder(token, usd) {
  const base = process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const res = await fetch(`${base}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: usd },
        payee: { email_address: process.env.PAYPAL_RECEIVER_EMAIL }
      }]
    })
  });
  return res.json();
}

async function capturePayPalOrder(token, orderId) {
  const base = process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const res = await fetch(`${base}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  return res.json();
}


// ─────────────────────────────────────────────
// M-PESA (Safaricom Daraja API)
// ─────────────────────────────────────────────

// POST /api/payments/mpesa/stk — trigger STK push to customer phone
router.post('/mpesa/stk', requireAuth, async (req, res) => {
  const { phone, amount, orderRef } = req.body;

  if (!phone || !amount) {
    return res.status(400).json({ error: 'Phone number and amount are required.' });
  }

  // Sanitize phone: ensure it starts with 254
  const sanitized = phone.replace(/\D/g,'').replace(/^0/, '254').replace(/^254254/, '254');
  if (sanitized.length !== 12) {
    return res.status(400).json({ error: 'Invalid M-Pesa phone number. Use format 07XXXXXXXX.' });
  }

  try {
    const token     = await getMpesaToken();
    const timestamp = getMpesaTimestamp();
    const password  = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

    const base = process.env.MPESA_ENV === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

    const response = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   'CustomerPayBillOnline',
        Amount:            Math.ceil(amount),
        PartyA:            sanitized,
        PartyB:            process.env.MPESA_SHORTCODE,
        PhoneNumber:       sanitized,
        CallBackURL:       process.env.MPESA_CALLBACK_URL,
        AccountReference:  orderRef || 'SimplexInc',
        TransactionDesc:   'Simplex Inc. Purchase'
      })
    });

    const data = await response.json();

    if (data.ResponseCode === '0') {
      // Store checkout request ID for callback matching
      if (orderRef) {
        db.prepare(`UPDATE orders SET payment_ref=? WHERE id=?`).run(data.CheckoutRequestID, orderRef);
      }
      res.json({ success: true, checkoutRequestId: data.CheckoutRequestID, message: 'STK push sent. Enter your M-Pesa PIN.' });
    } else {
      res.status(400).json({ error: data.errorMessage || data.ResultDesc || 'STK push failed.' });
    }
  } catch (err) {
    console.error('M-Pesa error:', err);
    res.status(500).json({ error: 'M-Pesa request failed. Check Daraja credentials.' });
  }
});

// POST /api/payments/mpesa/callback — Safaricom calls this URL after payment
router.post('/mpesa/callback', (req, res) => {
  const body = req.body;
  console.log('M-Pesa callback received:', JSON.stringify(body, null, 2));

  try {
    const result = body?.Body?.stkCallback;
    if (!result) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    const checkoutId = result.CheckoutRequestID;
    const resultCode = result.ResultCode;

    if (resultCode === 0) {
      // Payment successful
      const metadata = result.CallbackMetadata?.Item || [];
      const getVal = name => metadata.find(i => i.Name === name)?.Value;
      const mpesaRef = getVal('MpesaReceiptNumber');
      const amount   = getVal('Amount');

      db.prepare(`
        UPDATE orders
        SET payment_status='completed', payment_ref=?, updated_at=datetime('now')
        WHERE payment_ref=?
      `).run(`MPESA-${mpesaRef}`, checkoutId);

      console.log(`✅ M-Pesa payment confirmed: ${mpesaRef} — KSh ${amount}`);
    } else {
      // Payment failed or cancelled
      db.prepare(`UPDATE orders SET payment_status='failed', updated_at=datetime('now') WHERE payment_ref=?`)
        .run(checkoutId);
      console.log(`❌ M-Pesa payment failed. Code: ${resultCode}`);
    }
  } catch (err) {
    console.error('M-Pesa callback error:', err);
  }

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

async function getMpesaToken() {
  const base = process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

  const credentials = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');

  const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { 'Authorization': `Basic ${credentials}` }
  });
  const data = await res.json();
  return data.access_token;
}

function getMpesaTimestamp() {
  return new Date().toISOString().replace(/[-T:\.Z]/g,'').slice(0,14);
}


// ─────────────────────────────────────────────
// CARD PAYMENTS (Flutterwave)
// ─────────────────────────────────────────────

// POST /api/payments/card/initiate — initiate Flutterwave payment
router.post('/card/initiate', requireAuth, async (req, res) => {
  const { amount, orderRef, cardName, email, phone } = req.body;

  if (!amount || !orderRef) {
    return res.status(400).json({ error: 'Amount and order reference required.' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const txRef = `SMP-CARD-${Date.now()}`;

    const response = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tx_ref:          txRef,
        amount:          amount,
        currency:        'KES',
        redirect_url:    `${process.env.FRONTEND_URL}/payment-success?order=${orderRef}`,
        customer: {
          email:       email || user.email,
          phone_number: phone || user.phone,
          name:        cardName || user.name
        },
        customizations: {
          title:       'Simplex Inc.',
          description: `Order ${orderRef}`,
          logo:        `${process.env.FRONTEND_URL}/logo.png`
        },
        meta: { order_ref: orderRef }
      })
    });

    const data = await response.json();

    if (data.status === 'success') {
      db.prepare(`UPDATE orders SET payment_ref=? WHERE id=?`).run(txRef, orderRef);
      res.json({ success: true, paymentLink: data.data.link, txRef });
    } else {
      res.status(400).json({ error: data.message || 'Card payment initiation failed.' });
    }
  } catch (err) {
    console.error('Flutterwave error:', err);
    res.status(500).json({ error: 'Card payment failed. Check Flutterwave credentials.' });
  }
});

// POST /api/payments/card/webhook — Flutterwave calls this after payment
router.post('/card/webhook', (req, res) => {
  const secretHash = process.env.FLW_SECRET_KEY;
  const signature  = req.headers['verif-hash'];

  if (signature !== secretHash) {
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }

  const payload = req.body;
  if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
    const txRef = payload.data.tx_ref;
    db.prepare(`
      UPDATE orders SET payment_status='completed', updated_at=datetime('now')
      WHERE payment_ref=?
    `).run(txRef);
    console.log(`✅ Card payment confirmed: ${txRef}`);
  }

  res.json({ received: true });
});

// GET /api/payments/card/verify/:txRef — verify after redirect
router.get('/card/verify/:txRef', requireAuth, async (req, res) => {
  try {
    const response = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${req.params.txRef}`, {
      headers: { 'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}` }
    });
    const data = await response.json();
    if (data.status === 'success' && data.data.status === 'successful') {
      db.prepare(`UPDATE orders SET payment_status='completed', updated_at=datetime('now') WHERE payment_ref=?`)
        .run(req.params.txRef);
      res.json({ success: true, data: data.data });
    } else {
      res.json({ success: false, message: 'Payment not completed yet.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Verification failed.' });
  }
});

module.exports = router;
