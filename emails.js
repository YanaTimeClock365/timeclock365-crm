// ===================================
// ТЕКСТЫ ПИСЕМ — TimeClock 365
// Email nurture sequence (English)
// Target: HR Managers, Operations Directors at engineering companies
// ===================================

const SITE = 'https://timeclock365.com';
const DEMO = 'https://timeclock365.com/demo-page/';
const TRIAL = 'https://timeclock365.com/free-trial/';

function base(content) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1C1C1D;">
    <div style="background:#0A66C2;padding:20px 32px;">
      <a href="${SITE}" style="color:#fff;text-decoration:none;font-size:18px;font-weight:700;">TimeClock 365</a>
    </div>
    <div style="padding:32px;background:#fff;">
      ${content}
    </div>
    <div style="padding:14px 32px;background:#f5f7fa;border-top:1px solid #e8eef8;">
      <p style="color:#999;font-size:12px;margin:0;">
        TimeClock 365 · <a href="mailto:yana@timeclock365.com" style="color:#0A66C2;">yana@timeclock365.com</a>
        · <a href="${SITE}" style="color:#0A66C2;">timeclock365.com</a>
      </p>
    </div>
  </div>`;
}

function btn(text, url, color) {
  color = color || '#0A66C2';
  return `<a href="${url}" style="display:inline-block;background:${color};color:#fff;padding:13px 26px;text-decoration:none;border-radius:6px;font-weight:700;font-size:15px;margin-top:8px;">${text}</a>`;
}

function highlight(text) {
  return `<div style="background:#f0f4ff;border-left:4px solid #0A66C2;padding:14px 18px;margin:20px 0;font-size:15px;line-height:1.6;color:#333;">${text}</div>`;
}

module.exports = {

  // Письмо 1 — сразу после подписки
  // Subject: "One system instead of two — here's how it works"
  email1: (name) => ({
    subject: 'One system instead of two — here\'s how it works',
    html: base(`
      <p style="font-size:16px;line-height:1.7;color:#444;">Hi ${name},</p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        Most companies run two separate systems: one for door access, one for time tracking.
        Every pay period, someone reconciles them manually.
      </p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        <strong>TimeClock 365 eliminates that entirely.</strong>
      </p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        When an employee badges through the door, the system records it as a clock-in.
        No separate time clock. No manual entry. No reconciliation.
      </p>
      ${highlight('<strong>Door entry = timesheet entry. Automatically.</strong><br>One platform. One vendor. One source of truth.')}
      <p style="font-size:16px;line-height:1.7;color:#444;">
        Used by HR managers and operations directors at engineering and manufacturing companies
        with 50–500 employees.
      </p>
      ${btn('See how it works →', DEMO)}
    `)
  }),

  // Письмо 2 — через 2 дня
  // Subject: "The real cost of running two systems"
  email2: (name) => ({
    subject: 'The real cost of running two systems',
    html: base(`
      <p style="font-size:16px;line-height:1.7;color:#444;">Hi ${name},</p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        A quick calculation most HR teams haven't done:
      </p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        If timesheet reconciliation takes 4 hours per pay period, that's roughly
        <strong>104 hours per year</strong> — just to manually sync data between two systems
        that were never designed to work together.
      </p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        Add duplicate vendor contracts, and the hidden cost climbs fast.
        For a 150-person company, it typically runs <strong>$10,000–$20,000 per year</strong>
        in combined labor, licensing, and error correction.
      </p>
      ${highlight('Companies that switched to TimeClock 365 typically recover that cost within 12 months.')}
      <p style="font-size:16px;line-height:1.7;color:#444;">
        Would it be useful to run those numbers for your team?
      </p>
      ${btn('Book a 30-min walkthrough →', DEMO)}
    `)
  }),

  // Письмо 3 — через 5 дней
  // Subject: "Buddy punching is costing you more than you think"
  email3: (name) => ({
    subject: 'Buddy punching is costing you more than you think',
    html: base(`
      <p style="font-size:16px;line-height:1.7;color:#444;">Hi ${name},</p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        At a 200-person manufacturing company, even 10 minutes of unauthorized clock-ins
        per week per employee adds up to <strong>over $50,000 in annual payroll leakage.</strong>
      </p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        Traditional PIN codes and ID cards don't prevent buddy punching —
        they can be shared. Biometric door entry can't.
      </p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        With TimeClock 365, the door reader verifies identity at entry.
        That verification becomes the timesheet record.
        No separate clock-in step. No way to clock in for someone else.
      </p>
      ${highlight('<strong>The door is the time clock.</strong> Identity-verified, tamper-proof, automatic.')}
      <p style="font-size:16px;line-height:1.7;color:#444;">
        Worth 20 minutes to see it in action?
      </p>
      ${btn('Schedule a demo →', DEMO)}
    `)
  }),

  // Письмо 4 — через 9 дней
  // Subject: "How one engineering firm cut audit prep from 4 days to 40 minutes"
  email4: (name) => ({
    subject: 'How one engineering firm cut audit prep from 4 days to 40 minutes',
    html: base(`
      <p style="font-size:16px;line-height:1.7;color:#444;">Hi ${name},</p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        Before switching to TimeClock 365, their HR director spent 4 days before every
        labor inspection manually compiling attendance records from two disconnected systems.
      </p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        After implementation: <strong>40 minutes.</strong>
      </p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        Because TimeClock 365 maintains a continuous, tamper-evident log.
        Every entry is timestamped, identity-verified, and stored in one place.
        When an inspector asks for attendance records — they're ready to export instantly.
      </p>
      ${highlight('FLSA compliance requires "complete and accurate" records. TimeClock 365 generates them automatically — no manual reconciliation required.')}
      <p style="font-size:16px;line-height:1.7;color:#444;">
        If this sounds relevant to your team, I'm happy to walk you through how it would
        work for your specific setup.
      </p>
      ${btn('Let\'s talk →', DEMO)}
    `)
  }),

  // Письмо 5 — через 14 дней
  // Subject: "Free setup session — 30 minutes, no obligation"
  email5: (name) => ({
    subject: 'Free setup session — 30 minutes, no obligation',
    html: base(`
      <p style="font-size:16px;line-height:1.7;color:#444;">Hi ${name},</p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        This is my last email. One straightforward offer:
      </p>
      <p style="font-size:16px;line-height:1.7;color:#444;">
        <strong>A free 30-minute setup session.</strong> We'll look at your current
        attendance and access setup, and show you exactly how TimeClock 365 would
        handle it. No pitch. No pressure. Just a clear picture.
      </p>
      <p style="font-size:15px;color:#555;line-height:1.8;">What we'll cover:</p>
      <ul style="color:#444;font-size:15px;line-height:2.1;padding-left:20px;">
        <li>Where your team currently spends time on reconciliation</li>
        <li>Whether your existing hardware is compatible</li>
        <li>What a transition to a unified system looks like for your headcount</li>
        <li>Estimated ROI based on your actual numbers</li>
      </ul>
      ${highlight('Most teams find $8,000–$15,000 in annual savings in the first session alone.')}
      ${btn('Book a free session →', TRIAL, '#12B76A')}
      <p style="font-size:14px;color:#999;margin-top:20px;">
        No credit card. No commitment. Just 30 minutes.
      </p>
    `)
  }),

};
