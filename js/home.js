// ── RENDER HOME ──
function renderHome() {
  const homeEvents = document.getElementById('home-events');
  homeEvents.innerHTML = events.slice(0, 4).map(ev => {
    const pct = Math.round((ev.participants / ev.capacity) * 100);
    return `
    <div class="event-card-h" onclick="showDetail('${ev.id}')">
      <div class="event-card-h-accent" style="background:linear-gradient(to bottom,${ev.grad[0]},${ev.grad[1]})"></div>
      <div class="event-card-h-emoji" style="background:linear-gradient(135deg,${ev.grad[0]},${ev.grad[1]})">${ev.emoji}</div>
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
  homeNews.innerHTML = news.slice(0, 5).map(n => `
    <div class="news-card-sm" onclick="showNewsDetail('${n.id}')">
      <div class="news-card-sm-emoji">${n.emoji}</div>
      <div class="news-card-sm-category">${n.category}</div>
      <div class="news-card-sm-title">${n.title}</div>
      <div class="news-card-sm-date">${n.date}</div>
    </div>
  `).join('');
}
