// ── FIRESTORE MIGRATION（一度だけ・冪等） ──
// 本番実行は手動トリガーのみ（index.htmlのinitスクリプトからは呼び出さない）。
async function migrateSeedEventsOnce() {
  const existing = await db.collection('events').limit(1).get();
  if (!existing.empty) {
    console.log('migrateSeedEventsOnce: skip（eventsコレクションに既存データがあります）');
    return;
  }
  const batch = db.batch();
  SEED_EVENTS.forEach(ev => {
    const { id, ...rest } = ev;
    batch.set(db.collection('events').doc(id), rest);
  });
  await batch.commit();
  console.log(`migrateSeedEventsOnce: ${SEED_EVENTS.length}件のイベントを移行しました`);
}

// ── LIVE LISTENER ──
function initEventsListener() {
  db.collection('events').onSnapshot(snapshot => {
    events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderEvents();
    renderHome();
    if (typeof renderRecommendedEvent === 'function') renderRecommendedEvent();
    if (typeof checkReminders === 'function') checkReminders();
  }, err => console.error('events onSnapshot error:', err.code, err.message));
}

// ── CREATE FORM ──
async function openEventCreateScreen() {
  if (!userProfile || userProfile.role !== 'organizer') {
    showToast('主催者のみイベントを作成できます');
    return;
  }
  document.getElementById('event-create-form').reset();
  document.getElementById('event-create-error').textContent = '';

  const circleSelect = document.getElementById('event-create-circle');
  if (circlesCache.length === 0) {
    try {
      const snapshot = await db.collection('circles').get();
      circlesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error('circles fetch (event create) error:', err.code, err.message);
    }
  }
  circleSelect.innerHTML = '<option value="">なし</option>' +
    circlesCache.map(c => `<option value="${c.id}">${escapeHtml(c.emoji || '🌿')} ${escapeHtml(c.name)}</option>`).join('');

  switchEventImageMode('emoji');
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById('event-create').classList.add('active');
  prevScreen = currentScreen;
  currentScreen = 'event-create';
}

// ── 絵文字 / 画像アップロード 切り替え ──
function switchEventImageMode(mode) {
  document.getElementById('event-create-emoji').style.display = mode === 'emoji' ? 'block' : 'none';
  document.getElementById('event-create-image').style.display = mode === 'image' ? 'block' : 'none';
}

async function uploadEventImage(file) {
  const path = `event-images/${Date.now()}_${currentUser.uid}_${file.name}`;
  return uploadImageWithTimeout(path, file);
}

async function submitEventCreate(e) {
  e.preventDefault();
  const title = document.getElementById('event-create-title').value.trim();
  const description = document.getElementById('event-create-description').value.trim();
  const date = document.getElementById('event-create-date').value.trim();
  const time = document.getElementById('event-create-time').value.trim();
  const location = document.getElementById('event-create-location').value.trim();
  const capacity = parseInt(document.getElementById('event-create-capacity').value, 10);
  const category = document.getElementById('event-create-category').value.trim();
  const emoji = document.getElementById('event-create-emoji').value.trim() || '🎉';
  const imageFile = document.getElementById('event-create-image').files[0] || null;
  const circleId = document.getElementById('event-create-circle').value || null;
  const circleName = circleId ? (circlesCache.find(c => c.id === circleId) || {}).name || null : null;
  const errEl = document.getElementById('event-create-error');
  const btn = document.getElementById('event-create-submit-btn');
  errEl.textContent = '';

  if (!title || !date || !time || !location || !capacity || !category) {
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
    let imageUrl = null;
    if (imageFile) {
      btn.textContent = '画像をアップロード中...';
      try {
        imageUrl = await uploadEventImage(imageFile);
      } catch (uploadErr) {
        console.error('event image upload error:', uploadErr.code, uploadErr.message);
        errEl.textContent = uploadErr.message && uploadErr.message.includes('タイムアウト')
          ? uploadErr.message
          : '画像のアップロードに失敗しました。絵文字に切り替えるか、もう一度お試しください。';
        return;
      }
      btn.textContent = originalBtnText;
    }
    await db.collection('events').add({
      title, description, date, time, location, category, emoji, imageUrl, circleId, circleName,
      capacity,
      participants: 0,
      organizer: userProfile.name,
      grad: ['#1C3A2F', '#2D5A45'],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('🎉 イベントを作成しました！');
    navigate('events');
  } catch (err) {
    console.error('event create error:', err.code, err.message);
    errEl.textContent = '作成に失敗しました。もう一度お試しください。';
  } finally {
    btn.disabled = false;
    btn.textContent = originalBtnText;
  }
}
