// ===================================
// TimeClock 365 — Email Automation
// ===================================
// Запуск: node server.js
// ===================================

const http = require('http');       // встроенный — создаёт сервер
const fs = require('fs');           // встроенный — работа с файлами
const path = require('path');       // встроенный — пути к файлам
const nodemailer = require('nodemailer'); // для отправки email

const config = require('./config'); // твои настройки (email, пароль)
const emails = require('./emails'); // тексты писем

// ===================================
// БАЗА ДАННЫХ (простой JSON файл)
// ===================================

const DB_FILE = path.join(__dirname, 'subscribers.json');

// Загружает список подписчиков из файла
function loadSubscribers() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

// Сохраняет список подписчиков в файл
function saveSubscribers(subscribers) {
  fs.writeFileSync(DB_FILE, JSON.stringify(subscribers, null, 2));
}

// ===================================
// ОТПРАВКА EMAIL через Gmail
// ===================================

// Создаём "отправщик" с твоими Gmail данными
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.GMAIL_USER,
    pass: config.GMAIL_APP_PASSWORD, // App Password, не обычный пароль!
  },
});

// Функция отправки одного письма
async function sendEmail(to, name, emailNumber) {
  // Берём нужное письмо из emails.js
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
    console.log(`✓ Email ${emailNumber} отправлен → ${to}`);
    return true;
  } catch (err) {
    console.error(`✗ Ошибка отправки Email ${emailNumber} → ${to}:`, err.message);
    return false;
  }
}

// ===================================
// ПРОВЕРКА РАСПИСАНИЯ
// Запускается каждые 15 минут
// ===================================

async function checkAndSendEmails() {
  const subscribers = loadSubscribers();
  const now = Date.now();
  let changed = false;

  for (const sub of subscribers) {
    // Пропускаем тех у кого цепочка завершена
    if (sub.completed) continue;

    const subscribedAt = new Date(sub.subscribedAt).getTime();
    const dayInMs = 24 * 60 * 60 * 1000; // 1 день в миллисекундах

    // EMAIL 1 — сразу после подписки (если ещё не отправлен)
    if (!sub.email1Sent) {
      const ok = await sendEmail(sub.email, sub.name, 1);
      if (ok) {
        sub.email1Sent = new Date().toISOString();
        changed = true;
      }
    }

    // EMAIL 2 — через 1 день после подписки
    else if (!sub.email2Sent && now - subscribedAt >= 1 * dayInMs) {
      const ok = await sendEmail(sub.email, sub.name, 2);
      if (ok) {
        sub.email2Sent = new Date().toISOString();
        changed = true;
      }
    }

    // EMAIL 3 — через 3 дня после подписки
    else if (!sub.email3Sent && now - subscribedAt >= 3 * dayInMs) {
      const ok = await sendEmail(sub.email, sub.name, 3);
      if (ok) {
        sub.email3Sent = new Date().toISOString();
        sub.completed = true; // цепочка завершена
        changed = true;
      }
    }
  }

  // Сохраняем только если что-то изменилось
  if (changed) saveSubscribers(subscribers);
}

// ===================================
// УВЕДОМЛЕНИЕ — новый элемент на согласование
// ===================================

const TYPE_LABELS = {
  posts:       'LinkedIn пост',
  landings:    'Лендинг',
  emails:      'Письмо',
  competitors: 'Анализ конкурентов',
  seo:         'SEO идеи',
  weekly:      'Недельный отчёт',
  monthly:     'Месячный отчёт',
};

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
      to: config.OWNER_EMAIL,
      subject: `[TimeClock 365] Новое на согласование: ${label}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#3479E9;padding:16px 24px;border-radius:8px 8px 0 0;">
            <h2 style="color:#fff;margin:0;font-size:18px;">TimeClock 365</h2>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">
            <p style="color:#555;margin:0 0 16px;">Агент добавил новый элемент на согласование:</p>
            <div style="background:#f5f7fa;border-left:4px solid #3479E9;padding:14px 18px;border-radius:0 6px 6px 0;margin-bottom:16px;">
              <div style="font-weight:600;font-size:15px;color:#1C1C1D;">${title}</div>
              <div style="font-size:13px;color:#888;margin-top:4px;">${label} · ${item.date || new Date().toISOString().slice(0,10)}</div>
            </div>
            ${insightsHtml}
            <a href="http://localhost:3000/approvals-page"
               style="display:inline-block;background:#3479E9;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;margin-top:8px;">
              Открыть страницу согласования →
            </a>
          </div>
        </div>
      `,
    });
    console.log(`✉ Уведомление отправлено → ${config.OWNER_EMAIL} (${label})`);
  } catch (err) {
    console.error(`✗ Ошибка уведомления:`, err.message);
  }
}

// ===================================
// HTTP СЕРВЕР
// ===================================

const server = http.createServer(async (req, res) => {

  // Разрешаем запросы с любого домена (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  // Обработка preflight запроса от браузера
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // ===================================
  // POST /subscribe — добавить нового подписчика
  // ===================================
  if (req.method === 'POST' && req.url === '/subscribe') {

    // Читаем данные из запроса
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { name, email } = JSON.parse(body);

        // Проверяем что email и имя переданы
        if (!email || !name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Нужны name и email' }));
          return;
        }

        // Загружаем текущий список
        const subscribers = loadSubscribers();

        // Проверяем — вдруг этот email уже есть
        const exists = subscribers.find(s => s.email === email);
        if (exists) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, message: 'Уже подписан' }));
          return;
        }

        // Добавляем нового подписчика
        const newSubscriber = {
          name: name,
          email: email,
          subscribedAt: new Date().toISOString(), // когда подписался
          email1Sent: null,   // когда отправлено письмо 1
          email2Sent: null,   // когда отправлено письмо 2
          email3Sent: null,   // когда отправлено письмо 3
          completed: false    // завершена ли цепочка
        };

        subscribers.push(newSubscriber);
        saveSubscribers(subscribers);

        console.log(`+ Новый подписчик: ${name} (${email})`);

        // Сразу запускаем проверку — Email 1 уйдёт немедленно
        checkAndSendEmails();

        // Отвечаем браузеру что всё ок
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Подписка оформлена!' }));

      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ошибка сервера' }));
      }
    });

  // ===================================
  // GET /approvals — страница согласования
  // ===================================
  } else if (req.method === 'GET' && req.url === '/approvals-page') {
    const html = fs.readFileSync(path.join(__dirname, 'approvals.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);

  // ===================================
  // GET /approvals — данные для согласования (JSON)
  // ===================================
  } else if (req.method === 'GET' && req.url === '/approvals') {
    const APPROVALS_FILE = path.join(__dirname, 'approvals.json');
    let approvals = { posts: [], landings: [], emails: [] };
    try { approvals = JSON.parse(fs.readFileSync(APPROVALS_FILE, 'utf8')); } catch(e) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(approvals, null, 2));

  // ===================================
  // POST /approve — обновить статус элемента
  // ===================================
  } else if (req.method === 'POST' && req.url === '/approve') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { type, index, status, editedContent, approvedAt } = JSON.parse(body);
        const APPROVALS_FILE = path.join(__dirname, 'approvals.json');
        let approvals = { posts: [], landings: [], emails: [] };
        try { approvals = JSON.parse(fs.readFileSync(APPROVALS_FILE, 'utf8')); } catch(e) {}

        if (approvals[type] && approvals[type][index] !== undefined) {
          if (status !== undefined) approvals[type][index].status = status;
          if (editedContent !== undefined) approvals[type][index].editedContent = editedContent;
          if (approvedAt !== undefined) approvals[type][index].approvedAt = approvedAt;
          fs.writeFileSync(APPROVALS_FILE, JSON.stringify(approvals, null, 2));
          console.log(`✓ ${type}[${index}] → ${status}`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Ошибка' }));
      }
    });

  // ===================================
  // POST /add-approval — агент добавляет элемент на согласование
  // ===================================
  } else if (req.method === 'POST' && req.url === '/add-approval') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { type, item } = JSON.parse(body);
        const APPROVALS_FILE = path.join(__dirname, 'approvals.json');
        let approvals = { posts: [], landings: [], emails: [] };
        try { approvals = JSON.parse(fs.readFileSync(APPROVALS_FILE, 'utf8')); } catch(e) {}

        // Не добавляем дубликаты (проверяем по id)
        const exists = (approvals[type] || []).find(i => i.id === item.id);
        if (!exists) {
          approvals[type] = approvals[type] || [];
          approvals[type].push({ ...item, status: 'pending' });
          fs.writeFileSync(APPROVALS_FILE, JSON.stringify(approvals, null, 2));
          console.log(`+ Добавлено на согласование: ${type} "${item.id}"`);

          // Отправляем уведомление владельцу
          sendApprovalNotification(type, item);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, added: !exists }));
      } catch(e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Ошибка' }));
      }
    });

  // ===================================
  // GET /subscribers — все лиды (для дашборда)
  // ===================================
  } else if (req.method === 'GET' && req.url === '/subscribers') {
    const subscribers = loadSubscribers();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(subscribers, null, 2));

  // ===================================
  // GET / или /dashboard — CRM дашборд
  // ===================================
  } else if (req.method === 'GET' && (req.url === '/' || req.url === '/dashboard')) {
    const html = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);

  // ===================================
  // POST /update-lead — обновить статус или заметку
  // ===================================
  } else if (req.method === 'POST' && req.url === '/update-lead') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { email, status, notes } = JSON.parse(body);
        const subscribers = loadSubscribers();
        const lead = subscribers.find(s => s.email === email);
        if (lead) {
          if (status !== undefined) lead.status = status;
          if (notes !== undefined) lead.notes = notes;
          saveSubscribers(subscribers);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Ошибка' }));
      }
    });

  // ===================================
  // Всё остальное — 404
  // ===================================
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// ===================================
// ЗАПУСК
// ===================================

// Запускаем сервер
server.listen(config.PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  TimeClock 365 Email Server');
  console.log('========================================');
  console.log(`  Сервер запущен: http://localhost:${config.PORT}`);
  console.log(`  Отправка с: ${config.GMAIL_USER}`);
  console.log('========================================');
  console.log('');
});

// Проверяем расписание каждые 15 минут
const FIFTEEN_MINUTES = 15 * 60 * 1000;
setInterval(checkAndSendEmails, FIFTEEN_MINUTES);

// Первая проверка сразу при старте сервера
checkAndSendEmails();

console.log('Проверка расписания запущена (каждые 15 минут)');
