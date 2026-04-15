// ===================================
// ТЕКСТЫ ПИСЕМ
// ===================================

module.exports = {

  // Письмо 1 — сразу после подписки
  email1: (name) => ({
    subject: 'Вы у нас — вот что делает TimeClock 365',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#3479E9;padding:24px 32px;">
          <h1 style="color:#fff;margin:0;font-size:20px;">TimeClock 365</h1>
        </div>
        <div style="padding:32px;background:#fff;">
          <h2 style="color:#1C1C1D;">Привет, ${name}!</h2>
          <p style="color:#444;font-size:16px;line-height:1.6;">
            Вы подписались — и это хорошее решение.
          </p>
          <p style="color:#444;font-size:16px;line-height:1.6;">
            <strong>Что такое TimeClock 365?</strong><br>
            Это единственная система, которая объединяет контроль доступа в здание
            и учёт рабочего времени в одном месте.
          </p>
          <p style="color:#444;font-size:16px;line-height:1.6;">
            Когда сотрудник прикладывает карточку к двери — система автоматически
            фиксирует приход. Никаких ручных отметок. Никаких расхождений в табеле.
          </p>
          <div style="background:#f0f5ff;border-left:4px solid #3479E9;padding:16px 20px;margin:24px 0;">
            <strong style="color:#3479E9;">Вход в здание = отметка в табеле. Автоматически.</strong>
          </div>
          <a href="https://timeclock365.com/demo-page/"
             style="display:inline-block;background:#3479E9;color:#fff;padding:14px 28px;
                    text-decoration:none;border-radius:6px;font-weight:bold;">
            Записаться на демо →
          </a>
        </div>
        <div style="padding:16px 32px;background:#f5f5f5;">
          <p style="color:#888;font-size:12px;margin:0;">
            TimeClock 365 · yana@timeclock365.com
          </p>
        </div>
      </div>
    `
  }),

  // Письмо 2 — через 1 день
  email2: (name) => ({
    subject: 'Реальная стоимость двух отдельных систем',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#3479E9;padding:24px 32px;">
          <h1 style="color:#fff;margin:0;font-size:20px;">TimeClock 365</h1>
        </div>
        <div style="padding:32px;background:#fff;">
          <h2 style="color:#1C1C1D;">Привет, ${name}</h2>
          <p style="color:#444;font-size:16px;line-height:1.6;">
            Быстрый расчёт, который большинство HR-менеджеров не делали:
          </p>
          <p style="color:#444;font-size:16px;line-height:1.6;">
            Если сверка табеля занимает 2 дня в месяц — это 24 дня в год.
            Почти месяц работы HR уходит только на то, чтобы склеить данные
            из двух систем, которые никогда не были рассчитаны друг на друга.
          </p>
          <p style="color:#444;font-size:16px;line-height:1.6;">
            И это до ошибок. До переработок, которые не попали в экспорт.
            До несоответствий, которые замечают только при проверке.
          </p>
          <div style="background:#f0f5ff;border-left:4px solid #3479E9;padding:16px 20px;margin:24px 0;">
            <strong style="color:#3479E9;">
              TimeClock 365 убирает этот разрыв навсегда — одна система вместо двух.
            </strong>
          </div>
          <a href="https://timeclock365.com/demo-page/"
             style="display:inline-block;background:#3479E9;color:#fff;padding:14px 28px;
                    text-decoration:none;border-radius:6px;font-weight:bold;">
            Посмотреть демо →
          </a>
        </div>
        <div style="padding:16px 32px;background:#f5f5f5;">
          <p style="color:#888;font-size:12px;margin:0;">
            TimeClock 365 · yana@timeclock365.com
          </p>
        </div>
      </div>
    `
  }),

  // Письмо 3 — через 3 дня
  email3: (name) => ({
    subject: 'Бесплатная сессия — 30 минут, без обязательств',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#3479E9;padding:24px 32px;">
          <h1 style="color:#fff;margin:0;font-size:20px;">TimeClock 365</h1>
        </div>
        <div style="padding:32px;background:#fff;">
          <h2 style="color:#1C1C1D;">Привет, ${name}</h2>
          <p style="color:#444;font-size:16px;line-height:1.6;">
            Это последнее письмо. Одно простое предложение:
          </p>
          <p style="color:#444;font-size:16px;line-height:1.6;">
            <strong>Бесплатная сессия настройки — 30 минут.</strong><br>
            Посмотрим на вашу текущую систему учёта и покажем,
            как это работает в TimeClock 365. Без давления.
            Без обязательств. Просто ясная картина.
          </p>
          <p style="color:#444;font-size:16px;line-height:1.6;">
            Что разберём:
          </p>
          <ul style="color:#444;font-size:16px;line-height:2;">
            <li>Где сейчас уходит время на сверку табеля</li>
            <li>Совместимо ли ваше оборудование</li>
            <li>Как выглядит переход на единую систему</li>
          </ul>
          <a href="https://timeclock365.com/free-trial/"
             style="display:inline-block;background:#12B76A;color:#fff;padding:14px 28px;
                    text-decoration:none;border-radius:6px;font-weight:bold;">
            Записаться на бесплатную сессию →
          </a>
        </div>
        <div style="padding:16px 32px;background:#f5f5f5;">
          <p style="color:#888;font-size:12px;margin:0;">
            TimeClock 365 · yana@timeclock365.com
          </p>
        </div>
      </div>
    `
  }),

};
