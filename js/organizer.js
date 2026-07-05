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
