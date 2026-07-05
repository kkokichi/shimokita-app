// ── STATE ──
let dismissedReminders = new Set(); // セッション内のみ保持

// ── DATE PARSING ──
// '2026年7月11日（土）' や '2026年7月11日〜20日' 形式（同月内の範囲）に対応
function parseEventDateRange(dateStr) {
  if (!dateStr) return null;
  const startMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!startMatch) return null;
  const [, y, m, d] = startMatch.map(Number);
  const start = new Date(y, m - 1, d);
  let end = start;
  const rangeMatch = dateStr.match(/〜(\d{1,2})日/);
  if (rangeMatch) {
    end = new Date(y, m - 1, Number(rangeMatch[1]));
  }
  return { start, end };
}

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ── CHECK & RENDER ──
function checkReminders() {
  const bannerEl = document.getElementById('reminder-banner');
  if (!bannerEl) return;
  if (!currentUser || !events.length || !joinedEvents.size || (userProfile && userProfile.notificationsEnabled === false)) {
    bannerEl.style.display = 'none';
    return;
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const candidates = [];
  joinedEvents.forEach(eventId => {
    if (dismissedReminders.has(eventId)) return;
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    const range = parseEventDateRange(ev.date);
    if (!range) return;
    if (today >= range.start && today <= range.end) {
      candidates.push({ ev, when: 'today' });
    } else if (isSameDate(tomorrow, range.start)) {
      candidates.push({ ev, when: 'tomorrow' });
    }
  });

  if (candidates.length === 0) {
    bannerEl.style.display = 'none';
    return;
  }
  renderReminderBanner(candidates[0].ev, candidates[0].when);
}

function renderReminderBanner(ev, when) {
  const bannerEl = document.getElementById('reminder-banner');
  if (!bannerEl) return;
  const label = when === 'today' ? '今日' : '明日';
  bannerEl.innerHTML = `
    <div class="reminder-banner-body" onclick="showDetail('${ev.id}')">
      <span class="reminder-banner-emoji">📅</span>
      <span class="reminder-banner-text">${label}、${escapeHtml(ev.title)}に参加予定です</span>
    </div>
    <button type="button" class="reminder-banner-close" onclick="event.stopPropagation();dismissReminder('${ev.id}')">×</button>
  `;
  bannerEl.style.display = 'flex';
}

function dismissReminder(eventId) {
  dismissedReminders.add(eventId);
  checkReminders();
}

// ── 通知設定画面 ──
function openNotificationSettingsScreen() {
  navigate('notification-settings');
  renderNotificationSettings();
}

function renderNotificationSettings() {
  const enabled = !userProfile || userProfile.notificationsEnabled !== false;
  const btn = document.getElementById('notification-toggle-btn');
  if (!btn) return;
  btn.textContent = enabled ? 'オン' : 'オフ';
  btn.classList.toggle('active', enabled);
}

async function toggleNotifications() {
  if (!currentUser || !userProfile) {
    openMyPage();
    return;
  }
  const enabled = userProfile.notificationsEnabled !== false;
  const next = !enabled;
  try {
    await db.collection('users').doc(currentUser.uid).update({ notificationsEnabled: next });
    userProfile.notificationsEnabled = next;
    renderNotificationSettings();
    checkReminders();
    showToast(next ? 'リマインダーをオンにしました' : 'リマインダーをオフにしました');
  } catch (err) {
    console.error('toggleNotifications error:', err.code, err.message);
    showToast('設定の変更に失敗しました。もう一度お試しください。');
  }
}
