// ── MAP (Google Maps) ──
let gmap = null;
let gmMarkers = [];
let mapMode = 'spots'; // 'spots' | 'presence'
let firestoreSpots = [];
const googleSpotsByCategory = {};
const googlePlacesState = {}; // category -> 'loading' | 'loaded' | 'error'
const SHIMOKITA_CENTER = { lat: 35.6618, lng: 139.6663 };
const GOOGLE_PLACE_QUERIES = {
  'カフェ': '下北沢 カフェ',
  '古着': '下北沢 古着屋',
  'サウナ': '下北沢 サウナ 銭湯',
  'ライブハウス': '下北沢 ライブハウス',
  'カレー': '下北沢 カレー',
};

function safeSpotUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (_) {
    return '';
  }
}

function distanceFromShimokitazawa(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const toRad = value => value * Math.PI / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat - SHIMOKITA_CENTER.lat);
  const dLng = toRad(lng - SHIMOKITA_CENTER.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(SHIMOKITA_CENTER.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatSpotPriceLevel(priceLevel) {
  if (!priceLevel) return null;
  const key = String(priceLevel).replace(/[^a-z]/gi, '').toLowerCase();
  return {
    free: '無料',
    inexpensive: '¥ 手頃',
    moderate: '¥¥ 標準的',
    expensive: '¥¥¥ 高め',
    veryexpensive: '¥¥¥¥ 高価格帯',
  }[key] || null;
}

function formatBusinessStatus(status) {
  return {
    OPERATIONAL: '通常営業として登録',
    CLOSED_TEMPORARILY: '一時休業中',
    CLOSED_PERMANENTLY: '閉業',
  }[String(status || '').toUpperCase()] || null;
}

function buildSpotHighlights(spot) {
  const highlights = [];
  if (spot.source === 'google' && spot.googleRank) {
    highlights.push(`Google検索「${spot.cat}」の上位${spot.googleRank}件目`);
  }
  const rating = Number(spot.rating);
  if (rating >= 4.7 && spot.ratingCount >= 50) {
    highlights.push(`高評価 ${rating.toFixed(1)}／口コミ${spot.ratingCount.toLocaleString()}件`);
  } else if (spot.ratingCount >= 300) {
    highlights.push(`口コミ${spot.ratingCount.toLocaleString()}件以上で比較しやすい`);
  }
  if (spot.walkMinutes) highlights.push(`下北沢駅から徒歩約${spot.walkMinutes}分の目安`);
  if (spot.hoursList?.length) highlights.push('曜日別の営業時間を確認できる');
  return highlights.slice(0, 4);
}

function rebuildSpots() {
  const googleCategories = new Set(Object.keys(googleSpotsByCategory));
  const merged = [
    ...Object.values(googleSpotsByCategory).flat(),
    ...SEED_SPOTS.filter(spot => !googleCategories.has(spot.cat)).map(spot => ({ ...spot })),
  ];
  const seen = new Set(merged.map(spot => `${spot.cat}:${spot.name}`.toLowerCase()));
  firestoreSpots.forEach(spot => {
    const key = `${spot.cat}:${spot.name}`.toLowerCase();
    if (!seen.has(key)) {
      merged.push(spot);
      seen.add(key);
    }
  });
  spots = merged;
}

function googlePlaceToSpot(place, category, index) {
  const cfg = catConfig[category];
  const location = place.location;
  const lat = typeof location?.lat === 'function' ? location.lat() : location?.lat;
  const lng = typeof location?.lng === 'function' ? location.lng() : location?.lng;
  const rating = Number.isFinite(place.rating) ? place.rating.toFixed(1) : null;
  const ratingCount = Number.isFinite(place.userRatingCount) ? place.userRatingCount : null;
  const distanceMeters = distanceFromShimokitazawa(lat, lng);
  const firstPhoto = place.photos?.[0] || null;
  const photoAttributions = (firstPhoto?.authorAttributions || [])
    .map(author => ({ name: author.displayName || '', url: safeSpotUrl(author.uri) }))
    .filter(author => author.name);
  const spot = {
    id: `google-${place.id || `${category}-${index}`}`,
    googlePlaceId: place.id || null,
    googleMapsUrl: safeSpotUrl(place.googleMapsURI),
    source: 'google',
    googleRank: index + 1,
    name: place.displayName || GOOGLE_PLACE_QUERIES[category],
    cat: category,
    lat,
    lng,
    address: place.formattedAddress || '下北沢エリア',
    desc: ratingCount
      ? `Googleマップで評価${rating || '-'}・口コミ${ratingCount.toLocaleString()}件`
      : `Googleマップで上位の${category}スポット`,
    rating,
    ratingCount,
    distanceMeters,
    walkMinutes: distanceMeters == null ? null : Math.max(1, Math.round(distanceMeters / 75)),
    businessStatus: formatBusinessStatus(place.businessStatus),
    hoursList: place.currentOpeningHours?.weekdayDescriptions || [],
    phone: place.nationalPhoneNumber || null,
    websiteUrl: safeSpotUrl(place.websiteURI),
    priceLabel: formatSpotPriceLevel(place.priceLevel),
    placeType: place.primaryTypeDisplayName || null,
    imageUrl: firstPhoto ? safeSpotUrl(firstPhoto.getURI({ maxWidth: 900, maxHeight: 600 })) : null,
    photoAttributions,
    icon: cfg.icon,
  };
  spot.highlights = buildSpotHighlights(spot);
  return spot;
}

async function loadGooglePlacesForCategory(category) {
  if (!gmap || googlePlacesState[category] === 'loading' || googlePlacesState[category] === 'loaded') return;
  googlePlacesState[category] = 'loading';
  renderSpotsList();
  try {
    const { Place, SearchByTextRankPreference } = await google.maps.importLibrary('places');
    const { places } = await Place.searchByText({
      textQuery: GOOGLE_PLACE_QUERIES[category],
      fields: [
        'id', 'displayName', 'location', 'formattedAddress', 'rating', 'userRatingCount',
        'googleMapsURI', 'businessStatus', 'currentOpeningHours', 'nationalPhoneNumber',
        'websiteURI', 'priceLevel', 'photos', 'primaryTypeDisplayName',
      ],
      locationBias: { center: SHIMOKITA_CENTER, radius: 1800 },
      language: 'ja',
      region: 'JP',
      maxResultCount: 8,
      rankPreference: SearchByTextRankPreference.RELEVANCE,
    });
    const googleSpots = (places || [])
      .map((place, index) => googlePlaceToSpot(place, category, index))
      .filter(spot => Number.isFinite(spot.lat) && Number.isFinite(spot.lng));
    if (googleSpots.length === 0) throw new Error('Google Places returned no results');
    googleSpotsByCategory[category] = googleSpots;
    googlePlacesState[category] = 'loaded';
    rebuildSpots();
  } catch (err) {
    googlePlacesState[category] = 'error';
    console.warn(`Google Places fetch failed (${category}); using fallback spots:`, err.message);
    rebuildSpots();
  }
  renderMap();
}

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
    firestoreSpots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    rebuildSpots();
    renderMap();
    if (typeof renderOrganizerSpotManagement === 'function') renderOrganizerSpotManagement();
  }, err => {
    // デプロイ済みルールが古い等でFirestoreを読めなくても、
    // Google Placesまたはシードデータを維持する。
    console.warn('spots onSnapshot unavailable; using Google/fallback spots:', err.code, err.message);
    rebuildSpots();
    renderMap();
  });
}

function initMap() {
  gmap = new google.maps.Map(document.getElementById('gmap-div'), {
    center: SHIMOKITA_CENTER,
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
  loadGooglePlacesForCategory(activeCategory);
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
  loadGooglePlacesForCategory(cat);
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
  card.innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:14px;cursor:pointer" onclick="showSpotDetail('${escapeHtml(s.id)}')"><div style="width:42px;height:42px;border-radius:10px;background:${cfg.bg};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${escapeHtml(s.icon)}</div><div style="flex:1;min-width:0"><div class="map-info-name">${escapeHtml(s.name)}</div><div class="map-info-desc">${escapeHtml(s.desc)}</div>${s.rating ? `<div class="map-info-rating">★ ${escapeHtml(s.rating)}${s.ratingCount ? ` (${escapeHtml(s.ratingCount.toLocaleString())}件)` : ''}</div>` : ''}</div><div onclick="event.stopPropagation();document.getElementById('map-info').style.display='none'" style="color:var(--ink-soft);font-size:20px;cursor:pointer;padding:4px;flex-shrink:0">×</div></div>`;
  if (gmap) gmap.panTo({ lat: s.lat, lng: s.lng });
}

function renderSpotsList() {
  const cfg = catConfig[activeCategory];
  const filtered = spots.filter(s => s.cat === activeCategory);
  const state = googlePlacesState[activeCategory];
  const sourceNote = state === 'loading'
    ? '<div class="spots-source-note">Googleマップの上位スポットを読み込み中...</div>'
    : state === 'loaded'
      ? '<div class="spots-source-note">📍 Googleマップの関連度順</div>'
      : state === 'error'
        ? '<div class="spots-source-note">Googleの取得に失敗したため、登録済みスポットを表示中</div>'
        : '';
  document.getElementById('spots-list').innerHTML = `
    <div style="padding:0 0 8px"><div class="section-title">${activeCategory} 一覧</div></div>
    ${sourceNote}
    ${filtered.map(s => `
    <div class="spot-card" onclick="showSpotDetail('${s.id}')">
      <div class="spot-icon" style="background:${cfg.bg};overflow:hidden">${s.imageUrl ? `<img src="${s.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover">` : s.icon}</div>
      <div style="flex:1;min-width:0"><div class="spot-name">${escapeHtml(s.name)}</div><div class="spot-desc">${escapeHtml(s.desc)}</div>${s.rating ? `<div class="spot-rating">★ ${escapeHtml(s.rating)}${s.ratingCount ? ` (${escapeHtml(s.ratingCount.toLocaleString())}件)` : ''}</div>` : ''}</div>
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
  const mapUrl = safeSpotUrl(s.googleMapsUrl) || ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.name + ' ' + s.address));
  const websiteUrl = safeSpotUrl(s.websiteUrl);
  const highlights = s.highlights?.length ? s.highlights : buildSpotHighlights(s);
  const phoneHref = s.phone ? `tel:${String(s.phone).replace(/[^+\d]/g, '')}` : '';
  document.getElementById('spot-detail-content').innerHTML = `
    <div class="detail-banner" style="background:${cfg.bg}">
      ${s.imageUrl ? `<img src="${escapeHtml(s.imageUrl)}" alt="${escapeHtml(s.name)}" style="width:100%;height:100%;object-fit:cover">` : `<div class="detail-banner-emoji">${escapeHtml(s.icon)}</div>`}
      ${s.photoAttributions?.length ? `<div class="spot-photo-credit">写真: ${s.photoAttributions.map(author => author.url ? `<a href="${escapeHtml(author.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(author.name)}</a>` : escapeHtml(author.name)).join(', ')}</div>` : ''}
    </div>
    <div class="detail-body">
      <div class="detail-category" style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="pill" style="background:${cfg.bg};color:${cfg.color}">${escapeHtml(s.cat)}</span>${s.placeType ? `<span class="pill pill-green">${escapeHtml(s.placeType)}</span>` : ''}</div>
        <button class="icon-toggle-btn ${isSpotFavorite(s.id) ? 'active' : ''}" style="font-size:26px" onclick="toggleFavoriteSpot('${s.id}', this)">♡</button>
      </div>
      <div class="detail-title">${escapeHtml(s.name)}</div>
      ${s.businessStatus ? `<div class="spot-status ${String(s.businessStatus).includes('休業') || String(s.businessStatus).includes('閉業') ? 'is-closed' : ''}">${escapeHtml(s.businessStatus)}</div>` : ''}
      ${highlights.length ? `
      <section class="spot-recommend-box">
        <div class="spot-recommend-title">✨ おすすめポイント</div>
        <ul>${highlights.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>
      </section>` : ''}
      ${s.rating ? `<div class="spot-rating-summary">
        <div class="spot-rating-score">★ ${escapeHtml(s.rating)}</div>
        <div><div class="spot-rating-count">Googleマップの口コミ ${s.ratingCount ? escapeHtml(s.ratingCount.toLocaleString()) : '0'}件</div><div class="spot-rating-note">口コミ数もお店選びの目安に</div></div>
      </div>` : ''}
      <div class="detail-info-row">
        <div class="detail-info-icon">📍</div>
        <div><div class="detail-info-label">住所${s.walkMinutes ? `（下北沢駅から徒歩約${escapeHtml(s.walkMinutes)}分）` : ''}</div><div class="detail-info-value">${escapeHtml(s.address)}</div></div>
      </div>
      ${s.hoursList?.length ? `<div class="detail-info-row spot-hours-row">
        <div class="detail-info-icon">🕒</div>
        <div style="flex:1"><div class="detail-info-label">営業時間（祝日等は変更の場合あり）</div><div class="spot-hours-list">${s.hoursList.map(line => `<div>${escapeHtml(line)}</div>`).join('')}</div></div>
      </div>` : s.hours ? `<div class="detail-info-row">
        <div class="detail-info-icon">🕒</div>
        <div><div class="detail-info-label">営業時間</div><div class="detail-info-value">${escapeHtml(s.hours)}</div></div>
      </div>` : ''}
      ${s.phone ? `<div class="detail-info-row">
        <div class="detail-info-icon">📞</div>
        <div><div class="detail-info-label">電話番号</div><div class="detail-info-value"><a href="${escapeHtml(phoneHref)}">${escapeHtml(s.phone)}</a></div></div>
      </div>` : ''}
      ${s.priceLabel ? `<div class="detail-info-row">
        <div class="detail-info-icon">💰</div>
        <div><div class="detail-info-label">価格帯の目安</div><div class="detail-info-value">${escapeHtml(s.priceLabel)}</div></div>
      </div>` : ''}
      <div class="spot-detail-actions">
        ${websiteUrl ? `<a class="spot-action-btn secondary" href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">🌐 公式サイト</a>` : ''}
        <a class="spot-action-btn primary" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer">🗺 Googleマップ</a>
      </div>
      <a class="detail-map-placeholder" href="${mapUrl}" target="_blank" rel="noopener" style="text-decoration:none">
        <div class="detail-map-icon">🗺</div>
        <div class="detail-map-text">Google マップで開く</div>
        <div style="font-size:11px;color:var(--forest);opacity:0.7">${escapeHtml(s.address)}</div>
      </a>
      <div class="detail-desc-label">お店について</div>
      <div class="detail-desc">${escapeHtml(s.desc)}</div>
      ${s.source === 'google' ? '<div class="spot-data-note">※ 情報はGoogleマップ掲載データです。来店前に最新の営業情報を店舗へご確認ください。</div>' : ''}
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
