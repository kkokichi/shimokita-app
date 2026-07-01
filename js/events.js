// ── RENDER EVENTS ──
function renderEvents() {
  document.getElementById('events-list').innerHTML = events.map(ev => {
    const pct = Math.round((ev.participants / ev.capacity) * 100);
    return `
    <div class="event-card-v" onclick="showDetail('${ev.id}')">
      <div class="event-card-v-banner" style="background:linear-gradient(135deg,${ev.grad[0]},${ev.grad[1]})">
        <div class="event-card-v-banner-emoji">${ev.emoji}</div>
        <div class="event-card-v-banner-cat"><span class="pill" style="background:rgba(255,255,255,0.2);color:white">${ev.category}</span></div>
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
          <button class="join-btn-sm" onclick="event.stopPropagation();handleJoin('${ev.id}',this)">${joinedEvents.has(ev.id) ? '✓ 参加済' : '参加する'}</button>
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
  document.getElementById('detail-content').innerHTML = `
    <div class="detail-banner" style="background:linear-gradient(160deg,${ev.grad[0]},${ev.grad[1]})">
      <div class="detail-banner-emoji">${ev.emoji}</div>
    </div>
    <div class="detail-body">
      <div class="detail-category"><span class="pill pill-green">${ev.category}</span></div>
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
      <button class="detail-join-btn ${joined ? 'joined' : ''}" id="detail-join-btn" onclick="handleJoin('${ev.id}', this)">
        ${joined ? '✓ 参加登録済み' : '🎉 このイベントに参加する'}
      </button>
    </div>
  `;
}

// ── JOIN HANDLER ──
function handleJoin(id, btn) {
  if (joinedEvents.has(id)) {
    showToast('参加登録を取り消しました');
    joinedEvents.delete(id);
    btn.textContent = btn.classList.contains('detail-join-btn') ? '🎉 このイベントに参加する' : '参加する';
    btn.classList.remove('joined');
  } else {
    showToast('🎉 参加登録しました！');
    joinedEvents.add(id);
    btn.textContent = btn.classList.contains('detail-join-btn') ? '✓ 参加登録済み' : '✓ 参加済';
    btn.classList.add('joined');
  }
}
