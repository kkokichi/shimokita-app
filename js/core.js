// ── STATE ──
let currentScreen = 'home';
let prevScreen = 'home';
let activeCategory = 'カフェ';
let joinedEvents = new Set();

// ── NAVIGATION ──
function navigate(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(screen).classList.add('active');
  const navEl = document.getElementById('nav-' + screen);
  if (navEl) navEl.classList.add('active');
  prevScreen = currentScreen;
  currentScreen = screen;
  const el = document.getElementById(screen);
  if (el) el.scrollTop = 0;
  // Leaflet needs invalidateSize when its container becomes visible
  if (screen === 'map') {
    setTimeout(() => {
      if (gmap) {
        google.maps.event.trigger(gmap, 'resize');
        renderMarkers();
      }
    }, 300);
  }
}

function goBack() {
  navigate(['event-detail', 'spot-detail', 'news-detail'].includes(prevScreen) ? 'home' : prevScreen);
}

// ── TOAST ──
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
