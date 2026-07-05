// ── STATE ──
let myPresenceId = null;
let myPresenceExpiresAt = null;
let presenceCountdownTimer = null;
let presenceMarkers = [];
let presenceBubbles = [];
let presenceDataCache = {};
let presenceUserCache = {};
let pendingCheckinCoords = null; // { lat, lng } captured after geolocation success

// ── TIME HELPERS ──
function formatRemaining(ms) {
  if (ms <= 0) return '0分';
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

function formatTimeAgo(ts) {
  if (!ts || !ts.toDate) return '';
  const diffMs = Date.now() - ts.toDate().getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}時間前`;
  return `${Math.floor(diffH / 24)}日前`;
}

// ── CHECKIN BUTTON ──
function handlePresenceButtonClick() {
  if (!currentUser) {
    openMyPage();
    return;
  }
  if (myPresenceId) {
    handlePresenceCheckout();
  } else {
    document.getElementById('presence-consent-overlay').style.display = 'flex';
  }
}

function closePresenceConsentModal() {
  document.getElementById('presence-consent-overlay').style.display = 'none';
}

function confirmConsentAndGetLocation() {
  if (!navigator.geolocation) {
    closePresenceConsentModal();
    showToast('この端末では位置情報を取得できません。');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      pendingCheckinCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      closePresenceConsentModal();
      openPresenceCommentModal();
    },
    err => {
      console.error('geolocation error:', err.code, err.message);
      closePresenceConsentModal();
      showToast('位置情報を取得できませんでした。端末の設定をご確認ください。');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function openPresenceCommentModal() {
  document.getElementById('presence-comment').value = '';
  document.getElementById('presence-form-error').textContent = '';
  document.getElementById('presence-comment-overlay').style.display = 'flex';
}

function closePresenceCommentModal() {
  document.getElementById('presence-comment-overlay').style.display = 'none';
  pendingCheckinCoords = null;
}

function updateCheckinButtonUI() {
  const btn = document.getElementById('presence-checkin-btn');
  if (!btn) return;
  if (myPresenceId && myPresenceExpiresAt) {
    btn.classList.add('checked-in');
    btn.textContent = `✓ チェックイン中（残り${formatRemaining(myPresenceExpiresAt.getTime() - Date.now())}）`;
  } else {
    btn.classList.remove('checked-in');
    btn.textContent = '📍 下北沢にチェックイン';
  }
}

function startPresenceCountdown() {
  clearPresenceCountdown();
  presenceCountdownTimer = setInterval(() => {
    if (!myPresenceExpiresAt || Date.now() >= myPresenceExpiresAt.getTime()) {
      myPresenceId = null;
      myPresenceExpiresAt = null;
      clearPresenceCountdown();
      updateCheckinButtonUI();
      if (gmap && mapMode === 'presence') renderMarkers();
      return;
    }
    updateCheckinButtonUI();
  }, 60000);
}

function clearPresenceCountdown() {
  if (presenceCountdownTimer) {
    clearInterval(presenceCountdownTimer);
    presenceCountdownTimer = null;
  }
}

async function submitPresenceCheckin(e) {
  e.preventDefault();
  if (!currentUser) {
    openMyPage();
    return;
  }
  if (!pendingCheckinCoords) {
    showToast('位置情報の取得からやり直してください。');
    closePresenceCommentModal();
    return;
  }
  const commentInput = document.getElementById('presence-comment');
  const errEl = document.getElementById('presence-form-error');
  const btn = document.getElementById('presence-submit-btn');
  errEl.textContent = '';
  const comment = commentInput.value.trim().slice(0, 40);

  btn.disabled = true;
  try {
    const expiresAt = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 3 * 60 * 60 * 1000));
    const docRef = await db.collection('presence').add({
      userId: currentUser.uid,
      lat: pendingCheckinCoords.lat,
      lng: pendingCheckinCoords.lng,
      comment,
      checkedInAt: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt,
    });
    myPresenceId = docRef.id;
    myPresenceExpiresAt = expiresAt.toDate();
    startPresenceCountdown();
    updateCheckinButtonUI();
    closePresenceCommentModal();
    showToast('📍 チェックインしました！');
    if (gmap && mapMode === 'presence') renderMarkers();
  } catch (err) {
    console.error('presence checkin error:', err.code, err.message);
    errEl.textContent = 'チェックインに失敗しました。もう一度お試しください。';
  } finally {
    btn.disabled = false;
  }
}

async function handlePresenceCheckout() {
  if (!myPresenceId) return;
  const id = myPresenceId;
  myPresenceId = null;
  myPresenceExpiresAt = null;
  clearPresenceCountdown();
  updateCheckinButtonUI();
  try {
    await db.collection('presence').doc(id).delete();
    showToast('チェックアウトしました');
    if (gmap && mapMode === 'presence') renderMarkers();
  } catch (err) {
    console.error('presence checkout error:', err.code, err.message);
    showToast('チェックアウトに失敗しました');
  }
}

// ── RESTORE ON LOGIN ──
auth.onAuthStateChanged(user => {
  if (!user) {
    myPresenceId = null;
    myPresenceExpiresAt = null;
    clearPresenceCountdown();
    updateCheckinButtonUI();
    if (gmap && mapMode === 'presence') renderMarkers();
    return;
  }
  db.collection('presence').where('userId', '==', user.uid).get().then(snapshot => {
    const now = Date.now();
    let active = null;
    snapshot.docs.forEach(doc => {
      const exp = doc.data().expiresAt;
      if (exp && exp.toDate().getTime() > now && (!active || exp.toDate().getTime() > active.exp)) {
        active = { id: doc.id, exp: exp.toDate().getTime(), date: exp.toDate() };
      }
    });
    if (active) {
      myPresenceId = active.id;
      myPresenceExpiresAt = active.date;
      startPresenceCountdown();
    }
    updateCheckinButtonUI();
    if (gmap && mapMode === 'presence') renderMarkers();
  }).catch(err => console.error('presence restore error:', err.code, err.message));
});

// ── PROXIMITY CLUSTERING ──
// 簡易版：一定距離内(約40m)のチェックインを1つのピンにまとめる。
// Google Maps標準のMarkerClustererは導入せず、この距離ベースの軽量版で
// 「吹き出しが重ならないよう縦にずらす」要件と両立させている。
function clusterPresenceEntries(entries, thresholdDeg = 0.0004) {
  const clusters = [];
  entries.forEach(e => {
    const cluster = clusters.find(c => {
      const dLat = c.lat - e.lat;
      const dLng = c.lng - e.lng;
      return Math.sqrt(dLat * dLat + dLng * dLng) < thresholdDeg;
    });
    if (cluster) {
      cluster.entries.push(e);
    } else {
      clusters.push({ lat: e.lat, lng: e.lng, entries: [e] });
    }
  });
  return clusters;
}

// ── BUBBLE OVERLAY (lazy-defined; google.maps loads async) ──
function getPresenceBubbleClass() {
  if (window.PresenceBubbleOverlay) return window.PresenceBubbleOverlay;
  class PresenceBubbleOverlay extends google.maps.OverlayView {
    constructor(position, offsetIndex, entry) {
      super();
      this.position = position;
      this.offsetIndex = offsetIndex;
      this.entry = entry;
      this.div = null;
    }
    onAdd() {
      const entry = this.entry;
      const div = document.createElement('div');
      div.className = 'presence-bubble';
      div.innerHTML = `
        <span class="presence-bubble-text"></span>
        <button type="button" class="presence-bubble-report">⚠</button>
      `;
      div.querySelector('.presence-bubble-text').textContent = entry.comment || '📍 チェックイン中';
      div.addEventListener('click', e => {
        e.stopPropagation();
        openProfileViewModal(entry.userId, entry.checkedInAt);
      });
      div.querySelector('.presence-bubble-report').addEventListener('click', e => {
        e.stopPropagation();
        handlePresenceReport(entry.id);
      });
      this.div = div;
      this.getPanes().overlayMouseTarget.appendChild(div);
    }
    draw() {
      const projection = this.getProjection();
      if (!projection || !this.div) return;
      const pos = projection.fromLatLngToDivPixel(this.position);
      if (pos) {
        this.div.style.left = pos.x + 'px';
        this.div.style.top = (pos.y - 46 - this.offsetIndex * 34) + 'px';
      }
    }
    onRemove() {
      if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div);
      this.div = null;
    }
  }
  window.PresenceBubbleOverlay = PresenceBubbleOverlay;
  return PresenceBubbleOverlay;
}

// ── MAP RENDERING ──
function clearPresenceMarkers() {
  presenceMarkers.forEach(m => m.setMap(null));
  presenceMarkers = [];
  presenceBubbles.forEach(b => b.setMap(null));
  presenceBubbles = [];
}

async function refreshPresenceMarkers() {
  if (!gmap) return;
  clearPresenceMarkers();
  const emptyStateEl = document.getElementById('map-empty-state');
  if (!currentUser) {
    if (emptyStateEl) {
      emptyStateEl.innerHTML = '<div><div>ログインすると、コミュニティメンバーの<br>チェックインが見られます。</div><button class="btn-primary" style="margin-top:12px" onclick="openMyPage()">ログインする</button></div>';
      emptyStateEl.style.display = 'flex';
    }
    return;
  }
  try {
    const snapshot = await db.collection('presence')
      .where('expiresAt', '>', firebase.firestore.Timestamp.now())
      .get();

    if (snapshot.empty) {
      if (emptyStateEl) {
        emptyStateEl.innerHTML = 'まだ誰もチェックインしていません。<br>最初の一人になってみませんか？';
        emptyStateEl.style.display = 'flex';
      }
      return;
    }
    if (emptyStateEl) emptyStateEl.style.display = 'none';

    const entries = snapshot.docs.map(doc => {
      const d = { id: doc.id, ...doc.data() };
      presenceDataCache[d.id] = d;
      return d;
    });
    const clusters = clusterPresenceEntries(entries);
    const BubbleClass = getPresenceBubbleClass();

    clusters.forEach(cluster => {
      const position = new google.maps.LatLng(cluster.lat, cluster.lng);
      const marker = new google.maps.Marker({
        position,
        map: gmap,
        title: cluster.entries.length > 1 ? `${cluster.entries.length}人がチェックイン中` : 'チェックイン中',
        icon: {
          url: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
          scaledSize: new google.maps.Size(32, 32),
        },
        label: {
          text: `👤${cluster.entries.length > 1 ? '×' + cluster.entries.length : ''}`,
          color: '#1A1A1A',
          fontSize: '11px',
          fontWeight: '700',
        },
        zIndex: 20,
      });
      marker.addListener('click', () => openPresenceInfoModal(cluster.entries.map(e => e.id)));
      presenceMarkers.push(marker);

      cluster.entries.forEach((entry, i) => {
        const bubble = new BubbleClass(position, i, entry);
        bubble.setMap(gmap);
        presenceBubbles.push(bubble);
      });
    });
  } catch (err) {
    console.error('refreshPresenceMarkers error:', err.code, err.message);
  }
}

// ── PRESENCE INFO MODAL (list of users at one pin) ──
function openPresenceInfoModal(ids) {
  const entries = ids.map(id => presenceDataCache[id]).filter(Boolean);
  if (entries.length === 0) return;
  document.getElementById('presence-info-overlay').style.display = 'flex';
  renderPresenceInfoSheet(entries);
}

function closePresenceInfoModal() {
  document.getElementById('presence-info-overlay').style.display = 'none';
}

async function renderPresenceInfoSheet(entries) {
  const sheet = document.getElementById('presence-info-sheet');
  sheet.innerHTML = '<div class="timeline-empty">読み込み中...</div>';
  const uids = [...new Set(entries.map(e => e.userId))];
  await Promise.all(uids.map(async uid => {
    if (presenceUserCache[uid]) return;
    try {
      const doc = await db.collection('users').doc(uid).get();
      presenceUserCache[uid] = doc.exists ? doc.data() : { name: '不明なユーザー' };
    } catch (err) {
      presenceUserCache[uid] = { name: '不明なユーザー' };
    }
  }));
  sheet.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">📍 チェックイン中${entries.length > 1 ? `（${entries.length}人）` : ''}</div>
      <button class="modal-close" onclick="closePresenceInfoModal()">×</button>
    </div>
    ${entries.map(e => {
      const u = presenceUserCache[e.userId] || {};
      return `
      <div class="presence-info-card">
        <div class="presence-info-row" onclick="openProfileViewModal('${e.userId}', null)">
          <div class="presence-avatar">🌿</div>
          <div style="flex:1;min-width:0">
            <div class="presence-info-name">${escapeHtml(u.name || '不明なユーザー')}</div>
            <div class="presence-info-time">${formatTimeAgo(e.checkedInAt)}</div>
          </div>
        </div>
        ${e.comment ? `<div class="presence-info-comment">${escapeHtml(e.comment)}</div>` : ''}
        <div class="presence-info-actions">
          <button class="timeline-report-btn" onclick="handlePresenceReport('${e.id}')">⚠ 通報</button>
        </div>
      </div>`;
    }).join('')}
  `;
}

async function handlePresenceReport(presenceId) {
  if (!currentUser) {
    openMyPage();
    return;
  }
  const reason = prompt('通報理由を入力してください（任意）', '');
  if (reason === null) return;
  try {
    await db.collection('reports').add({
      presenceId,
      reporterId: currentUser.uid,
      reason: reason || '理由未記入',
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('通報しました。ご協力ありがとうございます');
  } catch (err) {
    console.error('presence report error:', err.code, err.message);
    showToast('通報に失敗しました。もう一度お試しください。');
  }
}

// ── PROFILE VIEW MODAL ──
async function openProfileViewModal(uid, checkedInAt) {
  const overlay = document.getElementById('profile-view-overlay');
  const sheet = document.getElementById('profile-view-sheet');
  sheet.innerHTML = '<div class="timeline-empty">読み込み中...</div>';
  overlay.style.display = 'flex';
  try {
    let u = presenceUserCache[uid];
    if (!u) {
      const doc = await db.collection('users').doc(uid).get();
      u = doc.exists ? doc.data() : null;
      presenceUserCache[uid] = u;
    }
    if (!u) {
      sheet.innerHTML = '<div class="timeline-empty">プロフィールが見つかりません。</div>';
      return;
    }
    const rel = typeof getRelationshipState === 'function'
      ? await getRelationshipState(uid)
      : { state: 'self' };
    sheet.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">${escapeHtml(u.name || '不明なユーザー')}</div>
        <button class="modal-close" onclick="closeProfileViewModal()">×</button>
      </div>
      <div class="profile-view-body">
        ${checkedInAt ? `<div class="profile-view-row"><span class="profile-view-label">チェックイン</span><span>${formatTimeAgo(checkedInAt)}</span></div>` : ''}
        <div class="profile-view-row"><span class="profile-view-label">趣味</span><span>${escapeHtml(u.hobby || '未設定')}</span></div>
        <div class="profile-view-row"><span class="profile-view-label">自己紹介</span><span>${escapeHtml(u.bio || '未設定')}</span></div>
      </div>
      ${typeof renderRelationshipActionHtml === 'function' ? renderRelationshipActionHtml(uid, rel) : ''}
    `;
  } catch (err) {
    console.error('profile view error:', err.code, err.message);
    sheet.innerHTML = '<div class="timeline-empty">読み込みに失敗しました。</div>';
  }
}

function closeProfileViewModal() {
  document.getElementById('profile-view-overlay').style.display = 'none';
}
