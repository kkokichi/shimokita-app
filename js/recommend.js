// ── NEXT EVENT RECOMMENDATION ──
async function renderRecommendedEvent() {
  const container = document.getElementById('home-recommend');
  const section = document.getElementById('recommend-section');
  if (!container || !section) return;

  let joinedEventObjs = [];
  if (currentUser) {
    try {
      const snapshot = await db.collection('eventParticipants').where('userId', '==', currentUser.uid).get();
      const joinedIds = new Set(snapshot.docs.map(d => d.data().eventId));
      joinedEventObjs = events.filter(e => joinedIds.has(e.id));
    } catch (err) {
      console.error('recommend fetch error:', err.code, err.message);
    }
  }
  const joinedIdSet = new Set(joinedEventObjs.map(e => e.id));
  const unjoined = events.filter(e => !joinedIdSet.has(e.id));

  let candidate = null;
  if (joinedEventObjs.length > 0) {
    const organizerCount = {};
    joinedEventObjs.forEach(e => { organizerCount[e.organizer] = (organizerCount[e.organizer] || 0) + 1; });
    const matched = unjoined
      .filter(e => organizerCount[e.organizer])
      .sort((a, b) => organizerCount[b.organizer] - organizerCount[a.organizer] || b.participants - a.participants);
    candidate = matched[0] || null;
  }
  if (!candidate) {
    candidate = [...unjoined].sort((a, b) => b.participants - a.participants)[0] || null;
  }

  if (!candidate) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  container.innerHTML = `
    <div class="recommend-card" onclick="showDetail('${candidate.id}')">
      <div class="recommend-card-emoji" style="background:linear-gradient(135deg,${candidate.grad[0]},${candidate.grad[1]})">${candidate.emoji}</div>
      <div class="recommend-card-body">
        <div class="recommend-card-title">${candidate.title}</div>
        <div class="recommend-card-date">📅 ${candidate.date} ・ ${candidate.time}</div>
        <div class="recommend-card-organizer">主催：${candidate.organizer}</div>
      </div>
      <div class="recommend-card-arrow">›</div>
    </div>
  `;
}
