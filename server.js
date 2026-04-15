// ===================================
// TimeClock 365 — Email Automation
// ===================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');

const config = require('./config');
const emails = require('./emails');

// ===================================
// БАЗА ДАННЫХ — PostgreSQL
// ===================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Создаём таблицы при старте
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      source TEXT DEFAULT 'direct',
      subscribed_at TIMESTAMP DEFAULT NOW(),
      email1_sent TIMESTAMP,
      email2_sent TIMESTAMP,
      email3_sent TIMESTAMP,
      completed BOOLEAN DEFAULT FALSE,
      status TEXT DEFAULT 'Новый',
      notes TEXT DEFAULT ''
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS approvals (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      item_id TEXT UNIQUE,
      data JSONB NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  console.log('✓ База данных инициализирована');
}

// ===================================
// ОТПРАВКА EMAIL
// ===================================

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.GMAIL_USER,
    pass: config.GMAIL_APP_PASSWORD,
  },
});

async function sendEmail(to, name, emailNumber) {
  const emailData =
    emailNumber === 1 ? emails.email1(name) :
    emailNumber === 2 ? emails.email2(name) :
    emails.email3(name);

  try {
    await transporter.sendMail({
      from: `"${config.FROM_NAME}" <${config.GMAIL_USER}>`,
      to: to,
      subject: emailData.subject,
      html: emailData.html,
    });
    console.log(`✓ Email ${emailNumber} → ${to}`);
    return true;
  } catch (err) {
    console.error(`✗ Email ${emailNumber} ошибка:`, err.message);
    return false;
  }
}

// ===================================
// ПРОВЕРКА РАСПИСАНИЯ ПИСЕМ
// ===================================

async function checkAndSendEmails() {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM subscribers WHERE completed = FALSE'
    );
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    for (const sub of rows) {
      const subscribedAt = new Date(sub.subscribed_at).getTime();

      if (!sub.email1_sent) {
        const ok = await sendEmail(sub.email, sub.name, 1);
        if (ok) await pool.query(
          'UPDATE subscribers SET email1_sent = NOW() WHERE id = $1', [sub.id]
        );
      } else if (!sub.email2_sent && now - subscribedAt >= dayInMs) {
        const ok = await sendEmail(sub.email, sub.name, 2);
        if (ok) await pool.query(
          'UPDATE subscribers SET email2_sent = NOW() WHERE id = $1', [sub.id]
        );
      } else if (!sub.email3_sent && now - subscribedAt >= 3 * dayInMs) {
        const ok = await sendEmail(sub.email, sub.name, 3);
        if (ok) await pool.query(
          'UPDATE subscribers SET email3_sent = NOW(), completed = TRUE WHERE id = $1', [sub.id]
        );
      }
    }
  } catch (err) {
    console.error('Ошибка проверки расписания:', err.message);
  }
}

// ===================================
// УВЕДОМЛЕНИЕ — новое на согласование
// ===================================

const TYPE_LABELS = {
  posts: 'LinkedIn пост', landings: 'Лендинг', emails: 'Письмо',
  competitors: 'Анализ конкурентов', seo: 'SEO идеи',
  weekly: 'Недельный отчёт', monthly: 'Месячный отчёт',
};

const RAILWAY_URL = 'https://timeclock365-crm-production.up.railway.app';

async function sendApprovalNotification(type, item) {
  const label = TYPE_LABELS[type] || type;
  const title = item.title || item.subject || item.id || label;
  const insightsHtml = (item.insights && item.insights.length)
    ? `<ul style="padding-left:20px;margin:12px 0;">${item.insights.map(i =>
        `<li style="margin-bottom:6px;color:#444;">${i}</li>`).join('')}</ul>`
    : '';

  try {
    await transporter.sendMail({
      from: `"TimeClock 365" <${config.GMAIL_USER}>`,
      to: [config.OWNER_EMAIL, config.VIKA_EMAIL].filter(Boolean).join(','),
      subject: `[TimeClock 365] Новое на согласование: ${label}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#3479E9;padding:16px 24px;border-radius:8px 8px 0 0;">
            <h2 style="color:#fff;margin:0;">TimeClock 365</h2>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-radius:0 0 8px 8px;">
            <p style="color:#555;">Агент добавил новый элемент на согласование:</p>
            <div style="background:#f5f7fa;border-left:4px solid #3479E9;padding:14px 18px;border-radius:0 6px 6px 0;margin-bottom:16px;">
              <div style="font-weight:600;font-size:15px;">${title}</div>
              <div style="font-size:13px;color:#888;margin-top:4px;">${label} · ${item.date || new Date().toISOString().slice(0,10)}</div>
            </div>
            ${insightsHtml}
            <a href="${RAILWAY_URL}/approvals-page"
               style="display:inline-block;background:#3479E9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;">
              Открыть согласование →
            </a>
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.error('Ошибка уведомления:', err.message);
  }
}

// ===================================
// HTTP СЕРВЕР
// ===================================

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // GET / или /dashboard — CRM
  if (req.method === 'GET' && (req.url === '/' || req.url === '/dashboard')) {
    const html = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);

  // GET /approvals-page
  } else if (req.method === 'GET' && req.url === '/approvals-page') {
    const html = fs.readFileSync(path.join(__dirname, 'approvals.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);

  // GET /subscribers — все лиды
  } else if (req.method === 'GET' && req.url === '/subscribers') {
    try {
      const { rows } = await pool.query('SELECT * FROM subscribers ORDER BY subscribed_at DESC');
      const formatted = rows.map(r => ({
        name: r.name, email: r.email, source: r.source,
        subscribedAt: r.subscribed_at,
        email1Sent: r.email1_sent, email2Sent: r.email2_sent, email3Sent: r.email3_sent,
        completed: r.completed, status: r.status, notes: r.notes
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formatted));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }

  // GET /approvals — данные согласования
  } else if (req.method === 'GET' && req.url === '/approvals') {
    try {
      const { rows } = await pool.query('SELECT * FROM approvals ORDER BY created_at ASC');
      const result = { posts: [], landings: [], emails: [], competitors: [], seo: [], weekly: [], monthly: [] };
      for (const row of rows) {
        const type = row.type;
        if (!result[type]) result[type] = [];
        result[type].push({ ...row.data, status: row.status });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }

  // POST /subscribe — новый лид
  } else if (req.method === 'POST' && req.url === '/subscribe') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { name, email, source } = JSON.parse(body);
        if (!email || !name) {
          res.writeHead(400); res.end(JSON.stringify({ error: 'Нужны name и email' })); return;
        }
        await pool.query(
          'INSERT INTO subscribers (name, email, source) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
          [name, email, source || 'direct']
        );
        console.log(`+ Новый лид: ${name} (${email})`);
        checkAndSendEmails();
        res.writeHead(200); res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });

  // POST /update-lead
  } else if (req.method === 'POST' && req.url === '/update-lead') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { email, status, notes } = JSON.parse(body);
        await pool.query(
          'UPDATE subscribers SET status = COALESCE($1, status), notes = COALESCE($2, notes) WHERE email = $3',
          [status, notes, email]
        );
        res.writeHead(200); res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });

  // POST /approve — обновить статус
  } else if (req.method === 'POST' && req.url === '/approve') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { type, index, status, editedContent, approvedAt } = JSON.parse(body);
        const { rows } = await pool.query(
          'SELECT * FROM approvals WHERE type = $1 ORDER BY created_at ASC', [type]
        );
        if (rows[index]) {
          const row = rows[index];
          const updatedData = { ...row.data };
          if (editedContent !== undefined) updatedData.editedContent = editedContent;
          if (approvedAt !== undefined) updatedData.approvedAt = approvedAt;
          await pool.query(
            'UPDATE approvals SET status = $1, data = $2 WHERE id = $3',
            [status || row.status, JSON.stringify(updatedData), row.id]
          );
        }
        res.writeHead(200); res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });

  // POST /add-approval — агент добавляет контент
  } else if (req.method === 'POST' && req.url === '/add-approval') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { type, item } = JSON.parse(body);
        const result = await pool.query(
          'INSERT INTO approvals (type, item_id, data, status) VALUES ($1, $2, $3, $4) ON CONFLICT (item_id) DO NOTHING RETURNING id',
          [type, item.id, JSON.stringify(item), 'pending']
        );
        const added = result.rows.length > 0;
        if (added) {
          console.log(`+ Согласование: ${type} "${item.id}"`);
          sendApprovalNotification(type, item);
        }
        res.writeHead(200); res.end(JSON.stringify({ ok: true, added }));
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });

  } else {
    res.writeHead(404); res.end('Not found');
  }
});

// ===================================
// ЗАПУСК
// ===================================

initDB().then(() => {
  server.listen(config.PORT, () => {
    console.log(`✓ Сервер запущен на порту ${config.PORT}`);
  });
  setInterval(checkAndSendEmails, 15 * 60 * 1000);
  checkAndSendEmails();
}).catch(err => {
  console.error('Ошибка инициализации БД:', err.message);
  // Запускаем сервер даже без БД
  server.listen(config.PORT, () => {
    console.log(`✓ Сервер запущен (без БД) на порту ${config.PORT}`);
  });
});
