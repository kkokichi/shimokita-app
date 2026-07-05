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

// key: postId -> { replyCount, liked, replyOpen, repliesLoaded, replies: [] }
const timelinePostMeta = {};
// key: postId -> Post doc data (cache, used for retweet target resolution and reply rendering)
const timelinePostCache = {};

// ── RENDER TIMELINE ──
async function renderTimeline() {
  const listEl = document.getElementById('timeline-list');
  try {
    const snapshot = await db.collection('posts').orderBy('createdAt', 'desc').limit(50).get();
    if (snapshot.empty) {
      listEl.innerHTML = '<div class="timeline-empty">まだ投稿がありません。最初の投稿をしてみましょう！</div>';
      return;
    }
    const allPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    allPosts.forEach(p => { timelinePostCache[p.id] = p; });
    // 旧データにparentPostIdフィールドが無くてもトップレベル扱いにする
    const topLevelPosts = allPosts.filter(p => !p.parentPostId);

    await Promise.all(topLevelPosts.map(async (p) => {
      if (!timelinePostMeta[p.id]) timelinePostMeta[p.id] = { replyOpen: false, repliesLoaded: false, replies: [] };
      const meta = timelinePostMeta[p.id];
      const tasks = [
        db.collection('posts').where('parentPostId', '==', p.id).get().then(s => { meta.replyCount = s.size; }),
      ];
      if (currentUser) {
        tasks.push(
          db.collection('postLikes').doc(`${p.id}_${currentUser.uid}`).get().then(s => { meta.liked = s.exists; })
        );
      } else {
        meta.liked = false;
      }
      if (p.type === 'retweet' && p.originalPostId) {
        tasks.push(
          db.collection('posts').doc(p.originalPostId).get().then(s => {
            timelinePostCache[p.originalPostId] = s.exists ? { id: s.id, ...s.data() } : null;
          })
        );
      }
      await Promise.all(tasks);
    }));

    listEl.innerHTML = topLevelPosts.map(p => renderPostCardHtml(p)).join('');
  } catch (err) {
    console.error('renderTimeline error:', err.code, err.message);
    listEl.innerHTML = '<div class="timeline-empty">読み込みに失敗しました。</div>';
  }
}

function renderPostAuthorName(p) {
  return p.type === 'auto_join' ? 'coenコミュニティ' : (p.userName || '名無しさん');
}

// ── CARD TEMPLATES ──
function renderPostCardHtml(p, isReply) {
  const meta = timelinePostMeta[p.id] || {};
  if (p.type === 'retweet') {
    return renderRetweetCardHtml(p, isReply);
  }
  const wrapClass = isReply ? 'timeline-card timeline-reply-card' : 'timeline-card';
  return `
  <div class="${wrapClass}" id="timeline-card-${p.id}">
    ${renderPostBodyHtml(p, meta)}
    ${isReply ? '' : renderReplyThreadHtml(p.id)}
  </div>`;
}

// compact=true: リツイートに埋め込む元投稿のプレビュー用（読み取り専用、アクション行なし）。
// 通常のトップレベルカードのアクション行・返信フォームとID（reply-form-{id}等）が
// 衝突するのを避けるため、埋め込み表示では常にcompactにする
function renderPostBodyHtml(p, meta, compact) {
  const name = renderPostAuthorName(p);
  const header = `
    <div class="timeline-card-header">
      <div class="friend-row-avatar timeline-card-avatar">${userAvatarHtml({ avatarUrl: p.userAvatarUrl })}</div>
      <div class="timeline-card-meta">
        <span class="timeline-card-name">${escapeHtml(name)}</span>
        <span class="timeline-card-date">${formatPostDate(p.createdAt)}</span>
      </div>
    </div>
    <div class="timeline-card-content">${escapeHtml(p.content)}</div>`;
  if (compact) return header;

  const replyCount = meta.replyCount || 0;
  const likesCount = p.likesCount || 0;
  const retweetCount = p.retweetCount || 0;
  return `${header}
    <div class="timeline-action-row">
      <button class="timeline-action-btn" onclick="toggleReplyForm('${p.id}')">💬 <span>${replyCount}</span></button>
      <button class="timeline-action-btn" onclick="handleRetweet('${p.id}')">🔁 <span>${retweetCount}</span></button>
      <button class="timeline-action-btn ${meta.liked ? 'liked' : ''}" onclick="toggleLike('${p.id}')">${meta.liked ? '♥' : '♡'} <span>${likesCount}</span></button>
      <button class="timeline-report-btn" onclick="handleReport('${p.id}')">🚩</button>
    </div>
    <div class="timeline-reply-form" id="reply-form-${p.id}" style="display:${meta.replyOpen ? 'flex' : 'none'}">
      <textarea class="auth-input" id="reply-text-${p.id}" rows="2" maxlength="280" placeholder="返信を入力..."></textarea>
      <div class="auth-error" id="reply-error-${p.id}"></div>
      <button class="btn-primary auth-submit" onclick="submitReply('${p.id}')">返信する</button>
    </div>`;
}

function renderRetweetCardHtml(p, isReply) {
  const name = renderPostAuthorName(p);
  const original = p.originalPostId ? timelinePostCache[p.originalPostId] : null;
  const wrapClass = isReply ? 'timeline-card timeline-reply-card' : 'timeline-card';
  const embedded = original
    ? `<div class="timeline-embedded-card">${renderPostBodyHtml(original, {}, true)}</div>`
    : `<div class="timeline-embedded-card timeline-embedded-deleted">この投稿は削除されました</div>`;
  return `
  <div class="${wrapClass}" id="timeline-card-${p.id}">
    <div class="timeline-retweet-label">🔁 ${escapeHtml(name)}さんがリツイートしました</div>
    ${embedded}
  </div>`;
}

function renderReplyThreadHtml(postId) {
  const meta = timelinePostMeta[postId];
  if (!meta || !meta.replyOpen) return '';
  if (!meta.repliesLoaded) {
    return '<div class="timeline-reply-thread"><div class="timeline-empty">読み込み中...</div></div>';
  }
  if (meta.replies.length === 0) {
    return '<div class="timeline-reply-thread"><div class="timeline-empty">まだ返信がありません。</div></div>';
  }
  return `<div class="timeline-reply-thread">${meta.replies.map(r => renderPostCardHtml(r, true)).join('')}</div>`;
}

// ── REPLY EXPAND/COLLAPSE ──
async function toggleReplyForm(postId) {
  if (!currentUser) {
    openMyPage();
    return;
  }
  const meta = timelinePostMeta[postId];
  if (!meta) return;
  meta.replyOpen = !meta.replyOpen;
  if (meta.replyOpen && !meta.repliesLoaded) {
    await loadReplies(postId);
  }
  rerenderPostCard(postId);
}

async function loadReplies(postId) {
  const meta = timelinePostMeta[postId];
  try {
    // where(parentPostId==)+orderBy(createdAt)は複合インデックスが必要になるため、
    // 等価条件のみで取得しクライアント側で並び替える
    const snapshot = await db.collection('posts').where('parentPostId', '==', postId).get();
    const replies = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (a.createdAt ? a.createdAt.toMillis() : 0) - (b.createdAt ? b.createdAt.toMillis() : 0));
    replies.forEach(r => { timelinePostCache[r.id] = r; });
    await Promise.all(replies.map(async (r) => {
      if (!timelinePostMeta[r.id]) timelinePostMeta[r.id] = { replyOpen: false, repliesLoaded: false, replies: [] };
      const rMeta = timelinePostMeta[r.id];
      const tasks = [
        db.collection('posts').where('parentPostId', '==', r.id).get().then(s => { rMeta.replyCount = s.size; }),
      ];
      if (currentUser) {
        tasks.push(
          db.collection('postLikes').doc(`${r.id}_${currentUser.uid}`).get().then(s => { rMeta.liked = s.exists; })
        );
      } else {
        rMeta.liked = false;
      }
      await Promise.all(tasks);
    }));
    meta.replies = replies;
    meta.repliesLoaded = true;
  } catch (err) {
    console.error('loadReplies error:', err.code, err.message);
    meta.replies = [];
    meta.repliesLoaded = true;
  }
}

function rerenderPostCard(postId) {
  const p = timelinePostCache[postId];
  if (!p) return;
  const cardEl = document.getElementById(`timeline-card-${postId}`);
  if (!cardEl) return;
  cardEl.outerHTML = renderPostCardHtml(p, cardEl.classList.contains('timeline-reply-card'));
}

// ── LIKE ──
async function toggleLike(postId) {
  if (!currentUser) {
    openMyPage();
    return;
  }
  const likeRef = db.collection('postLikes').doc(`${postId}_${currentUser.uid}`);
  const postRef = db.collection('posts').doc(postId);
  try {
    await db.runTransaction(async (tx) => {
      const [likeSnap, postSnap] = await Promise.all([tx.get(likeRef), tx.get(postRef)]);
      if (!postSnap.exists) throw new Error('post-not-found');
      const current = postSnap.data().likesCount || 0;
      if (likeSnap.exists) {
        tx.delete(likeRef);
        tx.update(postRef, { likesCount: current - 1 });
      } else {
        tx.set(likeRef, {
          postId,
          userId: currentUser.uid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        tx.update(postRef, { likesCount: current + 1 });
      }
    });
    const postSnap = await postRef.get();
    const p = { id: postId, ...postSnap.data() };
    timelinePostCache[postId] = p;
    const meta = timelinePostMeta[postId];
    if (meta) meta.liked = !meta.liked;
    rerenderPostCard(postId);
  } catch (err) {
    console.error('toggleLike error:', err.code, err.message);
    showToast('操作に失敗しました。もう一度お試しください。');
  }
}

// ── RETWEET ──
async function handleRetweet(postId) {
  if (!currentUser) {
    openMyPage();
    return;
  }
  const post = timelinePostCache[postId];
  if (!post) return;
  // リツイートのリツイートは常に真の元投稿に対して行う
  const targetId = post.type === 'retweet' && post.originalPostId ? post.originalPostId : postId;
  const rtRef = db.collection('retweets').doc(`${targetId}_${currentUser.uid}`);
  try {
    const rtSnap = await rtRef.get();
    if (rtSnap.exists) {
      showToast('すでにリツイート済みです');
      return;
    }
    const originalRef = db.collection('posts').doc(targetId);
    const newPostRef = db.collection('posts').doc();
    await db.runTransaction(async (tx) => {
      const originalSnap = await tx.get(originalRef);
      if (!originalSnap.exists) throw new Error('original-not-found');
      const currentCount = originalSnap.data().retweetCount || 0;
      tx.set(rtRef, {
        postId: targetId,
        userId: currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(originalRef, { retweetCount: currentCount + 1 });
      tx.set(newPostRef, {
        userId: currentUser.uid,
        userName: userProfile ? userProfile.name : '名無しさん',
        userAvatarUrl: userProfile ? (userProfile.avatarUrl || null) : null,
        eventId: null,
        type: 'retweet',
        content: '',
        parentPostId: null,
        originalPostId: targetId,
        likesCount: 0,
        retweetCount: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    showToast('リツイートしました');
    renderTimeline();
  } catch (err) {
    console.error('handleRetweet error:', err.code, err.message);
    showToast('リツイートに失敗しました。もう一度お試しください。');
  }
}

// ── REPLY SUBMIT ──
async function submitReply(parentPostId) {
  if (!currentUser) {
    openMyPage();
    return;
  }
  const textarea = document.getElementById(`reply-text-${parentPostId}`);
  const errEl = document.getElementById(`reply-error-${parentPostId}`);
  const text = textarea.value.trim();
  errEl.textContent = '';
  if (!text) {
    errEl.textContent = '返信内容を入力してください。';
    return;
  }
  if (containsNgWord(text)) {
    errEl.textContent = 'この内容は投稿できません。表現を見直してください。';
    return;
  }
  try {
    await db.collection('posts').add({
      userId: currentUser.uid,
      userName: userProfile ? userProfile.name : '名無しさん',
      userAvatarUrl: userProfile ? (userProfile.avatarUrl || null) : null,
      eventId: null,
      type: 'free',
      content: text,
      parentPostId,
      originalPostId: null,
      likesCount: 0,
      retweetCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    textarea.value = '';
    showToast('返信しました！');
    await loadReplies(parentPostId);
    const meta = timelinePostMeta[parentPostId];
    if (meta) meta.replyCount = (meta.replyCount || 0) + 1;
    rerenderPostCard(parentPostId);
  } catch (err) {
    console.error('submitReply error:', err.code, err.message);
    errEl.textContent = '投稿に失敗しました。もう一度お試しください。';
  }
}

// ── COMPOSE MODAL (FAB) ──
function openTimelineComposeModal() {
  if (!currentUser) {
    openMyPage();
    return;
  }
  document.getElementById('timeline-post-error').textContent = '';
  document.getElementById('timeline-post-text').value = '';
  document.getElementById('timeline-compose-overlay').style.display = 'flex';
}

function closeTimelineComposeModal() {
  document.getElementById('timeline-compose-overlay').style.display = 'none';
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
      userAvatarUrl: userProfile ? (userProfile.avatarUrl || null) : null,
      eventId: null,
      type: 'free',
      content: text,
      parentPostId: null,
      originalPostId: null,
      likesCount: 0,
      retweetCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    textarea.value = '';
    showToast('投稿しました！');
    closeTimelineComposeModal();
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
