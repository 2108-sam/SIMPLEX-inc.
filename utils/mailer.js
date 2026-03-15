// utils/mailer.js — Email notifications via Nodemailer
const nodemailer = require('nodemailer');

function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

// ── ORDER CONFIRMATION EMAIL ──
async function sendOrderConfirmationEmail(order) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const transporter = createTransporter();

  const itemsHtml = order.items.map(i => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${i.product_name}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">KSh ${i.line_total.toLocaleString()}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family:'Josefin Sans',sans-serif;background:#FAF7F2;margin:0;padding:0">
      <div style="max-width:600px;margin:2rem auto;background:#fff;border:1px solid #E4D9CC">
        <!-- Header -->
        <div style="background:#1A1612;padding:2rem;text-align:center">
          <div style="font-family:Georgia,serif;font-size:1.6rem;color:#FAF7F2;letter-spacing:.1em">
            Simplex <span style="color:#C9A84C">Inc.</span>
          </div>
          <div style="font-size:.7rem;letter-spacing:.25em;text-transform:uppercase;color:#C4BEB4;margin-top:.4rem">
            Order Confirmation
          </div>
        </div>

        <!-- Body -->
        <div style="padding:2.5rem">
          <p style="font-size:1rem;color:#1A1612">Dear ${order.customer_name},</p>
          <p style="font-size:.88rem;color:#7A6F65;line-height:1.7">
            Thank you for your purchase! Your order has been confirmed and is being prepared.
          </p>

          <!-- Order Meta -->
          <div style="background:#F0E9DE;padding:1rem 1.5rem;margin:1.5rem 0;border-left:3px solid #C9A84C">
            <div style="font-size:.68rem;letter-spacing:.2em;text-transform:uppercase;color:#8A6B1E;margin-bottom:.5rem">Order Details</div>
            <div style="font-size:.82rem;color:#1A1612"><strong>Order ID:</strong> ${order.id}</div>
            <div style="font-size:.82rem;color:#1A1612;margin-top:.25rem"><strong>Date:</strong> ${order.created_at}</div>
            <div style="font-size:.82rem;color:#1A1612;margin-top:.25rem"><strong>Payment:</strong> ${order.payment_method}</div>
          </div>

          <!-- Items Table -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:1.5rem">
            <thead>
              <tr style="background:#F0E9DE">
                <th style="padding:8px;text-align:left;font-size:.68rem;letter-spacing:.15em;text-transform:uppercase;color:#8A6B1E">Item</th>
                <th style="padding:8px;text-align:center;font-size:.68rem;letter-spacing:.15em;text-transform:uppercase;color:#8A6B1E">Qty</th>
                <th style="padding:8px;text-align:right;font-size:.68rem;letter-spacing:.15em;text-transform:uppercase;color:#8A6B1E">Total</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding:12px 8px;text-align:right;font-weight:600;color:#1A1612">Order Total</td>
                <td style="padding:12px 8px;text-align:right;font-family:Georgia,serif;font-size:1.1rem;font-weight:600;color:#1A1612">
                  KSh ${order.amount.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>

          <p style="font-size:.8rem;color:#7A6F65;line-height:1.7">
            For any queries, contact us on <a href="https://wa.me/254798543248" style="color:#8A6B1E">WhatsApp: +254 798 543 248</a>
            or email <a href="mailto:okochibwire296@gmail.com" style="color:#8A6B1E">okochibwire296@gmail.com</a>.
          </p>
        </div>

        <!-- Footer -->
        <div style="background:#1A1612;padding:1.5rem;text-align:center">
          <div style="font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;color:rgba(255,255,255,.3)">
            © 2026 Simplex Inc. · Nairobi, Kenya
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  // Send to customer
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      order.customer_email,
    subject: `Order Confirmed — ${order.id} | Simplex Inc.`,
    html
  });

  // Send copy to admin
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      process.env.SMTP_USER,
    subject: `New Order ${order.id} — KSh ${order.amount.toLocaleString()} via ${order.payment_method}`,
    html
  });
}

// ── CONTACT NOTIFICATION ──
async function sendContactNotification({ name, email, phone, message }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      process.env.SMTP_USER,
    subject: `New Contact Message from ${name} | Simplex Inc.`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;padding:2rem">
        <h2 style="color:#1A1612">New Contact Message</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email || 'Not provided'}</p>
        <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
        <p><strong>Message:</strong></p>
        <div style="background:#F0E9DE;padding:1rem;border-left:3px solid #C9A84C">${message}</div>
      </div>
    `
  });
}

module.exports = { sendOrderConfirmationEmail, sendContactNotification };
