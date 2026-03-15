# Simplex Inc. — Backend API

Full Node.js + Express + SQLite backend for Simplex Inc. luxury accessories store.

---

## 📁 Project Structure

```
simplex-backend/
├── server.js              ← Main entry point
├── .env                   ← Your secrets & config (never commit this)
├── package.json
├── db/
│   ├── database.js        ← SQLite setup & seeding
│   └── simplex.db         ← Auto-created on first run
├── routes/
│   ├── auth.js            ← Register, Login, Logout, Profile
│   ├── products.js        ← Product catalog CRUD
│   ├── orders.js          ← Orders + full item storage
│   ├── payments.js        ← PayPal, M-Pesa, Card (Flutterwave)
│   ├── users.js           ← Admin user management
│   └── contact.js         ← Contact form
├── middleware/
│   └── auth.js            ← JWT authentication
└── utils/
    └── mailer.js          ← Email notifications (Nodemailer)
```

---

## ⚡ Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Edit `.env` with your real credentials:
```env
JWT_SECRET=your_long_random_secret_here
ADMIN_EMAIL=okochibwire296@gmail.com
ADMIN_PASSWORD=admin2026
SMTP_PASS=your_gmail_app_password
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_secret
MPESA_CONSUMER_KEY=your_daraja_key
MPESA_CONSUMER_SECRET=your_daraja_secret
FLW_SECRET_KEY=your_flutterwave_secret
FRONTEND_URL=https://yourdomain.com
```

### 3. Start the server
```bash
# Production
npm start

# Development (auto-restart)
npm run dev
```

### 4. Test it's working
```
GET http://localhost:3000/api/health
```
Should return: `{ "status": "online", "service": "Simplex Inc. API" }`

---

## 🔑 API Endpoints

### Auth
| Method | Endpoint              | Auth     | Description           |
|--------|-----------------------|----------|-----------------------|
| POST   | /api/auth/register    | Public   | Create account        |
| POST   | /api/auth/login       | Public   | Sign in               |
| POST   | /api/auth/logout      | Token    | Sign out              |
| GET    | /api/auth/me          | Token    | Get my profile        |
| PUT    | /api/auth/me          | Token    | Update profile        |
| PUT    | /api/auth/password    | Token    | Change password       |

### Products
| Method | Endpoint              | Auth     | Description           |
|--------|-----------------------|----------|-----------------------|
| GET    | /api/products         | Public   | All products          |
| GET    | /api/products/:id     | Public   | Single product        |
| POST   | /api/products         | Admin    | Add product           |
| PUT    | /api/products/:id     | Admin    | Update product        |
| DELETE | /api/products/:id     | Admin    | Remove product        |

### Orders
| Method | Endpoint                  | Auth     | Description           |
|--------|---------------------------|----------|-----------------------|
| POST   | /api/orders               | Token    | Place order           |
| GET    | /api/orders/mine          | Token    | My order history      |
| GET    | /api/orders/:id           | Token    | Single order          |
| GET    | /api/orders               | Admin    | All orders            |
| PATCH  | /api/orders/:id/status    | Admin    | Update order status   |
| GET    | /api/orders/admin/stats   | Admin    | Dashboard stats       |

### Payments
| Method | Endpoint                        | Auth   | Description              |
|--------|---------------------------------|--------|--------------------------|
| GET    | /api/payments/paypal/config     | Public | Get PayPal client ID     |
| POST   | /api/payments/paypal/create-order | Token | Create PayPal order    |
| POST   | /api/payments/paypal/capture    | Token  | Capture PayPal payment   |
| POST   | /api/payments/mpesa/stk         | Token  | Trigger M-Pesa STK push  |
| POST   | /api/payments/mpesa/callback    | Public | Safaricom webhook        |
| POST   | /api/payments/card/initiate     | Token  | Start Flutterwave payment|
| POST   | /api/payments/card/webhook      | Public | Flutterwave webhook      |
| GET    | /api/payments/card/verify/:ref  | Token  | Verify card payment      |

### Contact & Users
| Method | Endpoint              | Auth     | Description           |
|--------|-----------------------|----------|-----------------------|
| POST   | /api/contact          | Public   | Submit contact form   |
| GET    | /api/contact          | Admin    | All messages          |
| GET    | /api/users            | Admin    | All users             |
| GET    | /api/users/:id        | Admin    | User + their orders   |
| DELETE | /api/users/:id        | Admin    | Remove user           |

---

## 💳 Payment Setup

### PayPal
1. Go to [developer.paypal.com](https://developer.paypal.com)
2. Create an app → get Client ID & Secret
3. Set `PAYPAL_MODE=sandbox` for testing, `live` for real payments
4. Your receiver email: `okochibwire296@gmail.com`

### M-Pesa (Safaricom Daraja)
1. Register at [developer.safaricom.co.ke](https://developer.safaricom.co.ke)
2. Create an app → get Consumer Key & Secret
3. Get your Paybill/Till Shortcode and Passkey
4. Set your callback URL (must be HTTPS): `https://yourdomain.com/api/payments/mpesa/callback`
5. Use `MPESA_ENV=sandbox` for testing, `production` for live

### Card (Flutterwave)
1. Register at [flutterwave.com](https://flutterwave.com)
2. Go to Settings → API Keys → get Public, Secret & Encryption keys
3. Set webhook URL in Flutterwave dashboard: `https://yourdomain.com/api/payments/card/webhook`
4. Flutterwave supports Visa, Mastercard, MPESA, and more

---

## 📧 Email Setup (Gmail)
1. Enable 2-Step Verification on your Gmail
2. Go to Google Account → Security → App Passwords
3. Generate an App Password for "Mail"
4. Put that 16-character password in `SMTP_PASS` (NOT your real Gmail password)

---

## 🌍 Deployment on Hostinger

1. **Upload files** via Hostinger File Manager or FTP
2. **Install Node.js** from Hostinger control panel (Node.js Manager)
3. **Set environment variables** in Hostinger's Node.js app settings
4. **Set entry point** to `server.js`
5. **Install dependencies**: run `npm install` in Hostinger terminal
6. **Start the app** from Node.js Manager

For M-Pesa callback to work, your domain **must have HTTPS** (Hostinger provides free SSL).

---

## 🗄️ Database

The database (`simplex.db`) is created automatically on first run with:
- All tables (users, products, orders, order_items, contact_messages)
- 12 seeded products
- Admin account pre-created

**Admin login:**
- Email: `okochibwire296@gmail.com`
- Password: `admin2026`

---

## 🔒 Security Features
- Passwords hashed with **bcrypt** (10 rounds)
- JWT tokens (7-day expiry)
- Token blacklisting on logout
- Rate limiting (100 req/15min general, 10 req/15min auth)
- Helmet.js security headers
- CORS restricted to your frontend domain
- Server-side order total calculation (never trust client)
- SQL injection protected via parameterized queries

---

## 📞 Contact
- **WhatsApp**: +254 798 543 248
- **Email**: okochibwire296@gmail.com
- **Facebook**: Okochi Bwire
- **Instagram**: @bwireeee
- **X**: @Sammie35162444
