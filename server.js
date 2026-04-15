// ===================================
// TimeClock 365 — Email Automation
// ===================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');

const config = require('./config');
const emails = require('./emails');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS revisions (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      item_id TEXT,
      comment TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      original_content TEXT,
      summary TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP
    )
  `);

  // Добавляем новые колонки если их нет (safe migration)
  await pool.query(`ALTER TABLE revisions ADD COLUMN IF NOT EXISTS original_content TEXT`);
  await pool.query(`ALTER TABLE revisions ADD COLUMN IF NOT EXISTS summary TEXT`);
  // status can now be: pending | processing | resolved | failed
  await pool.query(`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`);

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
      to: config.VIKA_EMAIL || config.OWNER_EMAIL,
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
// НЕМЕДЛЕННАЯ ОБРАБОТКА ПРАВОК (AI inline)
// ===================================

async function processRevisionImmediately(revisionId, type, itemId, comment, originalContent) {
  try {
    console.log(`🔄 Processing revision ${revisionId} (${type} "${itemId}") ...`);
    await pool.query('UPDATE revisions SET status = $1 WHERE id = $2', ['processing', revisionId]);

    // Получить текущий контент из approvals
    let content = originalContent || '';
    if (!content) {
      const r = await pool.query('SELECT data FROM approvals WHERE item_id = $1', [itemId]);
      if (r.rows[0]) {
        const d = r.rows[0].data;
        content = d.editedContent || d.content || d.description || '';
      }
    }

    if (!content) {
      console.warn(`⚠ Revision ${revisionId}: no content found for "${itemId}"`);
      await pool.query('UPDATE revisions SET status = $1 WHERE id = $2', ['failed', revisionId]);
      return;
    }

    // Формируем промпт под тип контента
    const typeLabel = type === 'landings' ? 'landing page copy' : type === 'posts' ? 'LinkedIn post' : 'content';
    const prompt = `You are a marketing copywriter for TimeClock 365 — a B2B SaaS that combines door access control and time tracking in one system. Target audience: HR Managers, Operations Directors, CEOs at manufacturing and engineering companies (50-500 employees). Brand voice: clear, practical, direct — no buzzwords, no "game-changer".

Your task: revise the ${typeLabel} below based on this feedback from the content manager:

FEEDBACK: "${comment}"

CURRENT CONTENT:
${content}

Rules:
- Return ONLY the revised content, no explanation, no preamble
- Keep the same structure/format as the original
- Preserve all links and HTML if present
- Apply only the changes requested in the feedback`;

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });
    const newContent = message.content[0].text.trim();

    // Краткое описание изменений
    const summaryMsg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 150,
      messages: [{ role: 'user', content: `In one concise sentence (max 20 words), describe what was changed based on this feedback: "${comment}"` }]
    });
    const summary = summaryMsg.content[0].text.trim();

    // Сохранить результат в revisions
    await pool.query(
      'UPDATE revisions SET status = $1, resolved_at = NOW(), summary = $2 WHERE id = $3',
      ['resolved', summary, revisionId]
    );

    // Обновить контент в approvals
    const approvalRows = await pool.query('SELECT * FROM approvals WHERE item_id = $1', [itemId]);
    if (approvalRows.rows[0]) {
      const updatedData = { ...approvalRows.rows[0].data, editedContent: newContent };
      await pool.query(
        'UPDATE approvals SET data = $1, status = $2, updated_at = NOW() WHERE item_id = $3',
        [JSON.stringify(updatedData), 'edited', itemId]
      );
    }

    // Email Вике — правки готовы
    if (config.VIKA_EMAIL) {
      try {
        await transporter.sendMail({
          from: `"TimeClock 365" <${config.GMAIL_USER}>`,
          to: config.VIKA_EMAIL,
          subject: `[TimeClock 365] ✅ Agent revised "${itemId}" — please review`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;">
              <div style="background:#12B76A;padding:16px 24px;border-radius:8px 8px 0 0;">
                <h2 style="color:#fff;margin:0;">✅ Revision complete</h2>
              </div>
              <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-radius:0 0 8px 8px;">
                <p>The agent revised <strong>${itemId}</strong> based on your comment.</p>
                <div style="background:#fffbf0;border-left:4px solid #FF981B;padding:14px;border-radius:0 6px 6px 0;margin:16px 0;">
                  <strong>Your comment:</strong><br>${comment}
                </div>
                <div style="background:#f0faf5;border-left:4px solid #12B76A;padding:14px;border-radius:0 6px 6px 0;margin:16px 0;">
                  <strong>What changed:</strong><br>${summary}
                </div>
                <a href="${RAILWAY_URL}/approvals-page" style="display:inline-block;background:#3479E9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;margin-top:8px;">
                  Review & Approve →
                </a>
              </div>
            </div>
          `,
        });
      } catch(mailErr) {
        console.error('Email error after revision:', mailErr.message);
      }
    }

    console.log(`✓ Revision ${revisionId} complete: ${summary}`);
  } catch (err) {
    console.error(`✗ Revision ${revisionId} failed:`, err.message);
    try {
      await pool.query('UPDATE revisions SET status = $1 WHERE id = $2', ['failed', revisionId]);
    } catch(e2) {}
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
        const { type, index, status, editedContent, approvedAt, previewUrl } = JSON.parse(body);
        const { rows } = await pool.query(
          'SELECT * FROM approvals WHERE type = $1 ORDER BY created_at ASC', [type]
        );
        if (rows[index]) {
          const row = rows[index];
          const updatedData = { ...row.data };
          if (editedContent !== undefined) updatedData.editedContent = editedContent;
          if (approvedAt !== undefined) updatedData.approvedAt = approvedAt;
          if (previewUrl !== undefined) updatedData.previewUrl = previewUrl;
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

  // GET /revisions — список правок лендингов
  } else if (req.method === 'GET' && req.url === '/revisions') {
    try {
      const { rows } = await pool.query('SELECT * FROM revisions ORDER BY created_at DESC');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rows));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }

  // POST /request-revision — запрос правки от пользователя
  } else if (req.method === 'POST' && req.url === '/request-revision') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { type, itemId, comment } = JSON.parse(body);
        // Сохраняем оригинальный контент для сравнения до/после
        let originalContent = '';
        try {
          const orig = await pool.query('SELECT data FROM approvals WHERE item_id = $1', [itemId]);
          if (orig.rows[0]) {
            const d = orig.rows[0].data;
            originalContent = d.editedContent || d.content || d.description || '';
          }
        } catch(e) {}

        const ins = await pool.query(
          'INSERT INTO revisions (type, item_id, comment, status, original_content) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [type, itemId, comment, 'pending', originalContent]
        );
        const revisionId = ins.rows[0].id;
        console.log(`+ Правка #${revisionId}: ${type} "${itemId}" — "${comment.slice(0,50)}"`);

        // Немедленно запускаем обработку (в фоне, не ждём)
        setImmediate(() => processRevisionImmediately(revisionId, type, itemId, comment, originalContent));

        res.writeHead(200); res.end(JSON.stringify({ ok: true, revisionId, processing: true }));
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });

  // POST /revision-done — агент завершил правку
  } else if (req.method === 'POST' && req.url === '/revision-done') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { revisionId, summary, type, itemId, newContent } = JSON.parse(body);
        await pool.query(
          'UPDATE revisions SET status = $1, resolved_at = NOW(), summary = $2 WHERE id = $3',
          ['resolved', summary || '', revisionId]
        );
        // Обновить контент в approvals если передан
        if (newContent && type && itemId) {
          const { rows } = await pool.query('SELECT * FROM approvals WHERE item_id = $1', [itemId]);
          if (rows[0]) {
            const updatedData = { ...rows[0].data, editedContent: newContent };
            await pool.query(
              'UPDATE approvals SET data = $1, status = $2 WHERE item_id = $3',
              [JSON.stringify(updatedData), 'edited', itemId]
            );
          }
        }
        // Уведомление Вике что правка готова — она смотрит и решает
        if (config.VIKA_EMAIL) {
          await transporter.sendMail({
            from: `"TimeClock 365" <${config.GMAIL_USER}>`,
            to: config.VIKA_EMAIL,
            subject: `[TimeClock 365] ✅ Агент внёс правки — проверь`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;">
                <div style="background:#12B76A;padding:16px 24px;border-radius:8px 8px 0 0;">
                  <h2 style="color:#fff;margin:0;">✅ Правки внесены</h2>
                </div>
                <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-radius:0 0 8px 8px;">
                  <p>Агент исправил материал по твоему комментарию. Посмотри и если всё ок — нажми «Одобрить».</p>
                  <div style="background:#f0faf5;border-left:4px solid #12B76A;padding:14px;border-radius:0 6px 6px 0;margin:16px 0;">
                    <strong>Что изменено:</strong><br>${summary}
                  </div>
                  <a href="${RAILWAY_URL}/approvals-page" style="display:inline-block;background:#3479E9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;margin-top:8px;">
                    Проверить и одобрить →
                  </a>
                </div>
              </div>
            `,
          });
        }
        console.log(`✓ Правка завершена: ${type} "${itemId}"`);
        res.writeHead(200); res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });

  // POST /publish-posts — уведомление о выбранных постах
  } else if (req.method === 'POST' && req.url === '/publish-posts') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { selectedIndices, posts } = JSON.parse(body);
        const selectedPosts = selectedIndices.map((i, n) => `
          <div style="background:#f5f7fa;border-left:4px solid #3479E9;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:12px;">
            <strong>Пост ${i + 1}</strong><br>
            <span style="color:#555;font-size:13px;">${(posts[i]?.content || '').slice(0, 200)}...</span>
          </div>
        `).join('');

        // Обновить статус выбранных постов в DB
        for (const idx of selectedIndices) {
          const { rows } = await pool.query(
            'SELECT * FROM approvals WHERE type = $1 ORDER BY created_at ASC', ['posts']
          );
          if (rows[idx]) {
            const updatedData = { ...rows[idx].data, approvedAt: new Date().toISOString() };
            await pool.query(
              'UPDATE approvals SET status = $1, data = $2 WHERE id = $3',
              ['approved', JSON.stringify(updatedData), rows[idx].id]
            );
          }
        }

        // Яне — она публикует в LinkedIn
        await transporter.sendMail({
          from: `"TimeClock 365" <${config.GMAIL_USER}>`,
          to: config.OWNER_EMAIL,
          subject: `[TimeClock 365] 📢 Вика одобрила посты — опубликуй в LinkedIn`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;">
              <div style="background:#3479E9;padding:16px 24px;border-radius:8px 8px 0 0;">
                <h2 style="color:#fff;margin:0;">📢 Посты одобрены Викой</h2>
              </div>
              <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-radius:0 0 8px 8px;">
                <p>Вика выбрала <strong>${selectedIndices.length}</strong> ${selectedIndices.length === 1 ? 'пост' : 'поста'} для публикации (№ ${selectedIndices.map(i => i+1).join(', ')}).</p>
                <p style="margin-bottom:16px;color:#555;">Скопируй текст каждого поста и опубликуй в LinkedIn:</p>
                ${selectedPosts}
                <a href="${RAILWAY_URL}/approvals-page" style="display:inline-block;background:#3479E9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;">
                  Открыть согласование →
                </a>
              </div>
            </div>
          `,
        });
        console.log(`📢 Выбрано постов: ${selectedIndices.length} (${selectedIndices.map(i=>i+1).join(', ')})`);
        res.writeHead(200); res.end(JSON.stringify({ ok: true }));
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
