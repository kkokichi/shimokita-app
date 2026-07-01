// ── RENDER NEWS ──
function renderNews() {
  document.getElementById('news-list').innerHTML = news.map(n => `
    <div class="news-card-full" onclick="showNewsDetail('${n.id}')">
      <div class="news-card-img">${n.emoji}</div>
      <div class="news-card-body">
        <div class="news-card-cat">${n.category}</div>
        <div class="news-card-title">${n.title}</div>
        <div class="news-card-summary">${n.summary}</div>
        <div class="news-card-date">${n.date}</div>
      </div>
    </div>
  `).join('');
}

function showNewsDetail(id) {
  const n = news.find(item => item.id === id);
  if (!n) return;
  renderNewsDetail(n);
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById('news-detail').classList.add('active');
  document.getElementById('news-detail').scrollTop = 0;
  prevScreen = currentScreen;
  currentScreen = 'news-detail';
}

function renderNewsDetail(n) {
  document.getElementById('news-detail-content').innerHTML = `
    <div class="detail-banner" style="background:var(--forest-pale)">
      <div class="detail-banner-emoji">${n.emoji}</div>
    </div>
    <div class="detail-body">
      <div class="detail-category"><span class="pill pill-green">${n.category}</span></div>
      <div class="detail-title">${n.title}</div>
      <div class="detail-info-row">
        <div class="detail-info-icon">📅</div>
        <div><div class="detail-info-label">掲載日</div><div class="detail-info-value">${n.date}</div></div>
      </div>
      <div class="detail-desc-label">記事内容</div>
      <div class="detail-desc">${n.summary}</div>
    </div>
  `;
}
