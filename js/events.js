// imageUrlがあれば画像を、なければ既存の絵文字を表示するフォールバック
function eventBannerEmojiHtml(ev, emojiClass) {
  return ev.imageUrl
    ? `<img src="${ev.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover">`
    : `<div class="${emojiClass}">${ev.emoji}</div>`;
}

// ── サークル限定バッジ ──
function circleLimitBadgeText(ev) {
  if (!ev.circleId) return null;
  const name = ev.circleName || (typeof circlesCache !== 'undefined' && (circlesCache.find(c => c.id === ev.circleId) || {}).name) || null;
  const label = name ? circleLabelWithSuffix(name) : 'サークル';
  return `🔒 ${label}限定`;
}

// ── イベント検索フィルタ（カテゴリ・日付範囲・サークル） ──
let activeEventCategory = 'すべて';
let activeEventDateRange = 'すべて';
let activeEventCircleId = 'すべて';
const EVENT_DATE_RANGES = ['すべて', '今日', '今週', '今月'];

// 'YYYY年M月D日（曜）'形式の文字列をDateにする（イベント作成フォームもこの形式で入力される）
function parseEventDateStr(str) {
  const m = /(\d+)年(\d+)月(\d+)日/.exec(str || '');
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function matchesEventDateRange(ev, range) {
  if (range === 'すべて') return true;
  const d = parseEventDateStr(ev.date);
  if (!d) return true; // パースできない日付は除外しない
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === '今日') return d.getTime() === today0.getTime();
  if (range === '今週') {
    const weekEnd = new Date(today0);
    weekEnd.setDate(weekEnd.getDate() + (7 - today0.getDay()));
    return d >= today0 && d <= weekEnd;
  }
  if (range === '今月') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  return true;
}

function getEventCategories() {
  return ['すべて', ...new Set(events.map(ev => ev.category).filter(Boolean))];
}

function switchEventCategory(cat) {
  activeEventCategory = cat;
  renderEvents();
}
function switchEventDateRange(range) {
  activeEventDateRange = range;
  renderEvents();
}
function switchEventCircleFilter(circleId) {
  activeEventCircleId = circleId;
  renderEvents();
}

function renderEventFilters() {
  const catEl = document.getElementById('event-cat-tabs');
  if (catEl) {
    catEl.innerHTML = getEventCategories().map(cat => `
      <button class="cat-tab ${cat === activeEventCategory ? 'active' : ''}" onclick="switchEventCategory('${cat}')">${cat}</button>
    `).join('');
  }
  const dateEl = document.getElementById('event-date-tabs');
  if (dateEl) {
    dateEl.innerHTML = EVENT_DATE_RANGES.map(range => `
      <button class="cat-tab ${range === activeEventDateRange ? 'active' : ''}" onclick="switchEventDateRange('${range}')">${range}</button>
    `).join('');
  }
  const circleEl = document.getElementById('event-circle-filter');
  if (circleEl && typeof circlesCache !== 'undefined') {
    if (circlesCache.length === 0) {
      db.collection('circles').get().then(snapshot => {
        circlesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (circlesCache.length > 0) renderEventFilters();
      }).catch(err => console.error('circles fetch error:', err.code, err.message));
    }
    const options = ['<option value="すべて">サークルで絞り込み（すべて）</option>']
      .concat(circlesCache.map(c => `<option value="${c.id}">${escapeHtml(c.emoji || '🌿')} ${escapeHtml(c.name)}</option>`));
    circleEl.innerHTML = options.join('');
    circleEl.value = activeEventCircleId;
  }
}

function getFilteredEvents() {
  return events.filter(ev =>
    (activeEventCategory === 'すべて' || ev.category === activeEventCategory) &&
    matchesEventDateRange(ev, activeEventDateRange) &&
    (activeEventCircleId === 'すべて' || ev.circleId === activeEventCircleId)
  );
}

// ── RENDER EVENTS ──
function renderEvents() {
  const createBtn = document.getElementById('event-create-btn');
  if (createBtn) createBtn.style.display = userProfile && userProfile.role === 'organizer' ? 'block' : 'none';

  renderEventFilters();
  const filtered = getFilteredEvents();
  if (filtered.length === 0) {
    document.getElementById('events-list').innerHTML = '<div class="timeline-empty">該当するイベントが見つかりませんでした。</div>';
    return;
  }
  document.getElementById('events-list').innerHTML = filtered.map(ev => {
    const pct = Math.round((ev.participants / ev.capacity) * 100);
    const circleBadge = circleLimitBadgeText(ev);
    const joined = joinedEvents.has(ev.id);
    const isFull = !joined && ev.participants >= ev.capacity;
    return `
    <div class="event-card-v" onclick="showDetail('${ev.id}')">
      <div class="event-card-v-banner" style="background:linear-gradient(135deg,${ev.grad[0]},${ev.grad[1]})">
        ${eventBannerEmojiHtml(ev, 'event-card-v-banner-emoji')}
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
          <button class="join-btn-sm" ${isFull ? 'disabled' : ''} onclick="event.stopPropagation();handleJoin('${ev.id}',this)">${joined ? '✓ 参加済' : isFull ? '満員です' : '参加する'}</button>
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
  const isFull = !joined && ev.participants >= ev.capacity;
  document.getElementById('detail-content').innerHTML = `
    <div class="detail-banner" style="background:linear-gradient(160deg,${ev.grad[0]},${ev.grad[1]})">
      ${eventBannerEmojiHtml(ev, 'detail-banner-emoji')}
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
        <button class="detail-join-btn ${joined ? 'joined' : ''}" id="detail-join-btn" style="flex:1" ${isFull ? 'disabled' : ''} onclick="handleJoin('${ev.id}', this)">
          ${joined ? '✓ 参加登録済み' : isFull ? '満員です' : '🎉 このイベントに参加する'}
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

// eventParticipantsのドキュメントIDは eventId_userId 形式に固定し（旧データはautoIDのまま
// 残るが、joinedEventsはクエリで判定するため影響しない）、events.participantsの増減と
// 同じFirestoreトランザクションで行うことで、定員超過や二重参加登録をルール側で防ぐ
async function performJoin(id, btn) {
  btn.disabled = true;
  let wasFull = false;
  try {
    const participantRef = db.collection('eventParticipants').doc(`${id}_${currentUser.uid}`);
    const eventRef = db.collection('events').doc(id);
    if (joinedEvents.has(id)) {
      await db.runTransaction(async (tx) => {
        const [partSnap, evSnap] = await Promise.all([tx.get(participantRef), tx.get(eventRef)]);
        if (!evSnap.exists) return;
        const current = evSnap.data().participants || 0;
        if (partSnap.exists) tx.delete(participantRef);
        tx.update(eventRef, { participants: Math.max(0, current - 1) });
      });
      // 旧形式（autoID）の参加記録が残っている場合の後始末
      const legacy = await db.collection('eventParticipants')
        .where('eventId', '==', id)
        .where('userId', '==', currentUser.uid)
        .get();
      await Promise.all(legacy.docs
        .filter(d => d.id !== `${id}_${currentUser.uid}`)
        .map(d => d.ref.delete()));
      joinedEvents.delete(id);
      showToast('参加登録を取り消しました');
      btn.textContent = btn.classList.contains('detail-join-btn') ? '🎉 このイベントに参加する' : '参加する';
      btn.classList.remove('joined');
    } else {
      const existing = await db.collection('eventParticipants')
        .where('userId', '==', currentUser.uid).get();
      const isRepeat = existing.size > 0;
      await db.runTransaction(async (tx) => {
        const evSnap = await tx.get(eventRef);
        if (!evSnap.exists) return;
        const current = evSnap.data().participants || 0;
        const capacity = evSnap.data().capacity;
        if (current >= capacity) {
          wasFull = true;
          return;
        }
        tx.set(participantRef, {
          eventId: id,
          userId: currentUser.uid,
          isRepeat,
          joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        tx.update(eventRef, { participants: current + 1 });
      });
      if (wasFull) {
        showToast('満員のため参加登録できません');
      } else {
        joinedEvents.add(id);
        const ev = events.find(e => e.id === id);
        if (ev && userProfile) {
          db.collection('posts').add({
            userId: currentUser.uid,
            eventId: id,
            type: 'auto_join',
            content: `${userProfile.name}さんが「${ev.title}」に参加しました`,
            parentPostId: null,
            originalPostId: null,
            likesCount: 0,
            retweetCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          }).catch(err => console.error('auto_join post error:', err.code, err.message));
        }
        showToast('🎉 参加登録しました！');
        btn.textContent = btn.classList.contains('detail-join-btn') ? '✓ 参加登録済み' : '✓ 参加済';
        btn.classList.add('joined', 'micro-pop');
        setTimeout(() => btn.classList.remove('micro-pop'), 300);
      }
    }
  } catch (err) {
    console.error('handleJoin error:', err.code, err.message);
    showToast('エラーが発生しました。もう一度お試しください。');
  } finally {
    btn.disabled = false;
  }
  // 一覧画面はevents.jsのonSnapshotリスナー（initEventsListener）が自動で再描画するが、
  // 詳細画面（event-detail）はリスナーの対象外のためここで明示的に再描画する
  if (!wasFull && currentScreen === 'event-detail') {
    const ev = events.find(e => e.id === id);
    if (ev) renderDetail(ev);
  }
  renderRecommendedEvent();
}
