// ── サークル限定バッジ ──
function circleLimitBadgeText(ev) {
  if (!ev.circleId) return null;
  const name = ev.circleName || (typeof circlesCache !== 'undefined' && (circlesCache.find(c => c.id === ev.circleId) || {}).name) || null;
  const label = name ? circleLabelWithSuffix(name) : 'サークル';
  return `🔒 ${label}限定`;
}

// ── RENDER EVENTS ──
function renderEvents() {
  const createBtn = document.getElementById('event-create-btn');
  if (createBtn) createBtn.style.display = userProfile && userProfile.role === 'organizer' ? 'block' : 'none';

  document.getElementById('events-list').innerHTML = events.map(ev => {
    const pct = Math.round((ev.participants / ev.capacity) * 100);
    const circleBadge = circleLimitBadgeText(ev);
    return `
    <div class="event-card-v" onclick="showDetail('${ev.id}')">
      <div class="event-card-v-banner" style="background:linear-gradient(135deg,${ev.grad[0]},${ev.grad[1]})">
        <div class="event-card-v-banner-emoji">${ev.emoji}</div>
        <div class="event-card-v-banner-cat"><span class="pill" style="background:rgba(255,255,255,0.2);color:white">${ev.category}</span></div>
        ${circleBadge ? `<div style="position:absolute;top:12px;right:12px"><span class="pill pill-terra">${circleBadge}</span></div>` : ''}
      </div>
      <div class="event-card-v-body">
        <div class="event-card-v-title">${ev.title}</div>
        <div class="event-card-v-row"><span class="event-card-v-row-icon">📅</span>${ev.date} ${ev.time}</div>
        <div class="event-card-v-row"><span class="event-card-v-row-icon">📍</span>${ev.location}</div>
        <div class="event-card-v-footer">
          <div class="participants-bar">
            <div class="participants-text">${ev.participants}人参加中 / 定員${ev.capacity}人</div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:linear-gradient(to right,${ev.grad[0]},${ev.grad[1]})"></div></div>
          </div>
          <button class="icon-toggle-btn ${isEventSaved(ev.id) ? 'active' : ''}" onclick="event.stopPropagation();toggleSaveEvent('${ev.id}', this)">🔖</button>
          <button class="join-btn-sm" onclick="event.stopPropagation();handleJoin('${ev.id}',this)">${joinedEvents.has(ev.id) ? '✓ 参加済' : '参加する'}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function showDetail(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  renderDetail(ev);
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('event-detail').classList.add('active');
  document.getElementById('event-detail').scrollTop = 0;
  prevScreen = currentScreen;
  currentScreen = 'event-detail';
}

// ── RENDER DETAIL ──
function renderDetail(ev) {
  const pct = Math.round((ev.participants / ev.capacity) * 100);
  const joined = joinedEvents.has(ev.id);
  document.getElementById('detail-content').innerHTML = `
    <div class="detail-banner" style="background:linear-gradient(160deg,${ev.grad[0]},${ev.grad[1]})">
      <div class="detail-banner-emoji">${ev.emoji}</div>
    </div>
    <div class="detail-body">
      <div class="detail-category"><span class="pill pill-green">${ev.category}</span>${circleLimitBadgeText(ev) ? ` <span class="pill pill-terra">${circleLimitBadgeText(ev)}</span>` : ''}</div>
      <div class="detail-title">${ev.title}</div>
      <div class="detail-info-row">
        <div class="detail-info-icon">📅</div>
        <div><div class="detail-info-label">開催日時</div><div class="detail-info-value">${ev.date}<br>${ev.time}</div></div>
      </div>
      <div class="detail-info-row">
        <div class="detail-info-icon">📍</div>
        <div><div class="detail-info-label">開催場所</div><div class="detail-info-value">${ev.location}</div></div>
      </div>
      <div class="detail-info-row">
        <div class="detail-info-icon">👤</div>
        <div><div class="detail-info-label">主催者</div><div class="detail-info-value">${ev.organizer}</div></div>
      </div>
      <div class="detail-map-placeholder">
        <div class="detail-map-icon">🗺</div>
        <div class="detail-map-text">Google マップで開く</div>
        <div style="font-size:11px;color:var(--forest);opacity:0.7">${ev.location}</div>
      </div>
      <div class="detail-participants">
        <div class="detail-participants-title">参加状況</div>
        <div class="detail-participants-nums">${ev.participants}<span style="font-size:16px;font-weight:400;color:var(--ink-soft)"> / ${ev.capacity}人</span></div>
        <div class="detail-participants-sub">定員の${pct}%が埋まっています</div>
        <div class="progress-bar" style="height:6px"><div class="progress-fill" style="width:${pct}%;background:linear-gradient(to right,${ev.grad[0]},${ev.grad[1]})"></div></div>
      </div>
      <div class="detail-desc-label">イベント詳細</div>
      <div class="detail-desc">${ev.description}</div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="detail-join-btn ${joined ? 'joined' : ''}" id="detail-join-btn" style="flex:1" onclick="handleJoin('${ev.id}', this)">
          ${joined ? '✓ 参加登録済み' : '🎉 このイベントに参加する'}
        </button>
        <button class="icon-toggle-btn ${isEventSaved(ev.id) ? 'active' : ''}" style="font-size:26px" onclick="toggleSaveEvent('${ev.id}', this)">🔖</button>
      </div>
    </div>
  `;
}

// ── JOIN HANDLER ──
let pendingJoinEventId = null;
let pendingJoinBtn = null;

async function handleJoin(id, btn) {
  if (!currentUser) {
    openMyPage();
    return;
  }
  if (btn.disabled) return;
  if (!joinedEvents.has(id)) {
    const ev = events.find(e => e.id === id);
    if (ev && ev.circleId && !isCircleMember(ev.circleId)) {
      openCircleRequiredModal(ev, btn);
      return;
    }
  }
  await performJoin(id, btn);
}

function openCircleRequiredModal(ev, btn) {
  pendingJoinEventId = ev.id;
  pendingJoinBtn = btn;
  const label = circleLabelWithSuffix(ev.circleName || 'サークル');
  document.getElementById('circle-required-text').textContent =
    `このイベントは${label}のメンバー限定です。先にサークルに参加しますか？`;
  document.getElementById('circle-required-overlay').style.display = 'flex';
}

function closeCircleRequiredModal() {
  document.getElementById('circle-required-overlay').style.display = 'none';
  pendingJoinEventId = null;
  pendingJoinBtn = null;
}

async function confirmJoinCircleAndEvent() {
  const id = pendingJoinEventId;
  const btn = pendingJoinBtn;
  document.getElementById('circle-required-overlay').style.display = 'none';
  if (!id || !btn) return;
  const ev = events.find(e => e.id === id);
  try {
    await addCircleMembership(ev.circleId);
    showToast(`🌿 ${circleLabelWithSuffix(ev.circleName || 'サークル')}に参加しました！`);
  } catch (err) {
    console.error('circle auto-join error:', err.code, err.message);
    showToast('サークルへの参加に失敗しました。もう一度お試しください。');
    pendingJoinEventId = null;
    pendingJoinBtn = null;
    return;
  }
  pendingJoinEventId = null;
  pendingJoinBtn = null;
  await performJoin(id, btn);
}

async function performJoin(id, btn) {
  btn.disabled = true;
  try {
    if (joinedEvents.has(id)) {
      const existing = await db.collection('eventParticipants')
        .where('eventId', '==', id)
        .where('userId', '==', currentUser.uid)
        .get();
      await Promise.all(existing.docs.map(doc => doc.ref.delete()));
      joinedEvents.delete(id);
      showToast('参加登録を取り消しました');
      btn.textContent = btn.classList.contains('detail-join-btn') ? '🎉 このイベントに参加する' : '参加する';
      btn.classList.remove('joined');
    } else {
      const existing = await db.collection('eventParticipants')
        .where('userId', '==', currentUser.uid).get();
      const isRepeat = existing.size > 0;
      await db.collection('eventParticipants').add({
        eventId: id,
        userId: currentUser.uid,
        isRepeat,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      joinedEvents.add(id);
      const ev = events.find(e => e.id === id);
      if (ev && userProfile) {
        db.collection('posts').add({
          userId: currentUser.uid,
          eventId: id,
          type: 'auto_join',
          content: `${userProfile.name}さんが「${ev.title}」に参加しました`,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        }).catch(err => console.error('auto_join post error:', err.code, err.message));
      }
      showToast('🎉 参加登録しました！');
      btn.textContent = btn.classList.contains('detail-join-btn') ? '✓ 参加登録済み' : '✓ 参加済';
      btn.classList.add('joined');
    }
  } catch (err) {
    console.error('handleJoin error:', err.code, err.message);
    showToast('エラーが発生しました。もう一度お試しください。');
  } finally {
    btn.disabled = false;
  }
  renderRecommendedEvent();
}
