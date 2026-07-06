// ── STATE ──
let circlesCache = [];
let myCircleMemberships = {}; // { [circleId]: joinedAt(Date) }
let activeCircleId = null;
let circleDetailTab = 'board'; // 'board' | 'events'

function isCircleMember(circleId) {
  return Object.prototype.hasOwnProperty.call(myCircleMemberships, circleId);
}

// name末尾が既に「部」ならそのまま、そうでなければ「部」を付与（バッジ表示共通）
function circleLabelWithSuffix(name) {
  return name.endsWith('部') ? name : name + '部';
}

// circleMembersへの参加ドキュメント作成（参加トグル・イベント参加時の自動加入の両方から使う）
async function addCircleMembership(circleId) {
  await db.collection('circleMembers').doc(`${circleId}_${currentUser.uid}`).set({
    circleId,
    userId: currentUser.uid,
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    role: 'member',
  });
  myCircleMemberships[circleId] = new Date();
}

// ── RESTORE MEMBERSHIPS ON LOGIN ──
function initCirclesListener() {
  if (!currentUser) {
    myCircleMemberships = {};
    return;
  }
  db.collection('circleMembers').where('userId', '==', currentUser.uid).get().then(snapshot => {
    myCircleMemberships = {};
    snapshot.docs.forEach(doc => {
      const d = doc.data();
      myCircleMemberships[d.circleId] = d.joinedAt && d.joinedAt.toDate ? d.joinedAt.toDate() : new Date();
    });
    if (currentScreen === 'circles') renderCircles();
    if (currentScreen === 'mypage') renderMyPageCircles();
  }).catch(err => console.error('circleMembers fetch error:', err.code, err.message));
}

// ── NAVIGATION ──
function openCirclesScreen() {
  navigate('circles');
  renderCircles();
}

// ── LIST ──
async function renderCircles() {
  const createBtn = document.getElementById('circle-create-btn');
  if (createBtn) createBtn.style.display = userProfile && userProfile.role === 'organizer' ? 'block' : 'none';

  const listEl = document.getElementById('circles-list');
  listEl.innerHTML = '<div class="timeline-empty">読み込み中...</div>';
  try {
    const [circlesSnap, membersSnap] = await Promise.all([
      db.collection('circles').get(),
      db.collection('circleMembers').get(),
    ]);
    if (circlesSnap.empty) {
      listEl.innerHTML = '<div class="timeline-empty">まだサークルがありません。</div>';
      circlesCache = [];
      return;
    }
    const countByCircle = {};
    membersSnap.docs.forEach(doc => {
      const circleId = doc.data().circleId;
      countByCircle[circleId] = (countByCircle[circleId] || 0) + 1;
    });
    circlesCache = circlesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    listEl.innerHTML = circlesCache.map(c => {
      const count = countByCircle[c.id] || 0;
      const joined = isCircleMember(c.id);
      return `
      <div class="spot-card" onclick="openCircleDetail('${c.id}')">
        <div class="spot-icon" style="overflow:hidden">${c.imageUrl ? `<img src="${c.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover">` : (c.emoji || '🌿')}</div>
        <div style="flex:1;min-width:0">
          <div class="spot-name">${escapeHtml(c.name)}</div>
          <div class="spot-desc">${escapeHtml(c.description || '')}</div>
          <div class="spot-rating">${count}人が参加中</div>
        </div>
        <button class="join-btn-sm" onclick="event.stopPropagation();handleCircleJoinToggle('${c.id}', this)">${joined ? '✓ メンバーです' : '参加する'}</button>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('renderCircles error:', err.code, err.message);
    listEl.innerHTML = '<div class="timeline-empty">読み込みに失敗しました。</div>';
  }
}

// ── JOIN / LEAVE ──
async function handleCircleJoinToggle(circleId, btn) {
  if (!currentUser) {
    openMyPage();
    return;
  }
  if (btn) btn.disabled = true;
  try {
    if (isCircleMember(circleId)) {
      await db.collection('circleMembers').doc(`${circleId}_${currentUser.uid}`).delete();
      delete myCircleMemberships[circleId];
      showToast('サークルを脱退しました');
    } else {
      await addCircleMembership(circleId);
      showToast('🌿 サークルに参加しました！');
    }
    if (currentScreen === 'circles') renderCircles();
    if (currentScreen === 'circle-detail') openCircleDetail(circleId);
    if (currentScreen === 'mypage') renderMyPageCircles();
  } catch (err) {
    console.error('circle join/leave error:', err.code, err.message);
    showToast('エラーが発生しました。もう一度お試しください。');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── CREATE / EDIT ──
let editingCircleId = null;
let editingCircleImageUrl = null;

function openCircleCreateModal() {
  if (!userProfile || userProfile.role !== 'organizer') {
    showToast('主催者のみサークルを作成できます');
    return;
  }
  editingCircleId = null;
  editingCircleImageUrl = null;
  document.getElementById('circle-create-form').reset();
  document.getElementById('circle-create-error').textContent = '';
  document.getElementById('circle-create-modal-title').textContent = '🌱 サークルを作る';
  document.getElementById('circle-create-submit-btn').textContent = '作成する';
  switchCircleImageMode('emoji');
  document.getElementById('circle-create-overlay').style.display = 'flex';
}

function openCircleEditModal(circleId) {
  if (!userProfile || userProfile.role !== 'organizer') {
    showToast('主催者のみ編集できます');
    return;
  }
  const c = organizerCirclesCache.find(x => x.id === circleId);
  if (!c) return;
  editingCircleId = circleId;
  editingCircleImageUrl = c.imageUrl || null;
  document.getElementById('circle-create-form').reset();
  document.getElementById('circle-create-error').textContent = '';
  document.getElementById('circle-create-modal-title').textContent = 'サークルを編集';
  document.getElementById('circle-create-submit-btn').textContent = '更新する';
  document.getElementById('circle-create-name').value = c.name || '';
  document.getElementById('circle-create-desc').value = c.description || '';
  document.getElementById('circle-create-emoji').value = c.emoji || '';
  switchCircleImageMode('emoji');
  document.getElementById('circle-create-overlay').style.display = 'flex';
}

function closeCircleCreateModal() {
  document.getElementById('circle-create-overlay').style.display = 'none';
}

// ── 絵文字 / 画像アップロード 切り替え ──
function switchCircleImageMode(mode) {
  document.getElementById('circle-create-emoji').style.display = mode === 'emoji' ? 'block' : 'none';
  document.getElementById('circle-create-image').style.display = mode === 'image' ? 'block' : 'none';
}

async function uploadCircleImage(file) {
  const path = `circle-images/${Date.now()}_${currentUser.uid}_${file.name}`;
  return uploadImageWithTimeout(path, file);
}

async function submitCircleCreate(e) {
  e.preventDefault();
  const emoji = document.getElementById('circle-create-emoji').value.trim() || '🌿';
  const name = document.getElementById('circle-create-name').value.trim();
  const description = document.getElementById('circle-create-desc').value.trim();
  const imageFile = document.getElementById('circle-create-image').files[0] || null;
  const errEl = document.getElementById('circle-create-error');
  const btn = document.getElementById('circle-create-submit-btn');
  errEl.textContent = '';
  if (!name) {
    errEl.textContent = 'サークル名を入力してください。';
    return;
  }
  if (imageFile && imageFile.size > 5 * 1024 * 1024) {
    errEl.textContent = '画像は5MB以下にしてください。';
    return;
  }
  btn.disabled = true;
  const originalBtnText = btn.textContent;
  try {
    let imageUrl = editingCircleId ? editingCircleImageUrl : null;
    if (imageFile) {
      btn.textContent = '画像をアップロード中...';
      try {
        imageUrl = await uploadCircleImage(imageFile);
      } catch (uploadErr) {
        console.error('circle image upload error:', uploadErr.code, uploadErr.message);
        errEl.textContent = uploadErr.message && uploadErr.message.includes('タイムアウト')
          ? uploadErr.message
          : '画像のアップロードに失敗しました。絵文字に切り替えるか、もう一度お試しください。';
        return;
      }
      btn.textContent = originalBtnText;
    }
    if (editingCircleId) {
      await db.collection('circles').doc(editingCircleId).update({ emoji, name, description, imageUrl });
      closeCircleCreateModal();
      showToast('サークルを更新しました');
      renderOrganizerCircleManagement();
      if (currentScreen === 'circles') renderCircles();
    } else {
      await db.collection('circles').add({
        emoji, name, description, imageUrl,
        createdBy: currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      closeCircleCreateModal();
      showToast('サークルを作成しました！');
      renderCircles();
    }
  } catch (err) {
    console.error('circle create/update error:', err.code, err.message);
    errEl.textContent = (editingCircleId ? '更新' : '作成') + 'に失敗しました。もう一度お試しください。';
  } finally {
    btn.disabled = false;
    btn.textContent = originalBtnText;
  }
}

// ── DETAIL ──
function openCircleDetail(id) {
  const c = circlesCache.find(x => x.id === id);
  if (!c) return;
  activeCircleId = id;
  circleDetailTab = 'board';
  renderCircleDetail(c);
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById('circle-detail').classList.add('active');
  document.getElementById('circle-detail').scrollTop = 0;
  prevScreen = currentScreen;
  currentScreen = 'circle-detail';
}

function renderCircleDetail(c) {
  const joined = isCircleMember(c.id);
  document.getElementById('circle-detail-content').innerHTML = `
    <div class="detail-banner" style="background:var(--forest-pale)">
      ${c.imageUrl ? `<img src="${c.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<div class="detail-banner-emoji">${c.emoji || '🌿'}</div>`}
    </div>
    <div class="detail-body">
      <div class="detail-title">${escapeHtml(c.name)}</div>
      <div class="detail-desc">${escapeHtml(c.description || '')}</div>
      <button class="detail-join-btn ${joined ? 'joined' : ''}" onclick="handleCircleJoinToggle('${c.id}', this)">
        ${joined ? '✓ メンバーです（タップで脱退）' : '🌿 このサークルに参加する'}
      </button>
      <div class="map-mode-toggle" style="margin-top:24px">
        <button class="map-mode-btn ${circleDetailTab === 'board' ? 'active' : ''}" onclick="switchCircleDetailTab('${c.id}','board')">チャット</button>
        <button class="map-mode-btn ${circleDetailTab === 'events' ? 'active' : ''}" onclick="switchCircleDetailTab('${c.id}','events')">イベント</button>
      </div>
      <div id="circle-tab-content" style="margin-top:16px"></div>
    </div>
  `;
  renderCircleTabContent(c.id);
}

function switchCircleDetailTab(circleId, tab) {
  circleDetailTab = tab;
  const c = circlesCache.find(x => x.id === circleId);
  if (c) renderCircleDetail(c);
}

function renderCircleTabContent(circleId) {
  const el = document.getElementById('circle-tab-content');
  if (!el) return;
  clearCircleChatListener();
  if (circleDetailTab === 'events') {
    renderCircleEventsList(circleId, el);
  } else {
    renderCircleChat(circleId);
  }
}

// サークル限定イベント一覧（既存のevents配列をcircleIdで絞り込み、開催日時順に表示）
function renderCircleEventsList(circleId, el) {
  const list = events
    .filter(ev => ev.circleId === circleId)
    .sort((a, b) => {
      const ra = typeof parseEventDateRange === 'function' ? parseEventDateRange(a.date) : null;
      const rb = typeof parseEventDateRange === 'function' ? parseEventDateRange(b.date) : null;
      return (ra ? ra.start.getTime() : 0) - (rb ? rb.start.getTime() : 0);
    });
  if (list.length === 0) {
    el.innerHTML = '<div class="timeline-empty">このサークルのイベントはまだありません。</div>';
    return;
  }
  el.innerHTML = list.map(ev => `
    <div class="spot-card" onclick="showDetail('${ev.id}')">
      <div class="spot-icon">${ev.emoji}</div>
      <div style="flex:1;min-width:0">
        <div class="spot-name">${escapeHtml(ev.title)}</div>
        <div class="spot-desc">${escapeHtml(ev.date)} ${escapeHtml(ev.time)}</div>
      </div>
    </div>`).join('');
}

// ── MYPAGE SECTION ──
async function renderMyPageCircles() {
  const section = document.getElementById('mypage-circles-section');
  const list = document.getElementById('mypage-circles-list');
  const ids = Object.keys(myCircleMemberships);
  if (!section || !list) return;
  if (ids.length === 0) {
    section.style.display = 'none';
    return;
  }
  if (circlesCache.length === 0) {
    try {
      const snapshot = await db.collection('circles').get();
      circlesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error('circles fetch (mypage) error:', err.code, err.message);
    }
  }
  section.style.display = 'block';
  list.innerHTML = ids.map(id => {
    const c = circlesCache.find(x => x.id === id);
    if (!c) return '';
    const days = Math.max(1, Math.floor((Date.now() - myCircleMemberships[id].getTime()) / 86400000) + 1);
    return `<div class="circle-badge">${c.emoji || '🌿'} ${escapeHtml(circleLabelWithSuffix(c.name))} メンバー・参加${days}日目</div>`;
  }).join('');
}

// ── チャット（サークルグループチャット） ──
let circleChatUnsubscribe = null;
let currentCircleMessagesCache = [];

function clearCircleChatListener() {
  if (circleChatUnsubscribe) {
    circleChatUnsubscribe();
    circleChatUnsubscribe = null;
  }
}

function renderCircleChat(circleId) {
  const el = document.getElementById('circle-tab-content');
  if (!el) return;
  if (!isCircleMember(circleId)) {
    el.innerHTML = '<div class="timeline-empty">参加してから見られます。</div>';
    return;
  }
  el.innerHTML = `
    <div class="chat-message-list" id="circle-chat-list"><div class="timeline-empty">読み込み中...</div></div>
    <form class="chat-input-bar" id="circle-chat-form" onsubmit="handleCircleMessagePost(event, '${circleId}')">
      <input class="auth-input" id="circle-message-text" maxlength="200" placeholder="サークルメンバーにひとこと">
      <button class="btn-primary" type="submit" id="circle-message-submit-btn">送信</button>
    </form>
    <div class="auth-error" id="circle-message-error" style="padding:0 16px"></div>
  `;
  // circleId単一条件のみでクエリし、createdAtでの並び替えはクライアント側で行う
  // （circleId+createdAtの複合インデックスを不要にするため）
  circleChatUnsubscribe = db.collection('circleMessages')
    .where('circleId', '==', circleId)
    .onSnapshot(snapshot => {
      renderCircleChatMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })), circleId);
    }, err => {
      console.error('circle chat listener error:', err.code, err.message);
      const listEl = document.getElementById('circle-chat-list');
      if (listEl) listEl.innerHTML = '<div class="timeline-empty">読み込みに失敗しました。</div>';
    });
}

function renderCircleChatMessages(messages, circleId) {
  currentCircleMessagesCache = messages;
  const listEl = document.getElementById('circle-chat-list');
  if (!listEl) return;
  if (messages.length === 0) {
    listEl.innerHTML = '<div class="timeline-empty">まだ投稿がありません。最初の投稿をしてみましょう！</div>';
    return;
  }
  const sorted = messages.slice().sort((a, b) => {
    const at = a.createdAt, bt = b.createdAt;
    if (!at || !bt) return 0;
    return at.toMillis() - bt.toMillis();
  });
  listEl.innerHTML = sorted.map(m => renderChatBubbleHtml(m, m.userId === currentUser.uid, {
    senderName: m.userName || '名無しさん',
    avatarUrl: m.userAvatarUrl || null,
    reportButtonHtml: `<button class="timeline-report-btn" onclick="handleCircleMessageReport('${m.id}','${circleId}')">🚩</button>`,
  })).join('');
  const detailEl = document.getElementById('circle-detail');
  if (detailEl) detailEl.scrollTop = detailEl.scrollHeight;
}

async function handleCircleMessagePost(e, circleId) {
  e.preventDefault();
  if (!currentUser) {
    openMyPage();
    return;
  }
  const textarea = document.getElementById('circle-message-text');
  const errEl = document.getElementById('circle-message-error');
  const btn = document.getElementById('circle-message-submit-btn');
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
    await db.collection('circleMessages').add({
      circleId,
      userId: currentUser.uid,
      userName: userProfile ? userProfile.name : '名無しさん',
      userAvatarUrl: userProfile ? (userProfile.avatarUrl || null) : null,
      content: text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    textarea.value = '';
  } catch (err) {
    console.error('circle message post error:', err.code, err.message);
    errEl.textContent = '投稿に失敗しました。もう一度お試しください。';
  } finally {
    btn.disabled = false;
  }
}

async function handleCircleMessageReport(messageId, circleId) {
  if (!currentUser) {
    openMyPage();
    return;
  }
  const reason = prompt('通報理由を入力してください（任意）', '');
  if (reason === null) return;
  const msg = currentCircleMessagesCache.find(m => m.id === messageId);
  try {
    await db.collection('reports').add({
      targetType: 'circleMessage',
      targetId: messageId,
      reporterId: currentUser.uid,
      reason: reason || '理由未記入',
      contentSnapshot: msg ? msg.content : null,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('通報しました。ご協力ありがとうございます');
  } catch (err) {
    console.error('circle message report error:', err.code, err.message);
    showToast('通報に失敗しました。もう一度お試しください。');
  }
}
