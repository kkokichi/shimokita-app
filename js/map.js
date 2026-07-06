// ── MAP (Google Maps) ──
let gmap = null;
let gmMarkers = [];
let mapMode = 'spots'; // 'spots' | 'presence'

// ── FIRESTORE MIGRATION（一度だけ・冪等） ──
// 本番実行は手動トリガーのみ（index.htmlのinitスクリプトからは呼び出さない）。
async function migrateSeedSpotsOnce() {
  const existing = await db.collection('spots').limit(1).get();
  if (!existing.empty) {
    console.log('migrateSeedSpotsOnce: skip（spotsコレクションに既存データがあります）');
    return;
  }
  const batch = db.batch();
  SEED_SPOTS.forEach(s => {
    const { id, ...rest } = s;
    batch.set(db.collection('spots').doc(id), rest);
  });
  await batch.commit();
  console.log(`migrateSeedSpotsOnce: ${SEED_SPOTS.length}件のスポットを移行しました`);
}

// ── LIVE LISTENER ──
function initSpotsListener() {
  db.collection('spots').onSnapshot(snapshot => {
    spots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderMap();
    if (typeof renderOrganizerSpotManagement === 'function') renderOrganizerSpotManagement();
  }, err => console.error('spots onSnapshot error:', err.code, err.message));
}

function initMap() {
  gmap = new google.maps.Map(document.getElementById('gmap-div'), {
    center: { lat: 35.6618, lng: 139.6663 },
    zoom: 16,
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
    styles: [
      { featureType:'poi', elementType:'labels', stylers:[{ visibility:'off' }] },
    ],
    gestureHandling: 'greedy',
  });
  // 下北沢駅マーカー
  new google.maps.Marker({
    position: { lat: 35.6618, lng: 139.6663 },
    map: gmap,
    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor:'#1C3A2F', fillOpacity:1, strokeColor:'white', strokeWeight:2 },
    zIndex: 10,
    title: '下北沢駅',
  });
  renderMarkers();
  // マップタブが既に表示中なら即リサイズ
  if (currentScreen === 'map') {
    setTimeout(() => google.maps.event.trigger(gmap, 'resize'), 50);
  }
  if (typeof initHomeMiniMap === 'function') initHomeMiniMap();
}

function renderMap() {
  document.getElementById('cat-tabs').innerHTML = Object.keys(catConfig).map(cat => `
    <button class="cat-tab ${cat === activeCategory ? 'active' : ''}" onclick="switchCategory('${cat}')">
      ${catConfig[cat].icon} ${cat}
    </button>
  `).join('');
  if (gmap) renderMarkers();
  renderSpotsList();
}

function switchCategory(cat) {
  activeCategory = cat;
  document.getElementById('map-info').style.display = 'none';
  renderMap();
}

function switchMapMode(mode) {
  mapMode = mode;
  document.getElementById('mode-btn-spots').classList.toggle('active', mode === 'spots');
  document.getElementById('mode-btn-presence').classList.toggle('active', mode === 'presence');
  document.getElementById('cat-tabs').style.display = mode === 'spots' ? 'flex' : 'none';
  document.getElementById('spots-list').style.display = mode === 'spots' ? 'block' : 'none';
  document.getElementById('map-info').style.display = 'none';
  document.getElementById('map-empty-state').style.display = 'none';
  renderMarkers();
}

function clearSpotMarkers() {
  gmMarkers.forEach(m => m.setMap(null));
  gmMarkers = [];
}

function renderMarkers() {
  if (!gmap) return;
  if (mapMode === 'presence') {
    clearSpotMarkers();
    refreshPresenceMarkers();
    return;
  }
  document.getElementById('map-empty-state').style.display = 'none';
  if (typeof clearPresenceMarkers === 'function') clearPresenceMarkers();
  const cfg = catConfig[activeCategory];
  clearSpotMarkers();
  const filtered = spots.filter(s => s.cat === activeCategory);
  const bounds = new google.maps.LatLngBounds();
  filtered.forEach(s => {
    const marker = new google.maps.Marker({
      position: { lat: s.lat, lng: s.lng },
      map: gmap,
      title: s.name,
      icon: {
        url: cfg.pin,
        scaledSize: new google.maps.Size(32, 32),
      },
      label: {
        text: s.icon + ' ' + (s.name.length > 7 ? s.name.slice(0,7)+'…' : s.name),
        color: '#1A1A1A',
        fontSize: '11px',
        fontWeight: '700',
        className: 'gmap-label',
      },
    });
    marker.addListener('click', () => showSpotInfo(s.id));
    gmMarkers.push(marker);
    bounds.extend({ lat: s.lat, lng: s.lng });
  });
  if (filtered.length > 1) {
    gmap.fitBounds(bounds, { top:40, bottom:40, left:40, right:40 });
    google.maps.event.addListenerOnce(gmap, 'idle', () => {
      if (gmap.getZoom() > 17) gmap.setZoom(17);
    });
  } else if (filtered.length === 1) {
    gmap.setCenter({ lat: filtered[0].lat, lng: filtered[0].lng });
    gmap.setZoom(17);
  }
}

function showSpotInfo(id) {
  const s = spots.find(sp => sp.id === id);
  if (!s) return;
  const cfg = catConfig[activeCategory];
  const card = document.getElementById('map-info');
  card.style.display = 'block';
  card.innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:14px;cursor:pointer" onclick="showSpotDetail('${s.id}')"><div style="width:42px;height:42px;border-radius:10px;background:${cfg.bg};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${s.icon}</div><div style="flex:1;min-width:0"><div class="map-info-name">${s.name}</div><div class="map-info-desc">${s.desc}</div>${s.rating ? `<div class="map-info-rating">★ ${s.rating}</div>` : ''}</div><div onclick="event.stopPropagation();document.getElementById('map-info').style.display='none'" style="color:var(--ink-soft);font-size:20px;cursor:pointer;padding:4px;flex-shrink:0">×</div></div>`;
  if (gmap) gmap.panTo({ lat: s.lat, lng: s.lng });
}

function renderSpotsList() {
  const cfg = catConfig[activeCategory];
  const filtered = spots.filter(s => s.cat === activeCategory);
  document.getElementById('spots-list').innerHTML = `
    <div style="padding:0 0 8px"><div class="section-title">${activeCategory} 一覧</div></div>
    ${filtered.map(s => `
    <div class="spot-card" onclick="showSpotDetail('${s.id}')">
      <div class="spot-icon" style="background:${cfg.bg};overflow:hidden">${s.imageUrl ? `<img src="${s.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover">` : s.icon}</div>
      <div style="flex:1;min-width:0"><div class="spot-name">${escapeHtml(s.name)}</div><div class="spot-desc">${escapeHtml(s.desc)}</div>${s.rating ? `<div class="spot-rating">★ ${escapeHtml(s.rating)}</div>` : ''}</div>
      <button class="icon-toggle-btn ${isSpotFavorite(s.id) ? 'active' : ''}" onclick="event.stopPropagation();toggleFavoriteSpot('${s.id}', this)">♡</button>
    </div>`).join('')}
  `;
}

function showSpotDetail(id) {
  const s = spots.find(sp => sp.id === id);
  if (!s) return;
  renderSpotDetail(s);
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById('spot-detail').classList.add('active');
  document.getElementById('spot-detail').scrollTop = 0;
  prevScreen = currentScreen;
  currentScreen = 'spot-detail';
}

function renderSpotDetail(s) {
  const cfg = catConfig[s.cat];
  const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.name + ' ' + s.address);
  document.getElementById('spot-detail-content').innerHTML = `
    <div class="detail-banner" style="background:${cfg.bg}">
      ${s.imageUrl ? `<img src="${s.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<div class="detail-banner-emoji">${s.icon}</div>`}
    </div>
    <div class="detail-body">
      <div class="detail-category" style="display:flex;align-items:center;justify-content:space-between">
        <span class="pill" style="background:${cfg.bg};color:${cfg.color}">${escapeHtml(s.cat)}</span>
        <button class="icon-toggle-btn ${isSpotFavorite(s.id) ? 'active' : ''}" style="font-size:26px" onclick="toggleFavoriteSpot('${s.id}', this)">♡</button>
      </div>
      <div class="detail-title">${escapeHtml(s.name)}</div>
      <div class="detail-info-row">
        <div class="detail-info-icon">📍</div>
        <div><div class="detail-info-label">住所</div><div class="detail-info-value">${escapeHtml(s.address)}</div></div>
      </div>
      ${s.hours ? `<div class="detail-info-row">
        <div class="detail-info-icon">🕒</div>
        <div><div class="detail-info-label">営業時間</div><div class="detail-info-value">${escapeHtml(s.hours)}</div></div>
      </div>` : ''}
      ${s.phone ? `<div class="detail-info-row">
        <div class="detail-info-icon">📞</div>
        <div><div class="detail-info-label">電話番号</div><div class="detail-info-value">${escapeHtml(s.phone)}</div></div>
      </div>` : ''}
      ${s.rating ? `<div class="detail-info-row">
        <div class="detail-info-icon">★</div>
        <div><div class="detail-info-label">評価</div><div class="detail-info-value">${escapeHtml(s.rating)}</div></div>
      </div>` : ''}
      <a class="detail-map-placeholder" href="${mapUrl}" target="_blank" rel="noopener" style="text-decoration:none">
        <div class="detail-map-icon">🗺</div>
        <div class="detail-map-text">Google マップで開く</div>
        <div style="font-size:11px;color:var(--forest);opacity:0.7">${escapeHtml(s.address)}</div>
      </a>
      <div class="detail-desc-label">お店について</div>
      <div class="detail-desc">${escapeHtml(s.desc)}</div>
    </div>
  `;
}

// ── SPOT CREATE / EDIT（主催者ダッシュボード） ──
let editingSpotId = null;
let editingSpotImageUrl = null;

function populateSpotCatSelect(selected) {
  const select = document.getElementById('spot-edit-cat');
  select.innerHTML = Object.keys(catConfig).map(cat =>
    `<option value="${cat}"${cat === selected ? ' selected' : ''}>${catConfig[cat].icon} ${cat}</option>`).join('');
}

function switchSpotImageMode(mode) {
  document.getElementById('spot-edit-icon').style.display = mode === 'emoji' ? 'block' : 'none';
  document.getElementById('spot-edit-image').style.display = mode === 'image' ? 'block' : 'none';
}

async function uploadSpotImage(file) {
  const path = `spot-images/${Date.now()}_${currentUser.uid}_${file.name}`;
  return uploadImageWithTimeout(path, file);
}

function openSpotCreateModal() {
  if (!userProfile || userProfile.role !== 'organizer') {
    showToast('主催者のみスポットを追加できます');
    return;
  }
  editingSpotId = null;
  editingSpotImageUrl = null;
  document.getElementById('spot-edit-form').reset();
  document.getElementById('spot-edit-error').textContent = '';
  document.getElementById('spot-edit-modal-title').textContent = '📍 スポットを追加';
  document.getElementById('spot-edit-submit-btn').textContent = '追加する';
  populateSpotCatSelect(Object.keys(catConfig)[0]);
  switchSpotImageMode('emoji');
  document.getElementById('spot-edit-overlay').style.display = 'flex';
}

function openSpotEditModal(spotId) {
  if (!userProfile || userProfile.role !== 'organizer') {
    showToast('主催者のみ編集できます');
    return;
  }
  const s = spots.find(sp => sp.id === spotId);
  if (!s) return;
  editingSpotId = spotId;
  editingSpotImageUrl = s.imageUrl || null;
  document.getElementById('spot-edit-form').reset();
  document.getElementById('spot-edit-error').textContent = '';
  document.getElementById('spot-edit-modal-title').textContent = 'スポットを編集';
  document.getElementById('spot-edit-submit-btn').textContent = '更新する';
  populateSpotCatSelect(s.cat);
  document.getElementById('spot-edit-name').value = s.name || '';
  document.getElementById('spot-edit-desc').value = s.desc || '';
  document.getElementById('spot-edit-address').value = s.address || '';
  document.getElementById('spot-edit-lat').value = s.lat != null ? s.lat : '';
  document.getElementById('spot-edit-lng').value = s.lng != null ? s.lng : '';
  document.getElementById('spot-edit-hours').value = s.hours || '';
  document.getElementById('spot-edit-phone').value = s.phone || '';
  document.getElementById('spot-edit-rating').value = s.rating || '';
  document.getElementById('spot-edit-icon').value = s.icon || '';
  switchSpotImageMode('emoji');
  document.getElementById('spot-edit-overlay').style.display = 'flex';
}

function closeSpotEditModal() {
  document.getElementById('spot-edit-overlay').style.display = 'none';
}

async function submitSpotEdit(e) {
  e.preventDefault();
  const name = document.getElementById('spot-edit-name').value.trim();
  const cat = document.getElementById('spot-edit-cat').value;
  const desc = document.getElementById('spot-edit-desc').value.trim();
  const address = document.getElementById('spot-edit-address').value.trim();
  const lat = parseFloat(document.getElementById('spot-edit-lat').value);
  const lng = parseFloat(document.getElementById('spot-edit-lng').value);
  const hours = document.getElementById('spot-edit-hours').value.trim() || null;
  const phone = document.getElementById('spot-edit-phone').value.trim() || null;
  const rating = document.getElementById('spot-edit-rating').value.trim() || null;
  const icon = document.getElementById('spot-edit-icon').value.trim() || '📍';
  const imageFile = document.getElementById('spot-edit-image').files[0] || null;
  const errEl = document.getElementById('spot-edit-error');
  const btn = document.getElementById('spot-edit-submit-btn');
  errEl.textContent = '';

  if (!name || !cat || !desc || !address || isNaN(lat) || isNaN(lng)) {
    errEl.textContent = '必須項目を入力してください。';
    return;
  }
  if (imageFile && imageFile.size > 5 * 1024 * 1024) {
    errEl.textContent = '画像は5MB以下にしてください。';
    return;
  }

  btn.disabled = true;
  const originalBtnText = btn.textContent;
  try {
    let imageUrl = editingSpotId ? editingSpotImageUrl : null;
    if (imageFile) {
      btn.textContent = '画像をアップロード中...';
      try {
        imageUrl = await uploadSpotImage(imageFile);
      } catch (uploadErr) {
        console.error('spot image upload error:', uploadErr.code, uploadErr.message);
        errEl.textContent = uploadErr.message && uploadErr.message.includes('タイムアウト')
          ? uploadErr.message
          : '画像のアップロードに失敗しました。絵文字に切り替えるか、もう一度お試しください。';
        return;
      }
      btn.textContent = originalBtnText;
    }
    const data = { name, cat, desc, address, lat, lng, hours, phone, rating, icon, imageUrl };
    if (editingSpotId) {
      await db.collection('spots').doc(editingSpotId).update(data);
      showToast('スポットを更新しました');
    } else {
      await db.collection('spots').add(data);
      showToast('スポットを追加しました');
    }
    closeSpotEditModal();
  } catch (err) {
    console.error('spot create/update error:', err.code, err.message);
    errEl.textContent = (editingSpotId ? '更新' : '追加') + 'に失敗しました。もう一度お試しください。';
  } finally {
    btn.disabled = false;
    btn.textContent = originalBtnText;
  }
}
