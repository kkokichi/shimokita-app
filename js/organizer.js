// ── ORGANIZER DASHBOARD ──
function openOrganizerDashboard() {
  if (!userProfile || userProfile.role !== 'organizer') {
    showToast('主催者のみアクセスできます');
    return;
  }
  renderOrganizerDashboard();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('organizer').classList.add('active');
  document.getElementById('organizer').scrollTop = 0;
  prevScreen = currentScreen;
  currentScreen = 'organizer';
}

function renderOrganizerDashboard() {
  renderOrganizerEvents();
  renderOrganizerReports();
  renderOrganizerEventManagement();
  renderOrganizerCircleManagement();
  renderOrganizerSpotManagement();
}

// ── イベント管理（編集・削除） ──
function renderOrganizerEventManagement() {
  const listEl = document.getElementById('organizer-event-management-list');
  if (!listEl) return;
  if (!events.length) {
    listEl.innerHTML = '<div class="timeline-empty">イベントがありません。</div>';
    return;
  }
  listEl.innerHTML = events.map(ev => `
    <div class="organizer-card">
      <div class="organizer-card-title">${escapeHtml(ev.title)}</div>
      <div class="organizer-card-sub">${ev.date} ${ev.time}・${ev.participants || 0}/${ev.capacity}人</div>
      <div class="organizer-card-actions">
        <button class="organizer-edit-btn" onclick="openEventEditScreen('${ev.id}')">編集する</button>
        <button class="organizer-delete-btn" onclick="openDeleteConfirmModal('event', '${ev.id}', '${escapeHtml(ev.title)}')">削除する</button>
      </div>
    </div>`).join('');
}

// ── サークル管理（編集・削除） ──
let organizerCirclesCache = [];

async function renderOrganizerCircleManagement() {
  const listEl = document.getElementById('organizer-circle-management-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="timeline-empty">読み込み中...</div>';
  try {
    const snapshot = await db.collection('circles').get();
    organizerCirclesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (organizerCirclesCache.length === 0) {
      listEl.innerHTML = '<div class="timeline-empty">サークルがありません。</div>';
      return;
    }
    listEl.innerHTML = organizerCirclesCache.map(c => `
      <div class="organizer-card">
        <div class="organizer-card-title">${c.emoji || '🌿'} ${escapeHtml(c.name)}</div>
        <div class="organizer-card-sub">${escapeHtml(c.description || '')}</div>
        <div class="organizer-card-actions">
          <button class="organizer-edit-btn" onclick="openCircleEditModal('${c.id}')">編集する</button>
          <button class="organizer-delete-btn" onclick="openDeleteConfirmModal('circle', '${c.id}', '${escapeHtml(c.name)}')">削除する</button>
        </div>
      </div>`).join('');
  } catch (err) {
    console.error('organizer circle management error:', err.code, err.message);
    listEl.innerHTML = '<div class="timeline-empty">読み込みに失敗しました。</div>';
  }
}

// ── スポット管理（編集・削除） ──
function renderOrganizerSpotManagement() {
  const listEl = document.getElementById('organizer-spot-management-list');
  if (!listEl) return;
  if (!spots.length) {
    listEl.innerHTML = '<div class="timeline-empty">スポットがありません。</div>';
    return;
  }
  listEl.innerHTML = spots.map(s => `
    <div class="organizer-card">
      <div class="organizer-card-title">${s.icon || '📍'} ${escapeHtml(s.name)}</div>
      <div class="organizer-card-sub">${escapeHtml(s.cat)}・${escapeHtml(s.address || '')}</div>
      <div class="organizer-card-actions">
        <button class="organizer-edit-btn" onclick="openSpotEditModal('${s.id}')">編集する</button>
        <button class="organizer-delete-btn" onclick="openDeleteConfirmModal('spot', '${s.id}', '${escapeHtml(s.name)}')">削除する</button>
      </div>
    </div>`).join('');
}

// ── 削除確認モーダル（イベント/サークル共通） ──
let pendingDeleteType = null;
let pendingDeleteId = null;

const DELETE_TYPE_LABELS = { event: 'イベント', circle: 'サークル', spot: 'スポット' };

function openDeleteConfirmModal(type, id, name) {
  pendingDeleteType = type;
  pendingDeleteId = id;
  const label = DELETE_TYPE_LABELS[type] || 'データ';
  document.getElementById('delete-confirm-title').textContent = `${label}を削除しますか？`;
  document.getElementById('delete-confirm-text').textContent = type === 'spot'
    ? `「${name}」を削除します。元に戻せません。本当に削除しますか？`
    : `「${name}」を削除します。関連する参加者・メンバー・投稿データもすべて削除され、元に戻せません。本当に削除しますか？`;
  document.getElementById('delete-confirm-overlay').style.display = 'flex';
}

function closeDeleteConfirmModal() {
  document.getElementById('delete-confirm-overlay').style.display = 'none';
  pendingDeleteType = null;
  pendingDeleteId = null;
}

async function confirmDelete() {
  const type = pendingDeleteType;
  const id = pendingDeleteId;
  if (!type || !id) return;
  const btn = document.getElementById('delete-confirm-btn');
  btn.disabled = true;
  try {
    if (type === 'event') {
      await cascadeDeleteEvent(id);
      showToast('イベントを削除しました');
    } else if (type === 'circle') {
      await cascadeDeleteCircle(id);
      showToast('サークルを削除しました');
    } else if (type === 'spot') {
      await db.collection('spots').doc(id).delete();
      showToast('スポットを削除しました');
    }
    closeDeleteConfirmModal();
    renderOrganizerEventManagement();
    renderOrganizerCircleManagement();
    renderOrganizerSpotManagement();
  } catch (err) {
    console.error('delete error:', err.code, err.message);
    showToast('削除に失敗しました。もう一度お試しください。');
  } finally {
    btn.disabled = false;
  }
}

async function cascadeDeleteEvent(eventId) {
  const [participantsSnap, autoJoinPostsSnap] = await Promise.all([
    db.collection('eventParticipants').where('eventId', '==', eventId).get(),
    db.collection('posts').where('eventId', '==', eventId).where('type', '==', 'auto_join').get(),
  ]);
  await Promise.all([
    ...participantsSnap.docs.map(d => d.ref.delete()),
    ...autoJoinPostsSnap.docs.map(d => d.ref.delete()),
  ]);
  await db.collection('events').doc(eventId).delete();
}

async function cascadeDeleteCircle(circleId) {
  const [membersSnap, messagesSnap] = await Promise.all([
    db.collection('circleMembers').where('circleId', '==', circleId).get(),
    db.collection('circleMessages').where('circleId', '==', circleId).get(),
  ]);
  await Promise.all([
    ...membersSnap.docs.map(d => d.ref.delete()),
    ...messagesSnap.docs.map(d => d.ref.delete()),
  ]);
  await db.collection('circles').doc(circleId).delete();
  if (typeof circlesCache !== 'undefined') {
    const idx = circlesCache.findIndex(c => c.id === circleId);
    if (idx !== -1) circlesCache.splice(idx, 1);
  }
}

// ── PARTICIPANTS ──
async function renderOrganizerEvents() {
  const listEl = document.getElementById('organizer-events-list');
  listEl.innerHTML = '<div class="timeline-empty">読み込み中...</div>';
  try {
    const snapshot = await db.collection('eventParticipants').get();
    if (snapshot.empty) {
      listEl.innerHTML = '<div class="timeline-empty">まだ参加登録がありません。</div>';
      return;
    }

    const byEvent = {};
    snapshot.docs.forEach(doc => {
      const d = doc.data();
      if (!byEvent[d.eventId]) byEvent[d.eventId] = [];
      byEvent[d.eventId].push(d);
    });

    const userIds = [...new Set(snapshot.docs.map(doc => doc.data().userId))];
    const userNames = {};
    await Promise.all(userIds.map(async uid => {
      const doc = await db.collection('users').doc(uid).get();
      userNames[uid] = doc.exists ? doc.data().name : '不明なユーザー';
    }));

    listEl.innerHTML = Object.keys(byEvent).map(eventId => {
      const ev = events.find(e => e.id === eventId);
      const participants = byEvent[eventId];
      const rows = participants.map(p => `
        <div class="organizer-participant-row">
          <span>${escapeHtml(userNames[p.userId] || '不明なユーザー')}</span>
          <span class="pill ${p.isRepeat ? 'pill-terra' : 'pill-green'}">${p.isRepeat ? '常連' : '新規'}</span>
        </div>`).join('');
      return `
      <div class="organizer-card">
        <div class="organizer-card-title">${escapeHtml(ev ? ev.title : eventId)}</div>
        <div class="organizer-card-sub">${participants.length}人参加登録</div>
        ${rows}
      </div>`;
    }).join('');
  } catch (err) {
    console.error('organizer events error:', err.code, err.message);
    listEl.innerHTML = '<div class="timeline-empty">読み込みに失敗しました。</div>';
  }
}

// ── REPORTS ──
async function renderOrganizerReports() {
  const listEl = document.getElementById('organizer-reports-list');
  listEl.innerHTML = '<div class="timeline-empty">読み込み中...</div>';
  try {
    const snapshot = await db.collection('reports').where('status', '==', 'pending').get();
    if (snapshot.empty) {
      listEl.innerHTML = '<div class="timeline-empty">保留中の通報はありません。</div>';
      return;
    }
    const sourceLabels = { post: 'タイムライン投稿', circleMessage: 'サークルチャット', chatMessage: '個人チャット' };
    listEl.innerHTML = snapshot.docs.map(doc => {
      const r = doc.data();
      const targetId = r.targetId || r.postId; // 旧データ（postIdのみ）との互換
      const targetType = r.targetType || 'post';
      const sourceLabel = sourceLabels[targetType] || 'タイムライン投稿';
      return `
      <div class="organizer-card">
        <div class="organizer-card-title" style="font-size:12px">${sourceLabel}</div>
        <div class="organizer-card-sub">理由：${escapeHtml(r.reason || '未記入')}</div>
        ${r.contentSnapshot ? `<div class="organizer-card-sub">内容：${escapeHtml(r.contentSnapshot)}</div>` : ''}
        <button class="organizer-delete-btn" onclick="handleReportDelete('${doc.id}','${targetId}','${targetType}', this)">投稿を削除する</button>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('organizer reports error:', err.code, err.message);
    listEl.innerHTML = '<div class="timeline-empty">読み込みに失敗しました。</div>';
  }
}

const REPORT_TARGET_COLLECTIONS = { post: 'posts', circleMessage: 'circleMessages', chatMessage: 'chatMessages' };

async function handleReportDelete(reportId, targetId, targetType, btn) {
  btn.disabled = true;
  try {
    const collection = REPORT_TARGET_COLLECTIONS[targetType] || 'posts';
    await db.collection(collection).doc(targetId).delete();
    await db.collection('reports').doc(reportId).update({ status: 'reviewed' });
    showToast('投稿を削除しました');
    renderOrganizerReports();
    if (collection === 'posts') renderTimeline();
  } catch (err) {
    console.error('report delete error:', err.code, err.message);
    showToast('削除に失敗しました。もう一度お試しください。');
    btn.disabled = false;
  }
}
