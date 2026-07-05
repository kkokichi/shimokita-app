// ── STATE ──
let activeChatUnsubscribe = null;
let activeChatThreadId = null;
let activeChatOtherUid = null;
let currentChatMessagesCache = [];

function clearActiveChatListener() {
  if (activeChatUnsubscribe) {
    activeChatUnsubscribe();
    activeChatUnsubscribe = null;
  }
}

// ── 共有バブル描画（1:1チャット・サークルグループチャット共通） ──
// reportButtonHtmlは呼び出し側で組み立てる（メッセージ本文をonclick属性に埋め込まない
// ことで、悪意あるメッセージ内容によるHTML/JSインジェクションを避けるため）
function renderChatBubbleHtml(msg, isMine, opts = {}) {
  const { senderName, avatar, reportButtonHtml } = opts;
  return `
    <div class="chat-bubble-row ${isMine ? 'mine' : 'theirs'}">
      ${!isMine ? `<div class="chat-avatar">${avatar || '🌿'}</div>` : ''}
      <div class="chat-bubble-col">
        ${!isMine && senderName ? `<div class="chat-sender-name">${escapeHtml(senderName)}</div>` : ''}
        <div class="chat-bubble">${escapeHtml(msg.content)}</div>
        <div class="chat-bubble-meta">
          <span class="chat-bubble-time">${formatPostDate(msg.createdAt)}</span>
          ${reportButtonHtml || ''}
        </div>
      </div>
    </div>`;
}

function scrollChatToBottom(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.scrollTop = el.scrollHeight;
}

// ── 1:1 CHAT THREAD ──
function openChatThread(pairId, otherUid) {
  clearActiveChatListener();
  activeChatThreadId = pairId;
  activeChatOtherUid = otherUid;

  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById('chat-thread').classList.add('active');
  prevScreen = currentScreen;
  currentScreen = 'chat-thread';

  document.getElementById('chat-thread-name').textContent = '読み込み中...';
  fetchUserBrief(otherUid).then(u => {
    const nameEl = document.getElementById('chat-thread-name');
    if (nameEl) nameEl.textContent = u.name || '不明なユーザー';
  });

  document.getElementById('chat-message-list').innerHTML = '<div class="timeline-empty">読み込み中...</div>';
  const form = document.getElementById('chat-message-form');
  if (form) form.reset();
  document.getElementById('chat-message-error').textContent = '';

  activeChatUnsubscribe = db.collection('chatMessages')
    .where('threadId', '==', pairId)
    .onSnapshot(snapshot => {
      renderChatMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.error('chat messages listener error:', err.code, err.message);
      const listEl = document.getElementById('chat-message-list');
      if (listEl) listEl.innerHTML = '<div class="timeline-empty">読み込みに失敗しました。ブロックされている可能性があります。</div>';
    });
}

function closeChatThread() {
  clearActiveChatListener();
  activeChatThreadId = null;
  activeChatOtherUid = null;
  currentChatMessagesCache = [];
}

function renderChatMessages(messages) {
  currentChatMessagesCache = messages;
  const listEl = document.getElementById('chat-message-list');
  if (!listEl) return;
  if (messages.length === 0) {
    listEl.innerHTML = '<div class="timeline-empty">まだメッセージがありません。最初のメッセージを送ってみましょう！</div>';
    return;
  }
  // threadId単一条件のみでクエリし、createdAtでの並び替えはクライアント側で行う
  // （circleMessagesと同様、複合インデックスを不要にするため）
  const sorted = messages.slice().sort((a, b) => {
    const at = a.createdAt, bt = b.createdAt;
    if (!at || !bt) return 0;
    return at.toMillis() - bt.toMillis();
  });
  listEl.innerHTML = sorted.map(m => renderChatBubbleHtml(m, m.senderId === currentUser.uid, {
    reportButtonHtml: `<button class="timeline-report-btn" onclick="reportChatMessage('${m.id}')">🚩</button>`,
  })).join('');
  scrollChatToBottom('chat-message-list');
}

async function sendChatMessage(e) {
  e.preventDefault();
  if (!currentUser) { openMyPage(); return; }
  if (!activeChatThreadId) return;
  const textarea = document.getElementById('chat-message-text');
  const errEl = document.getElementById('chat-message-error');
  const btn = document.getElementById('chat-message-submit-btn');
  const text = textarea.value.trim();
  errEl.textContent = '';
  if (!text) {
    errEl.textContent = 'メッセージを入力してください。';
    return;
  }
  if (containsNgWord(text)) {
    errEl.textContent = 'この内容は送信できません。表現を見直してください。';
    return;
  }
  btn.disabled = true;
  try {
    await db.collection('chatMessages').add({
      threadId: activeChatThreadId,
      senderId: currentUser.uid,
      content: text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('chatThreads').doc(activeChatThreadId).update({
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    textarea.value = '';
  } catch (err) {
    console.error('sendChatMessage error:', err.code, err.message);
    errEl.textContent = err.code === 'permission-denied'
      ? '送信できません。ブロックされている可能性があります。'
      : '送信に失敗しました。もう一度お試しください。';
  } finally {
    btn.disabled = false;
  }
}

async function reportChatMessage(messageId) {
  if (!currentUser) { openMyPage(); return; }
  const reason = prompt('通報理由を入力してください（任意）', '');
  if (reason === null) return;
  const msg = currentChatMessagesCache.find(m => m.id === messageId);
  try {
    await db.collection('reports').add({
      targetType: 'chatMessage',
      targetId: messageId,
      reporterId: currentUser.uid,
      reason: reason || '理由未記入',
      contentSnapshot: msg ? msg.content : null,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('通報しました。ご協力ありがとうございます');
  } catch (err) {
    console.error('reportChatMessage error:', err.code, err.message);
    showToast('通報に失敗しました。もう一度お試しください。');
  }
}

function blockChatPartner() {
  if (!activeChatOtherUid) return;
  if (!confirm('このユーザーをブロックしますか？チャット履歴はお互い見られなくなります。')) return;
  blockUser(activeChatOtherUid);
}
