// ── MAP (Google Maps) ──
let gmap = null;
let gmMarkers = [];

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

function renderMarkers() {
  if (!gmap) return;
  const cfg = catConfig[activeCategory];
  gmMarkers.forEach(m => m.setMap(null));
  gmMarkers = [];
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
  card.innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:14px;cursor:pointer" onclick="showSpotDetail('${s.id}')"><div style="width:42px;height:42px;border-radius:10px;background:${cfg.bg};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${s.icon}</div><div style="flex:1;min-width:0"><div class="map-info-name">${s.name}</div><div class="map-info-desc">${s.desc}</div><div class="map-info-rating">★ ${s.rating}</div></div><div onclick="event.stopPropagation();document.getElementById('map-info').style.display='none'" style="color:var(--ink-soft);font-size:20px;cursor:pointer;padding:4px;flex-shrink:0">×</div></div>`;
  if (gmap) gmap.panTo({ lat: s.lat, lng: s.lng });
}

function renderSpotsList() {
  const cfg = catConfig[activeCategory];
  const filtered = spots.filter(s => s.cat === activeCategory);
  document.getElementById('spots-list').innerHTML = `
    <div style="padding:0 0 8px"><div class="section-title">${activeCategory} 一覧</div></div>
    ${filtered.map(s => `
    <div class="spot-card" onclick="showSpotDetail('${s.id}')">
      <div class="spot-icon" style="background:${cfg.bg}">${s.icon}</div>
      <div style="flex:1;min-width:0"><div class="spot-name">${s.name}</div><div class="spot-desc">${s.desc}</div><div class="spot-rating">★ ${s.rating}</div></div>
      <div style="color:var(--ink-soft);font-size:18px">›</div>
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
      <div class="detail-banner-emoji">${s.icon}</div>
    </div>
    <div class="detail-body">
      <div class="detail-category"><span class="pill" style="background:${cfg.bg};color:${cfg.color}">${s.cat}</span></div>
      <div class="detail-title">${s.name}</div>
      <div class="detail-info-row">
        <div class="detail-info-icon">📍</div>
        <div><div class="detail-info-label">住所</div><div class="detail-info-value">${s.address}</div></div>
      </div>
      ${s.hours ? `<div class="detail-info-row">
        <div class="detail-info-icon">🕒</div>
        <div><div class="detail-info-label">営業時間</div><div class="detail-info-value">${s.hours}</div></div>
      </div>` : ''}
      ${s.phone ? `<div class="detail-info-row">
        <div class="detail-info-icon">📞</div>
        <div><div class="detail-info-label">電話番号</div><div class="detail-info-value">${s.phone}</div></div>
      </div>` : ''}
      <div class="detail-info-row">
        <div class="detail-info-icon">★</div>
        <div><div class="detail-info-label">評価</div><div class="detail-info-value">${s.rating}</div></div>
      </div>
      <a class="detail-map-placeholder" href="${mapUrl}" target="_blank" rel="noopener" style="text-decoration:none">
        <div class="detail-map-icon">🗺</div>
        <div class="detail-map-text">Google マップで開く</div>
        <div style="font-size:11px;color:var(--forest);opacity:0.7">${s.address}</div>
      </a>
      <div class="detail-desc-label">お店について</div>
      <div class="detail-desc">${s.desc}</div>
    </div>
  `;
}
