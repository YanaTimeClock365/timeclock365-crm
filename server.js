// ===================================
// TimeClock 365 — Email Automation
// ===================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const config = require('./config');
const emails = require('./emails');

// LinkedIn credentials
const LI_CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID     || '78k2r88niesi98';
const LI_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || '';
const LI_REDIRECT_URI  = 'https://timeclock365-crm-production.up.railway.app/linkedin-callback';
const LI_SCOPES        = 'openid profile w_member_social';

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
  await pool.query(`ALTER TABLE approvals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`);

  // Таблица настроек (токены и т.д.)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
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
// IMAGE — Unsplash (реальные фото) + GitHub
// ===================================

const GITHUB_TOKEN  = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER  = 'YanaTimeClock365';
const GITHUB_REPO   = 'timeclock365-landings';
const GITHUB_FOLDER = 'images/auto';
const GITHUB_PAGES  = `https://yanatimeclock365.github.io/timeclock365-landings`;

// Ключевые слова для Unsplash по теме поста
function buildUnsplashKeywords(postText) {
  const t = postText.toLowerCase();
  if (t.includes('access') || t.includes('door') || t.includes('fingerprint') || t.includes('biometric'))
    return 'office,security,entrance,access-control';
  if (t.includes('buddy') || t.includes('punch') || t.includes('swipe'))
    return 'office,team,employee,workplace';
  if (t.includes('payroll') || t.includes('timesheet') || t.includes('friday') || t.includes('hr manager'))
    return 'hr,payroll,office,laptop,business';
  if (t.includes('roi') || t.includes('cost') || t.includes('saving') || t.includes('money'))
    return 'business,growth,finance,success';
  if (t.includes('manufactur') || t.includes('factory') || t.includes('plant') || t.includes('floor'))
    return 'manufacturing,factory,industrial,workers';
  if (t.includes('compliance') || t.includes('audit') || t.includes('dispute') || t.includes('legal'))
    return 'business,documents,professional,meeting';
  return 'office,business,professional,team,workplace';
}

// Скачать фото через Pexels API
async function downloadImageFromPexels(keywords, width, height) {
  const PEXELS_KEY = process.env.PEXELS_API_KEY || '';
  if (!PEXELS_KEY) throw new Error('PEXELS_API_KEY не установлен');

  const orientation = width >= height ? 'landscape' : 'portrait';
  const query = encodeURIComponent(keywords.split(',')[0].trim());

  // Ищем фото
  const searchRes = await httpsReq({
    hostname: 'api.pexels.com',
    path: `/v1/search?query=${query}&per_page=5&orientation=${orientation}&size=large`,
    method: 'GET',
    headers: { 'Authorization': PEXELS_KEY }
  });
  const data = JSON.parse(searchRes.body);
  if (!data.photos || !data.photos.length) throw new Error('Pexels: нет фото для ' + query);

  // Берём случайное из первых 5
  const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
  const imgUrl = orientation === 'portrait'
    ? (photo.src.portrait || photo.src.large)
    : (photo.src.landscape || photo.src.large2x || photo.src.large);

  // Скачиваем картинку (следуем редиректам)
  return new Promise((resolve, reject) => {
    const follow = (url, depth) => {
      if (depth > 5) { reject(new Error('Too many redirects')); return; }
      https.get(url, { headers: { 'User-Agent': 'TimeClock365-Bot/1.0' } }, res => {
        if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
          follow(res.headers.location, depth + 1); return;
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    follow(imgUrl, 0);
  });
}

// Загрузить картинку в GitHub репозиторий через API
async function uploadImageToGitHub(imageBuffer, filename) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN не установлен');
  const filePath = `${GITHUB_FOLDER}/${filename}`;
  const content = imageBuffer.toString('base64');

  // Проверяем существует ли файл (нужен SHA для обновления)
  let sha = '';
  try {
    const check = await httpsReq({
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'TimeClock365-Bot' }
    });
    if (check.status === 200) sha = JSON.parse(check.body).sha;
  } catch(e) {}

  const body = JSON.stringify({
    message: `Auto-generated banner: ${filename}`,
    content,
    ...(sha ? { sha } : {})
  });

  const r = await httpsReq({
    hostname: 'api.github.com',
    path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': 'TimeClock365-Bot'
    }
  }, body);

  if (r.status !== 201 && r.status !== 200) throw new Error(`GitHub upload failed: ${r.status} ${r.body.slice(0,200)}`);
  return `${GITHUB_PAGES}/${filePath}`;
}

// Главная функция: берём фото с Pexels и загружаем на GitHub
async function generateAndUploadBanner(postText, postId, width, height) {
  try {
    const w = width || 1200;
    const h = height || 628;
    const keywords = buildUnsplashKeywords(postText);
    console.log(`📸 Pexels фото для "${postId}": [${keywords}] ${w}×${h}`);
    const imgBuffer = await downloadImageFromPexels(keywords, w, h);
    const filename = `${postId}.jpg`;
    const url = await uploadImageToGitHub(imgBuffer, filename);
    console.log(`✓ Фото загружено: ${url}`);
    return url;
  } catch(e) {
    console.error('Ошибка загрузки фото:', e.message);
    return null;
  }
}

// ===================================
// LINKEDIN HELPERS
// ===================================

// Универсальный HTTPS запрос
function httpsReq(options, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 15000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// Получить токен из БД
async function getLinkedInToken() {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'linkedin_token'");
    return r.rows[0]?.value || process.env.LINKEDIN_ACCESS_TOKEN || null;
  } catch(e) { return process.env.LINKEDIN_ACCESS_TOKEN || null; }
}

// Получить person ID из БД
async function getLinkedInPersonId() {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'linkedin_person_id'");
    return r.rows[0]?.value || process.env.LINKEDIN_PERSON_ID || null;
  } catch(e) { return process.env.LINKEDIN_PERSON_ID || null; }
}

async function postToLinkedIn(text, imageUrl) {
  const token = await getLinkedInToken();
  const personId = await getLinkedInPersonId();

  if (!token || !personId) {
    console.log('⚠ LinkedIn token или person ID не установлен — пропускаем');
    return { ok: false, reason: 'no_credentials' };
  }

  const SITE_URL = 'https://timeclock365.com';
  const SITE_TITLE = 'TimeClock 365 — Door Access Control + Time Tracking';
  const SITE_DESC = 'One system for access control and time tracking. Built for engineering and technical companies.';

  // Если есть своя картинка — загружаем на LinkedIn
  let imageAsset = null;
  if (imageUrl) {
    try {
      imageAsset = await uploadImageToLinkedIn(token, personId, imageUrl);
    } catch(e) { console.log('Image upload failed, will use article preview:', e.message); }
  }

  let shareContent;
  if (imageAsset) {
    // Пост с загруженной картинкой + ссылка в тексте
    shareContent = {
      shareCommentary: { text: text + `\n\n${SITE_URL}` },
      shareMediaCategory: 'IMAGE',
      media: [{ status: 'READY', media: imageAsset }]
    };
  } else {
    // Пост со ссылкой — LinkedIn подтянет OG-картинку с сайта
    shareContent = {
      shareCommentary: { text },
      shareMediaCategory: 'ARTICLE',
      media: [{
        status: 'READY',
        originalUrl: SITE_URL,
        title: { text: SITE_TITLE },
        description: { text: SITE_DESC }
      }]
    };
  }

  const postBody = JSON.stringify({
    author: `urn:li:person:${personId}`,
    lifecycleState: 'PUBLISHED',
    specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
  });

  try {
    const r = await httpsReq({
      hostname: 'api.linkedin.com', path: '/v2/ugcPosts', method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postBody),
        'X-Restli-Protocol-Version': '2.0.0'
      }
    }, postBody);
    const ok = r.status === 201;
    console.log(`${ok?'✓':'✗'} LinkedIn post: ${r.status} ${ok?'':'body:'+r.body.slice(0,200)}`);
    return { ok, status: r.status };
  } catch(e) {
    console.error('LinkedIn error:', e.message);
    return { ok: false, reason: e.message };
  }
}

// Загрузка картинки на LinkedIn (для постов с фото)
async function uploadImageToLinkedIn(token, personId, imageUrl) {
  // Шаг 1: регистрируем upload
  const regBody = JSON.stringify({
    registerUploadRequest: {
      owner: `urn:li:person:${personId}`,
      recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
      serviceRelationships: [{ identifier: 'urn:li:userGeneratedContent', relationshipType: 'OWNER' }]
    }
  });
  const regRes = await httpsReq({
    hostname: 'api.linkedin.com', path: '/v2/assets?action=registerUpload', method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(regBody) }
  }, regBody);
  const regData = JSON.parse(regRes.body);
  const uploadUrl = regData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const asset = regData.value?.asset;
  if (!uploadUrl || !asset) throw new Error('No upload URL from LinkedIn');

  // Шаг 2: скачиваем картинку
  const imgData = await new Promise((resolve, reject) => {
    https.get(imageUrl, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });

  // Шаг 3: загружаем на LinkedIn
  const uploadUri = new URL(uploadUrl);
  await httpsReq({
    hostname: uploadUri.hostname, path: uploadUri.pathname + uploadUri.search, method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'image/jpeg', 'Content-Length': imgData.length }
  }, imgData);

  return asset;
}

// ===================================
// HTTP СЕРВЕР
// ===================================

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  handleRequest(req, res).catch(err => {
    console.error('Unhandled error:', err.message);
    if (!res.headersSent) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
  });
});

async function handleRequest(req, res) {

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

  // GET /vika — страница согласования постов для Вики
  } else if (req.method === 'GET' && req.url === '/vika') {
    const html = fs.readFileSync(path.join(__dirname, 'vika.html'), 'utf8');
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
        const { type, index, status, editedContent, approvedAt, previewUrl, imageUrl } = JSON.parse(body);
        const { rows } = await pool.query(
          'SELECT * FROM approvals WHERE type = $1 ORDER BY created_at ASC', [type]
        );
        if (rows[index]) {
          const row = rows[index];
          const updatedData = { ...row.data };
          if (editedContent !== undefined) updatedData.editedContent = editedContent;
          if (approvedAt !== undefined) updatedData.approvedAt = approvedAt;
          if (previewUrl !== undefined) updatedData.previewUrl = previewUrl;
          if (imageUrl !== undefined) updatedData.imageUrl = imageUrl;

          // Автопостинг в LinkedIn когда пост одобрен
          let linkedInResult = null;
          if (type === 'posts' && status === 'approved') {
            const text = updatedData.editedContent || row.data.editedContent || row.data.content || '';
            linkedInResult = await postToLinkedIn(text, imageUrl || null);
            if (linkedInResult.ok) {
              updatedData.publishedAt = new Date().toISOString();
              updatedData.linkedInPosted = true;
            }
          }

          const finalStatus = (type === 'posts' && status === 'approved' && linkedInResult?.ok)
            ? 'published' : (status || row.status);

          await pool.query(
            'UPDATE approvals SET status = $1, data = $2 WHERE id = $3',
            [finalStatus, JSON.stringify(updatedData), row.id]
          );

          res.writeHead(200); res.end(JSON.stringify({
            ok: true,
            linkedIn: linkedInResult
          }));
        } else {
          res.writeHead(200); res.end(JSON.stringify({ ok: true }));
        }
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

          // Автогенерация баннера для постов LinkedIn
          if (type === 'posts' && GITHUB_TOKEN) {
            const postText = item.content || item.editedContent || '';
            generateAndUploadBanner(postText, item.id).then(async imageUrl => {
              if (imageUrl) {
                const { rows } = await pool.query('SELECT data FROM approvals WHERE item_id = $1', [item.id]);
                if (rows[0]) {
                  const updated = { ...rows[0].data, imageUrl };
                  await pool.query('UPDATE approvals SET data = $1 WHERE item_id = $2', [JSON.stringify(updated), item.id]);
                  console.log(`✓ Баннер прикреплён к посту "${item.id}"`);
                }
              }
            }).catch(e => console.error('Banner gen error:', e.message));
          }
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

        await pool.query(
          'INSERT INTO revisions (type, item_id, comment, status, original_content) VALUES ($1, $2, $3, $4, $5)',
          [type, itemId, comment, 'pending', originalContent]
        );
        console.log(`+ Правка: ${type} "${itemId}" — "${comment.slice(0,50)}"`);
        res.writeHead(200); res.end(JSON.stringify({ ok: true }));
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
        // Сразу отвечаем — email отправляем в фоне (не блокируем ответ)
        res.writeHead(200); res.end(JSON.stringify({ ok: true }));
        // Уведомление Вике что правка готова — она смотрит и решает
        if (config.VIKA_EMAIL) {
          transporter.sendMail({
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
          }).catch(e => console.error('Email error:', e.message));
        }
        console.log(`✓ Правка завершена: ${type} "${itemId}"`);
      } catch(e) {
        console.error('revision-done error:', e.message);
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

  // POST /save-revision — простое сохранение результата правки (без email, сразу отвечает)
  } else if (req.method === 'POST' && req.url === '/save-revision') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      try {
        const { revisionId, summary, type, itemId, newContent } = JSON.parse(body);
        await pool.query(
          'UPDATE revisions SET status = $1, resolved_at = NOW(), summary = $2 WHERE id = $3',
          ['resolved', summary || '', revisionId]
        );
        if (newContent && itemId) {
          const { rows } = await pool.query('SELECT data FROM approvals WHERE item_id = $1', [itemId]);
          if (rows[0]) {
            const updated = { ...rows[0].data, editedContent: newContent };
            await pool.query(
              'UPDATE approvals SET data = $1, status = $2 WHERE item_id = $3',
              [JSON.stringify(updated), 'edited', itemId]
            );
          }
        }
        res.end(JSON.stringify({ ok: true }));
        console.log(`✓ save-revision: ${type} "${itemId}" rev#${revisionId}`);
      } catch(e) {
        res.end(JSON.stringify({ error: e.message }));
        console.error('save-revision error:', e.message);
      }
    });

  // GET /linkedin-auth — редирект на LinkedIn для авторизации
  } else if (req.method === 'GET' && req.url === '/linkedin-auth') {
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code`
      + `&client_id=${LI_CLIENT_ID}`
      + `&redirect_uri=${encodeURIComponent(LI_REDIRECT_URI)}`
      + `&scope=${encodeURIComponent(LI_SCOPES)}`;
    res.writeHead(302, { Location: url }); res.end();

  // GET /linkedin-callback — получает токен после авторизации
  } else if (req.method === 'GET' && req.url.startsWith('/linkedin-callback')) {
    const qs = new URL(req.url, 'https://x').searchParams;
    const code = qs.get('code');
    if (!code) { res.writeHead(400); res.end('No code'); return; }
    try {
      // Обмен code → access_token
      const body = `grant_type=authorization_code&code=${encodeURIComponent(code)}`
        + `&redirect_uri=${encodeURIComponent(LI_REDIRECT_URI)}`
        + `&client_id=${encodeURIComponent(LI_CLIENT_ID)}&client_secret=${encodeURIComponent(LI_CLIENT_SECRET)}`;
      const tokenRes = await httpsReq({
        hostname: 'www.linkedin.com', path: '/oauth/v2/accessToken', method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
      }, body);
      const tokenData = JSON.parse(tokenRes.body);
      const token = tokenData.access_token;
      console.log('Token response:', JSON.stringify({ scope: tokenData.scope, has_id_token: !!tokenData.id_token, keys: Object.keys(tokenData) }));
      if (!token) throw new Error('No token: ' + tokenRes.body);

      // Извлечь sub из id_token (JWT) если есть — для OpenID Connect
      let personIdFromJwt = '';
      if (tokenData.id_token) {
        try {
          const payload = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64url').toString());
          personIdFromJwt = payload.sub || '';
          console.log('JWT payload sub:', personIdFromJwt, 'name:', payload.name);
        } catch(e) { console.log('JWT parse error:', e.message); }
      }

      // Получить member ID через /v2/userinfo (openid profile)
      let personId = '', personName = '', uiDebug = '';
      try {
        const uiRes = await httpsReq({
          hostname: 'api.linkedin.com', path: '/v2/userinfo', method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        uiDebug = `status=${uiRes.status} body=${uiRes.body.slice(0,200)}`;
        console.log('userinfo:', uiDebug);
        const ui = JSON.parse(uiRes.body);
        personId = ui.sub || personIdFromJwt || '';
        personName = ui.name || `${ui.given_name||''} ${ui.family_name||''}`.trim();
        if (personId) console.log(`✓ LinkedIn member: ${personName} (${personId})`);
      } catch(e) { uiDebug = 'error: ' + e.message; console.log('userinfo error:', e.message); }
      // Если userinfo не дал ID — берём из JWT
      if (!personId && personIdFromJwt) { personId = personIdFromJwt; }

      // Сохранить токен и person ID в БД
      await pool.query(`INSERT INTO settings(key,value,updated_at) VALUES('linkedin_token',$1,NOW()) ON CONFLICT(key) DO UPDATE SET value=$1,updated_at=NOW()`, [token]);
      if (personId) {
        await pool.query(`INSERT INTO settings(key,value,updated_at) VALUES('linkedin_person_id',$1,NOW()) ON CONFLICT(key) DO UPDATE SET value=$1,updated_at=NOW()`, [personId]);
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <style>body{font-family:Arial,sans-serif;max-width:600px;margin:60px auto;text-align:center;}
        .ok{color:#12B76A;font-size:48px;} h2{color:#0d1117;} p{color:#555;}</style></head><body>
        <div class="ok">✓</div>
        <h2>LinkedIn connected!</h2>
        <p>Аккаунт: <strong>${personName||personId||'—'}</strong></p>
        <p>${personId ? '✓ Member ID сохранён. Посты будут публиковаться автоматически.' : '⚠ Member ID не найден.'}</p>
        <p style="font-size:12px;color:#999;word-break:break-all;">${uiDebug}</p>
        <p style="margin-top:32px;"><a href="/approvals-page" style="background:#3479E9;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Go to Approvals →</a></p>
      </body></html>`);
    } catch(e) {
      console.error('LinkedIn OAuth error:', e.message);
      res.writeHead(500); res.end('OAuth error: ' + e.message);
    }

  // GET /linkedin-whoami — узнать member ID из токена
  } else if (req.method === 'GET' && req.url === '/linkedin-whoami') {
    const token = await getLinkedInToken();
    try {
      // Пробуем /v2/me для получения member ID
      const meRes = await httpsReq({
        hostname: 'api.linkedin.com', path: '/v2/me', method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' }
      });
      // Также пробуем /v2/userinfo
      const uiRes = await httpsReq({
        hostname: 'api.linkedin.com', path: '/v2/userinfo', method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ me_status: meRes.status, me: meRes.body, userinfo_status: uiRes.status, userinfo: uiRes.body }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }

  // GET /test-claude — проверить Claude API
  } else if (req.method === 'GET' && req.url === '/test-claude') {
    try {
      const result = await callClaude('Reply with exactly: OK');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result, key_set: !!ANTHROPIC_KEY, key_prefix: ANTHROPIC_KEY.slice(0,8) }));
    } catch(e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message, key_set: !!ANTHROPIC_KEY }));
    }

  // GET /linkedin-test — тестовый пост в LinkedIn
  } else if (req.method === 'GET' && req.url === '/linkedin-test') {
    const result = await postToLinkedIn('🧪 Тест автопостинга TimeClock 365. Если видишь это — LinkedIn интеграция работает! #TimeClock365');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));

  // POST /gen-banner — сгенерировать баннер с кастомными размерами для конкретного поста
  } else if (req.method === 'POST' && req.url === '/gen-banner') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        if (!GITHUB_TOKEN) { res.writeHead(400); res.end(JSON.stringify({ error: 'No GITHUB_TOKEN' })); return; }
        const { itemId, prompt, width, height } = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Генерация запущена...' }));

        (async () => {
          const w = width || 1200;
          const h = height || 628;
          // prompt используем как keywords для Unsplash (или берём из текста поста)
          let keywords = prompt || '';
          if (!keywords) {
            const { rows: postRows } = await pool.query('SELECT data FROM approvals WHERE item_id = $1', [itemId]);
            const postText = postRows[0]?.data?.editedContent || postRows[0]?.data?.content || '';
            keywords = buildUnsplashKeywords(postText);
          }
          const imgBuffer = await downloadImageFromPexels(keywords, w, h);
          const filename = `${itemId}-v.jpg`;
          const imageUrl = await uploadImageToGitHub(imgBuffer, filename);
          const { rows } = await pool.query('SELECT data FROM approvals WHERE item_id = $1', [itemId]);
          if (rows[0]) {
            const updated = { ...rows[0].data, imageUrl };
            await pool.query('UPDATE approvals SET data = $1 WHERE item_id = $2', [JSON.stringify(updated), itemId]);
            console.log(`✓ Вертикальный баннер: ${imageUrl}`);
          }
        })().catch(e => console.error('gen-banner error:', e.message));
      } catch(e) {
        if (!res.headersSent) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
      }
    });

  // POST /regen-banners — сгенерировать баннеры для постов без картинок
  } else if (req.method === 'POST' && req.url === '/regen-banners') {
    try {
      if (!GITHUB_TOKEN) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'GITHUB_TOKEN не установлен' })); return;
      }
      const { rows } = await pool.query(
        "SELECT * FROM approvals WHERE type = 'posts' AND status IN ('pending','edited') ORDER BY created_at ASC"
      );
      const needBanner = rows.filter(r => !r.data.imageUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, found: needBanner.length, message: `Запускаем генерацию для ${needBanner.length} постов...` }));

      // Генерируем в фоне последовательно (Pollinations ограничивает параллельные запросы)
      (async () => {
        for (const row of needBanner) {
          const postText = row.data.editedContent || row.data.content || '';
          const imageUrl = await generateAndUploadBanner(postText, row.item_id);
          if (imageUrl) {
            const updated = { ...row.data, imageUrl };
            await pool.query('UPDATE approvals SET data = $1 WHERE id = $2', [JSON.stringify(updated), row.id]);
            console.log(`✓ Баннер прикреплён к "${row.item_id}"`);
          }
          // Пауза 3 сек между запросами
          await new Promise(r => setTimeout(r, 3000));
        }
        console.log('✓ Генерация баннеров завершена');
      })().catch(e => console.error('regen-banners error:', e.message));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }

  // POST /reset-revisions — сбросить все failed/pending правки
  } else if (req.method === 'POST' && req.url === '/reset-revisions') {
    try {
      await pool.query("DELETE FROM revisions WHERE status IN ('failed','pending','processing')");
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }

  } else {
    res.writeHead(404); res.end('Not found');
  }
} // end handleRequest

// ===================================
// АВТОНОМНЫЙ АГЕНТ — обрабатывает комментарии Вики
// ===================================

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

async function callClaude(prompt) {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY не установлен');
  const body = JSON.stringify({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }]
  });
  const r = await httpsReq({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body, 60000); // 60 сек для Claude
  const data = JSON.parse(r.body);
  if (!data.content?.[0]?.text) throw new Error('Claude error: ' + r.body.slice(0, 200));
  return data.content[0].text.trim();
}

async function processRevision(revision) {
  const { id, type, item_id, comment } = revision;
  console.log(`🤖 Обрабатываю правку #${id}: "${comment.slice(0, 60)}"`);

  // Помечаем как "в работе"
  await pool.query("UPDATE revisions SET status = 'processing' WHERE id = $1", [id]);

  try {
    const { rows } = await pool.query('SELECT data FROM approvals WHERE item_id = $1', [item_id]);
    if (!rows[0]) throw new Error('Пост не найден: ' + item_id);
    const postData = rows[0].data;
    const currentContent = postData.editedContent || postData.content || '';

    const c = comment.toLowerCase();
    const wantsImage = c.includes('картинк') || c.includes('фото') || c.includes('изображен') || c.includes('баннер');
    const onlyImage = wantsImage && (c.includes('только') || c.length < 20);

    let newContent = currentContent;
    let summary = '';

    // Правка текста через Claude
    if (!onlyImage) {
      const claudePrompt = `You are editing a LinkedIn post for TimeClock 365 — time tracking + door access control software for engineering companies (50-500 employees). Target audience: HR Managers, Operations Directors.

Current post:
${currentContent}

Editor's request: ${comment}

Rules:
- Apply ONLY what was requested, keep everything else unchanged
- Keep English language
- Keep professional, direct tone — no buzzwords, no "game-changer"
- Return ONLY the revised post text, no explanations

Revised post:`;
      newContent = await callClaude(claudePrompt);
      summary = `Текст обновлён: "${comment}"`;
    }

    // Сохраняем новый текст
    const updatedData = { ...postData, editedContent: newContent };
    await pool.query(
      "UPDATE approvals SET data = $1, status = 'edited' WHERE item_id = $2",
      [JSON.stringify(updatedData), item_id]
    );

    // Новая картинка если попросили
    if (wantsImage) {
      const keywords = buildUnsplashKeywords(newContent);
      generateAndUploadBanner(newContent, item_id, 1080, 1350).then(async imageUrl => {
        if (imageUrl) {
          const { rows: r2 } = await pool.query('SELECT data FROM approvals WHERE item_id = $1', [item_id]);
          if (r2[0]) {
            await pool.query(
              'UPDATE approvals SET data = $1 WHERE item_id = $2',
              [JSON.stringify({ ...r2[0].data, imageUrl }), item_id]
            );
            console.log(`✓ Новое фото для ${item_id}: ${imageUrl}`);
          }
        }
      }).catch(e => console.error('Image error:', e.message));
      summary += ' + новое фото';
    }

    // Помечаем правку как выполненную
    await pool.query(
      "UPDATE revisions SET status = 'resolved', resolved_at = NOW(), summary = $1 WHERE id = $2",
      [summary || `Выполнено: "${comment}"`, id]
    );
    console.log(`✓ Правка #${id} готова`);

  } catch(e) {
    console.error(`✗ Ошибка правки #${id}:`, e.message);
    await pool.query("UPDATE revisions SET status = 'failed' WHERE id = $1", [id]);
  }
}

async function checkAndProcessRevisions() {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM revisions WHERE type = 'posts' AND status = 'pending' ORDER BY created_at ASC LIMIT 3"
    );
    for (const rev of rows) {
      await processRevision(rev);
    }
  } catch(e) {
    console.error('checkAndProcessRevisions error:', e.message);
  }
}

// ===================================
// ЗАПУСК
// ===================================

initDB().then(() => {
  server.listen(config.PORT, () => {
    console.log(`✓ Сервер запущен на порту ${config.PORT}`);
  });
  setInterval(checkAndSendEmails, 15 * 60 * 1000);
  checkAndSendEmails();
  // Проверяем комментарии Вики каждую минуту
  setInterval(checkAndProcessRevisions, 60 * 1000);
  setTimeout(checkAndProcessRevisions, 5000); // первый запуск через 5 сек
}).catch(err => {
  console.error('Ошибка инициализации БД:', err.message);
  server.listen(config.PORT, () => {
    console.log(`✓ Сервер запущен (без БД) на порту ${config.PORT}`);
  });
});
