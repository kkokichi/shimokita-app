// ── HELPERS ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatPostDate(ts) {
  if (!ts || !ts.toDate) return '';
  return ts.toDate().toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── RENDER TIMELINE ──
async function renderTimeline() {
  const listEl = document.getElementById('timeline-list');
  try {
    const snapshot = await db.collection('posts').orderBy('createdAt', 'desc').limit(50).get();
    if (snapshot.empty) {
      listEl.innerHTML = '<div class="timeline-empty">まだ投稿がありません。最初の投稿をしてみましょう！</div>';
      return;
    }
    listEl.innerHTML = snapshot.docs.map(doc => {
      const p = doc.data();
      const name = p.type === 'auto_join' ? 'coenコミュニティ' : (p.userName || '名無しさん');
      return `
      <div class="timeline-card">
        <div class="timeline-card-meta">
          <span class="timeline-card-name">${escapeHtml(name)}</span>
          <span class="timeline-card-date">${formatPostDate(p.createdAt)}</span>
        </div>
        <div class="timeline-card-content">${escapeHtml(p.content)}</div>
        <div class="timeline-card-actions">
          <button class="timeline-report-btn" onclick="handleReport('${doc.id}')">🚩 通報</button>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('renderTimeline error:', err.code, err.message);
    listEl.innerHTML = '<div class="timeline-empty">読み込みに失敗しました。</div>';
  }
}

// ── POST HANDLER ──
async function handleTimelinePost(e) {
  e.preventDefault();
  if (!currentUser) {
    openMyPage();
    return;
  }
  const textarea = document.getElementById('timeline-post-text');
  const errEl = document.getElementById('timeline-post-error');
  const btn = document.getElementById('timeline-post-btn');
  const text = textarea.value.trim();
  errEl.textContent = '';
  if (!text) {
    errEl.textContent = '投稿内容を入力してください。';
    return;
  }
  if (containsNgWord(text)) {
    errEl.textContent = 'この内容は投稿できません。表現を見直してください。';
    return;
  }
  btn.disabled = true;
  try {
    await db.collection('posts').add({
      userId: currentUser.uid,
      userName: userProfile ? userProfile.name : '名無しさん',
      eventId: null,
      type: 'free',
      content: text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    textarea.value = '';
    showToast('投稿しました！');
    renderTimeline();
  } catch (err) {
    console.error('timeline post error:', err.code, err.message);
    errEl.textContent = '投稿に失敗しました。もう一度お試しください。';
  } finally {
    btn.disabled = false;
  }
}

// ── REPORT HANDLER ──
async function handleReport(postId) {
  if (!currentUser) {
    openMyPage();
    return;
  }
  const reason = prompt('通報理由を入力してください（任意）', '');
  if (reason === null) return;
  try {
    await db.collection('reports').add({
      targetType: 'post',
      targetId: postId,
      reporterId: currentUser.uid,
      reason: reason || '理由未記入',
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('通報しました。ご協力ありがとうございます');
  } catch (err) {
    console.error('report error:', err.code, err.message);
    showToast('通報に失敗しました。もう一度お試しください。');
  }
}
