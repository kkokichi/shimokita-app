// ── RENDER HOME ──
function renderHome() {
  const homeEvents = document.getElementById('home-events');
  homeEvents.innerHTML = events.slice(0, 4).map(ev => {
    const pct = Math.round((ev.participants / ev.capacity) * 100);
    return `
    <div class="event-card-h" onclick="showDetail('${ev.id}')">
      <div class="event-card-h-accent" style="background:linear-gradient(to bottom,${ev.grad[0]},${ev.grad[1]})"></div>
      <div class="event-card-h-emoji" style="background:linear-gradient(135deg,${ev.grad[0]},${ev.grad[1]});overflow:hidden">${ev.imageUrl ? `<img src="${ev.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover">` : ev.emoji}</div>
      <div class="event-card-h-body">
        <div class="event-card-h-meta">
          <div class="event-card-h-info">
            <div class="event-card-h-title">${ev.title}</div>
            <div class="event-card-h-date">📅 ${ev.date} · ${ev.time}</div>
            <div class="event-card-h-row">
              <span class="pill pill-green">${ev.category}</span>
              <span style="font-size:12px;color:var(--ink-soft)">${ev.participants}/${ev.capacity}人</span>
            </div>
          </div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:linear-gradient(to right,${ev.grad[0]},${ev.grad[1]})"></div></div>
      </div>
    </div>`;
  }).join('');

  const homeNews = document.getElementById('home-news');
  if (news.length === 0) {
    homeNews.innerHTML = newsLoadState === 'error'
      ? '<div class="timeline-empty">最新情報の取得に失敗しました。</div>'
      : '<div class="timeline-empty">読み込み中...</div>';
  } else {
    homeNews.innerHTML = news.slice(0, 5).map(n => `
      <div class="news-card-sm" onclick="showNewsDetail('${n.id}')">
        <div class="news-card-sm-emoji">${n.imageUrl ? `<img src="${n.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover">` : n.emoji}</div>
        <div class="news-card-sm-category">${n.category}</div>
        <div class="news-card-sm-title">${n.title}</div>
        <div class="news-card-sm-date">${n.date}</div>
      </div>
    `).join('');
  }
}

// ── HOME MINI MAP（「みんな何してる？」プレビュー） ──
let homeMiniMap = null;
let homeMiniMapPins = [];
let homeMiniMapBadgeCount = 0;

function initHomeMiniMap() {
  const el = document.getElementById('home-minimap-div');
  if (!el || homeMiniMap) return;
  homeMiniMap = new google.maps.Map(el, {
    center: { lat: 35.6618, lng: 139.6663 },
    zoom: 15,
    disableDefaultUI: true,
    zoomControl: false,
    clickableIcons: false,
    draggable: false,
    scrollwheel: false,
    disableDoubleClickZoom: true,
    gestureHandling: 'none',
    keyboardShortcuts: false,
    styles: [
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    ],
  });
  refreshHomeMiniMapMarkers();
}

// マイクロインタラクション用の軽量ピン（通報・プロフィール遷移はミニマップには出さない。
// ミニマップはカード全体タップで地図画面に遷移する閲覧専用プレビューのため）
function getHomeMiniPinClass() {
  if (window.HomeMiniPinOverlay) return window.HomeMiniPinOverlay;
  class HomeMiniPinOverlay extends google.maps.OverlayView {
    constructor(position) {
      super();
      this.position = position;
      this.div = null;
    }
    onAdd() {
      const div = document.createElement('div');
      div.className = 'minimap-pin';
      this.div = div;
      this.getPanes().overlayImage.appendChild(div);
    }
    draw() {
      const projection = this.getProjection();
      if (!projection || !this.div) return;
      const pos = projection.fromLatLngToDivPixel(this.position);
      if (pos) {
        this.div.style.left = pos.x + 'px';
        this.div.style.top = pos.y + 'px';
      }
    }
    onRemove() {
      if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div);
      this.div = null;
    }
  }
  window.HomeMiniPinOverlay = HomeMiniPinOverlay;
  return HomeMiniPinOverlay;
}

// マップ画面の「みんな今どこ？」モードと同じ`.presence-bubble`の見た目を再利用した、
// コメント表示専用の軽量吹き出し（タップ操作・通報ボタンは持たない＝閲覧専用）
function getHomeMiniBubbleClass() {
  if (window.HomeMiniBubbleOverlay) return window.HomeMiniBubbleOverlay;
  class HomeMiniBubbleOverlay extends google.maps.OverlayView {
    constructor(position, offsetIndex, text) {
      super();
      this.position = position;
      this.offsetIndex = offsetIndex;
      this.text = text;
      this.div = null;
    }
    onAdd() {
      const div = document.createElement('div');
      div.className = 'presence-bubble';
      div.innerHTML = `<span class="presence-bubble-text"></span>`;
      div.querySelector('.presence-bubble-text').textContent = this.text;
      this.div = div;
      this.getPanes().overlayImage.appendChild(div);
    }
    draw() {
      const projection = this.getProjection();
      if (!projection || !this.div) return;
      const pos = projection.fromLatLngToDivPixel(this.position);
      if (pos) {
        this.div.style.left = pos.x + 'px';
        this.div.style.top = (pos.y - 40 - this.offsetIndex * 30) + 'px';
      }
    }
    onRemove() {
      if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div);
      this.div = null;
    }
  }
  window.HomeMiniBubbleOverlay = HomeMiniBubbleOverlay;
  return HomeMiniBubbleOverlay;
}

let homeMiniMapBubbles = [];

function clearHomeMiniMapPins() {
  homeMiniMapPins.forEach(p => p.setMap(null));
  homeMiniMapPins = [];
  homeMiniMapBubbles.forEach(b => b.setMap(null));
  homeMiniMapBubbles = [];
}

// 数字が変わった時だけカウントアップアニメーションさせる（前回値と同じなら何もしない）
function animateCountUp(el, from, to) {
  if (!el || from === to) {
    if (el) el.textContent = to;
    return;
  }
  const duration = 400;
  const start = performance.now();
  function step(now) {
    const progress = Math.min(1, (now - start) / duration);
    const value = Math.round(from + (to - from) * progress);
    el.textContent = value;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

async function refreshHomeMiniMapMarkers() {
  if (!homeMiniMap) return;
  const badgeEl = document.getElementById('home-minimap-badge');
  const countEl = document.getElementById('home-minimap-count');
  const emptyEl = document.getElementById('home-minimap-empty');
  const surfaceEl = document.getElementById('home-minimap-div');
  try {
    const snapshot = await db.collection('presence')
      .where('expiresAt', '>', firebase.firestore.Timestamp.now())
      .get();

    clearHomeMiniMapPins();

    if (snapshot.empty) {
      if (badgeEl) badgeEl.style.display = 'none';
      if (emptyEl) {
        emptyEl.innerHTML = '<div class="home-minimap-empty-emoji">🌱</div><div>まだ誰もチェックインしていません</div>';
        emptyEl.style.display = 'flex';
      }
      if (surfaceEl) surfaceEl.style.display = 'none';
      homeMiniMapBadgeCount = 0;
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (surfaceEl) surfaceEl.style.display = 'block';
    if (badgeEl) badgeEl.style.display = 'inline';

    const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    animateCountUp(countEl, homeMiniMapBadgeCount, entries.length);
    homeMiniMapBadgeCount = entries.length;

    const clusters = typeof clusterPresenceEntries === 'function'
      ? clusterPresenceEntries(entries)
      : entries.map(e => ({ lat: e.lat, lng: e.lng, entries: [e] }));
    const PinClass = getHomeMiniPinClass();
    const BubbleClass = getHomeMiniBubbleClass();
    const bounds = new google.maps.LatLngBounds();
    const MAX_BUBBLES_PER_CLUSTER = 2;
    clusters.forEach(cluster => {
      const position = new google.maps.LatLng(cluster.lat, cluster.lng);
      const pin = new PinClass(position);
      pin.setMap(homeMiniMap);
      homeMiniMapPins.push(pin);
      bounds.extend(position);

      // ミニマップは表示領域が狭いため、コメント吹き出しは最大2件までに留め、
      // それ以上は「他N件」というシンプルな吹き出しにまとめる
      const withComment = cluster.entries.filter(e => e.comment);
      const shown = withComment.slice(0, MAX_BUBBLES_PER_CLUSTER);
      shown.forEach((entry, i) => {
        const bubble = new BubbleClass(position, i, entry.comment);
        bubble.setMap(homeMiniMap);
        homeMiniMapBubbles.push(bubble);
      });
      const remaining = withComment.length - shown.length;
      if (remaining > 0) {
        const moreBubble = new BubbleClass(position, shown.length, `他${remaining}件`);
        moreBubble.setMap(homeMiniMap);
        homeMiniMapBubbles.push(moreBubble);
      }
    });
    homeMiniMap.setCenter(bounds.getCenter());
  } catch (err) {
    console.error('refreshHomeMiniMapMarkers error:', err.code, err.message);
  }
}

function openHomeMiniMapFullView() {
  const go = () => {
    switchMapMode('presence');
    navigate('map');
  };
  if (document.startViewTransition) {
    document.startViewTransition(go);
  } else {
    go();
  }
}
