// ── STATE ──
let savedEventIds = new Set();
let favoriteSpotIds = new Set();

// ── RESTORE ON LOGIN ──
function initMypageListsListener() {
  if (!currentUser) {
    savedEventIds = new Set();
    favoriteSpotIds = new Set();
    return;
  }
  db.collection('savedEvents').where('userId', '==', currentUser.uid).get().then(snapshot => {
    savedEventIds = new Set(snapshot.docs.map(doc => doc.data().eventId));
    if (typeof renderEvents === 'function') renderEvents();
    if (currentScreen === 'saved-events') renderSavedEventsList();
  }).catch(err => console.error('savedEvents fetch error:', err.code, err.message));

  db.collection('favoriteSpots').where('userId', '==', currentUser.uid).get().then(snapshot => {
    favoriteSpotIds = new Set(snapshot.docs.map(doc => doc.data().spotId));
    if (typeof renderSpotsList === 'function') renderSpotsList();
    if (currentScreen === 'favorite-spots') renderFavoriteSpotsList();
  }).catch(err => console.error('favoriteSpots fetch error:', err.code, err.message));
}

// ── SAVE EVENT TOGGLE ──
function isEventSaved(id) {
  return savedEventIds.has(id);
}

async function toggleSaveEvent(id, btn) {
  if (!currentUser) {
    openMyPage();
    return;
  }
  if (btn) btn.disabled = true;
  try {
    if (savedEventIds.has(id)) {
      await db.collection('savedEvents').doc(`${currentUser.uid}_${id}`).delete();
      savedEventIds.delete(id);
      showToast('保存を解除しました');
    } else {
      await db.collection('savedEvents').doc(`${currentUser.uid}_${id}`).set({
        userId: currentUser.uid,
        eventId: id,
        savedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      savedEventIds.add(id);
      showToast('🔖 保存しました');
    }
    renderEvents();
    if (currentScreen === 'event-detail') {
      const ev = events.find(e => e.id === id);
      if (ev) renderDetail(ev);
    }
    if (currentScreen === 'saved-events') renderSavedEventsList();
  } catch (err) {
    console.error('toggleSaveEvent error:', err.code, err.message);
    showToast('エラーが発生しました。もう一度お試しください。');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── FAVORITE SPOT TOGGLE ──
function isSpotFavorite(id) {
  return favoriteSpotIds.has(id);
}

async function toggleFavoriteSpot(id, btn) {
  if (!currentUser) {
    openMyPage();
    return;
  }
  if (btn) btn.disabled = true;
  try {
    if (favoriteSpotIds.has(id)) {
      await db.collection('favoriteSpots').doc(`${currentUser.uid}_${id}`).delete();
      favoriteSpotIds.delete(id);
      showToast('お気に入りを解除しました');
    } else {
      await db.collection('favoriteSpots').doc(`${currentUser.uid}_${id}`).set({
        userId: currentUser.uid,
        spotId: id,
        savedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      favoriteSpotIds.add(id);
      showToast('♡ お気に入りに追加しました');
    }
    renderSpotsList();
    if (currentScreen === 'spot-detail') {
      const s = spots.find(sp => sp.id === id);
      if (s) renderSpotDetail(s);
    }
    if (currentScreen === 'favorite-spots') renderFavoriteSpotsList();
  } catch (err) {
    console.error('toggleFavoriteSpot error:', err.code, err.message);
    showToast('エラーが発生しました。もう一度お試しください。');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── JOINED EVENTS SCREEN ──
function openJoinedEventsScreen() {
  navigate('joined-events');
  renderJoinedEventsList();
}

function renderJoinedEventsList() {
  const list = events.filter(ev => joinedEvents.has(ev.id));
  const el = document.getElementById('joined-events-list');
  if (list.length === 0) {
    el.innerHTML = '<div class="timeline-empty">参加済みのイベントはまだありません。</div>';
    return;
  }
  el.innerHTML = list.map(ev => `
    <div class="spot-card" onclick="showDetail('${ev.id}')">
      <div class="spot-icon">${ev.emoji}</div>
      <div style="flex:1;min-width:0">
        <div class="spot-name">${escapeHtml(ev.title)}</div>
        <div class="spot-desc">${escapeHtml(ev.date)} ${escapeHtml(ev.time)}</div>
      </div>
      <div style="color:var(--ink-soft);font-size:18px">›</div>
    </div>`).join('');
}

// ── SAVED EVENTS SCREEN ──
function openSavedEventsScreen() {
  navigate('saved-events');
  renderSavedEventsList();
}

function renderSavedEventsList() {
  const list = events.filter(ev => savedEventIds.has(ev.id));
  const el = document.getElementById('saved-events-list');
  if (list.length === 0) {
    el.innerHTML = '<div class="timeline-empty">保存したイベントはまだありません。</div>';
    return;
  }
  el.innerHTML = list.map(ev => `
    <div class="spot-card" onclick="showDetail('${ev.id}')">
      <div class="spot-icon">${ev.emoji}</div>
      <div style="flex:1;min-width:0">
        <div class="spot-name">${escapeHtml(ev.title)}</div>
        <div class="spot-desc">${escapeHtml(ev.date)} ${escapeHtml(ev.time)}</div>
      </div>
      <button class="icon-toggle-btn active" onclick="event.stopPropagation();toggleSaveEvent('${ev.id}', this)">🔖</button>
    </div>`).join('');
}

// ── FAVORITE SPOTS SCREEN ──
function openFavoriteSpotsScreen() {
  navigate('favorite-spots');
  renderFavoriteSpotsList();
}

function renderFavoriteSpotsList() {
  const list = spots.filter(s => favoriteSpotIds.has(s.id));
  const el = document.getElementById('favorite-spots-list');
  if (list.length === 0) {
    el.innerHTML = '<div class="timeline-empty">お気に入りのスポットはまだありません。</div>';
    return;
  }
  const cfg = catConfig;
  el.innerHTML = list.map(s => `
    <div class="spot-card" onclick="showSpotDetail('${s.id}')">
      <div class="spot-icon" style="background:${(cfg[s.cat] || {}).bg || 'var(--forest-pale)'}">${s.icon}</div>
      <div style="flex:1;min-width:0">
        <div class="spot-name">${escapeHtml(s.name)}</div>
        <div class="spot-desc">${escapeHtml(s.desc)}</div>
        <div class="spot-rating">★ ${s.rating}</div>
      </div>
      <button class="icon-toggle-btn active" onclick="event.stopPropagation();toggleFavoriteSpot('${s.id}', this)">♡</button>
    </div>`).join('');
}
