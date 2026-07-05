// ── STATE ──
let friendsCache = [];       // [{ id(=pairId), userIds, sourceRequestId, createdAt }]
let receivedRequests = [];   // [{ id, fromUserId, toUserId, status, createdAt }]
let sentRequests = [];       // [{ id, fromUserId, toUserId, status, createdAt }]
let blockedCache = [];       // [{ id, blockerUserId, blockedUserId, createdAt }]
let friendsListeners = [];

function sortedPairId(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

// users/{uid}の名前などをキャッシュ（presence.jsのpresenceUserCacheを共用し二重取得を避ける）
async function fetchUserBrief(uid) {
  if (presenceUserCache[uid]) return presenceUserCache[uid];
  try {
    const doc = await db.collection('users').doc(uid).get();
    presenceUserCache[uid] = doc.exists ? doc.data() : { name: '不明なユーザー' };
  } catch (err) {
    presenceUserCache[uid] = { name: '不明なユーザー' };
  }
  return presenceUserCache[uid];
}

// ── LISTENERS ──
function clearFriendsListeners() {
  friendsListeners.forEach(unsub => unsub());
  friendsListeners = [];
}

function initFriendsListener() {
  clearFriendsListeners();
  friendsCache = [];
  receivedRequests = [];
  sentRequests = [];
  blockedCache = [];
  if (!currentUser) return;
  const uid = currentUser.uid;

  friendsListeners.push(
    db.collection('friendRequests').where('toUserId', '==', uid).where('status', '==', 'pending')
      .onSnapshot(snapshot => {
        receivedRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (currentScreen === 'friends') renderFriendsScreen();
      }, err => console.error('receivedRequests listener error:', err.code, err.message))
  );
  friendsListeners.push(
    db.collection('friendRequests').where('fromUserId', '==', uid).where('status', '==', 'pending')
      .onSnapshot(snapshot => {
        sentRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (currentScreen === 'friends') renderFriendsScreen();
      }, err => console.error('sentRequests listener error:', err.code, err.message))
  );
  friendsListeners.push(
    db.collection('friends').where('userIds', 'array-contains', uid)
      .onSnapshot(snapshot => {
        friendsCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (currentScreen === 'friends') renderFriendsScreen();
      }, err => console.error('friends listener error:', err.code, err.message))
  );
  friendsListeners.push(
    db.collection('blocks').where('blockerUserId', '==', uid)
      .onSnapshot(snapshot => {
        blockedCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (currentScreen === 'friends') renderFriendsScreen();
      }, err => console.error('blocks listener error:', err.code, err.message))
  );
}

// ── SCREEN ──
function openFriendsScreen() {
  navigate('friends');
  renderFriendsScreen();
  renderRecommendations();
  const searchInput = document.getElementById('friends-search-input');
  if (searchInput) searchInput.value = '';
  const searchResults = document.getElementById('friends-search-results');
  if (searchResults) searchResults.innerHTML = '';
}

// 自分と相手の共通点（同じサークル・同じイベント参加）を最大2件返す。
// 自分自身の所属は既存のグローバル状態（myCircleMemberships/joinedEvents）を再利用し、
// 相手側のみ問い合わせることでクエリ数を抑える
async function computeCommonGround(otherUid) {
  const badges = [];
  const myCircleIds = new Set(Object.keys(myCircleMemberships));
  const myEventIds = joinedEvents;

  try {
    if (myCircleIds.size > 0) {
      const theirCM = await db.collection('circleMembers').where('userId', '==', otherUid).get();
      const sharedCircleIds = theirCM.docs.map(d => d.data().circleId).filter(id => myCircleIds.has(id));
      if (sharedCircleIds.length > 0 && circlesCache.length === 0) {
        const snap = await db.collection('circles').get();
        circlesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
      sharedCircleIds.forEach(id => {
        const c = circlesCache.find(x => x.id === id);
        if (c) badges.push(`🌿 ${circleLabelWithSuffix(c.name)}`);
      });
    }
  } catch (err) {
    console.error('computeCommonGround circles error:', err.code, err.message);
  }

  try {
    if (myEventIds.size > 0) {
      const theirEP = await db.collection('eventParticipants').where('userId', '==', otherUid).get();
      const sharedEventIds = theirEP.docs.map(d => d.data().eventId).filter(id => myEventIds.has(id));
      sharedEventIds.forEach(id => {
        const ev = events.find(e => e.id === id);
        if (ev) badges.push(`📅 ${ev.title}で一緒でした`);
      });
    }
  } catch (err) {
    console.error('computeCommonGround events error:', err.code, err.message);
  }

  return badges.slice(0, 2);
}

// ── 詳細プロフィールモーダル（フレンド一覧・おすすめ・検索結果から共通で呼び出す） ──
// 既存の profile-view-overlay / profile-view-sheet（presence.jsのシンプルな
// プロフィール表示と同じDOM）を流用し、フレンドタブ向けに情報を拡張して表示する
let friendDetailAllEventsHtml = [];
let activeFriendDetailUid = null;

async function openFriendDetailModal(uid) {
  const overlay = document.getElementById('profile-view-overlay');
  const sheet = document.getElementById('profile-view-sheet');
  if (!overlay || !sheet) return;
  activeFriendDetailUid = uid;
  sheet.innerHTML = '<div class="timeline-empty">読み込み中...</div>';
  overlay.style.display = 'flex';
  try {
    const u = await fetchUserBrief(uid);
    if (!u) {
      sheet.innerHTML = '<div class="timeline-empty">プロフィールが見つかりません。</div>';
      return;
    }
    if (circlesCache.length === 0) {
      const snap = await db.collection('circles').get();
      circlesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const [cmSnap, epSnap, rel, commonGround] = await Promise.all([
      db.collection('circleMembers').where('userId', '==', uid).get(),
      db.collection('eventParticipants').where('userId', '==', uid).get(),
      getRelationshipState(uid),
      computeCommonGround(uid),
    ]);

    const circleBadgesHtml = cmSnap.docs.map(d => {
      const c = circlesCache.find(x => x.id === d.data().circleId);
      return c ? `<div class="circle-badge">${c.emoji || '🌿'} ${escapeHtml(circleLabelWithSuffix(c.name))}</div>` : '';
    }).filter(Boolean).join('');

    const sortedParticipation = epSnap.docs.map(d => d.data()).sort((a, b) => {
      const at = a.joinedAt, bt = b.joinedAt;
      if (!at || !bt) return 0;
      return bt.toMillis() - at.toMillis();
    });
    friendDetailAllEventsHtml = sortedParticipation
      .map(p => events.find(e => e.id === p.eventId))
      .filter(Boolean)
      .map(ev => `<div class="friend-row" style="box-shadow:none;padding:8px 0"><div style="flex:1;min-width:0"><div class="friend-row-name" style="font-size:13px;font-weight:600">📅 ${escapeHtml(ev.title)}</div></div></div>`);

    const showCount = 5;
    const hasMore = friendDetailAllEventsHtml.length > showCount;

    sheet.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">${escapeHtml(u.name || '不明なユーザー')}</div>
        <button class="modal-close" onclick="closeProfileViewModal()">×</button>
      </div>
      <div class="profile-view-body">
        <div style="text-align:center">
          <div class="avatar-circle" style="width:64px;height:64px;font-size:30px;margin:0 auto 4px;background:var(--forest-pale);color:var(--forest);border:none;overflow:hidden">${userAvatarHtml(u)}</div>
        </div>
        <div class="profile-view-row"><span class="profile-view-label">自己紹介</span><span>${escapeHtml(u.bio || '未設定')}</span></div>
        ${commonGround.length ? `<div class="friend-badges">${commonGround.map(b => `<span class="pill pill-green">${escapeHtml(b)}</span>`).join('')}</div>` : ''}
        <div class="section-title" style="margin-top:20px">所属サークル</div>
        <div class="met-person-list" style="padding:0">${circleBadgesHtml || '<div class="timeline-empty" style="padding:8px 0">所属サークルはありません。</div>'}</div>
        <div class="section-title" style="margin-top:20px">参加イベント履歴</div>
        <div id="friend-detail-events">
          ${friendDetailAllEventsHtml.length ? friendDetailAllEventsHtml.slice(0, showCount).join('') : '<div class="timeline-empty" style="padding:8px 0">参加履歴はありません。</div>'}
        </div>
        ${hasMore ? `<div id="friend-detail-events-more" style="text-align:center;margin-top:4px"><button class="timeline-report-btn" onclick="expandFriendDetailEvents()">すべて見る（${friendDetailAllEventsHtml.length}件）</button></div>` : ''}
      </div>
      ${renderRelationshipActionHtml(uid, rel)}
    `;
  } catch (err) {
    console.error('openFriendDetailModal error:', err.code, err.message);
    sheet.innerHTML = '<div class="timeline-empty">読み込みに失敗しました。</div>';
  }
}

function expandFriendDetailEvents() {
  const listEl = document.getElementById('friend-detail-events');
  const moreEl = document.getElementById('friend-detail-events-more');
  if (listEl) listEl.innerHTML = friendDetailAllEventsHtml.join('');
  if (moreEl) moreEl.style.display = 'none';
}

async function renderFriendsScreen() {
  const receivedEl = document.getElementById('friends-received-list');
  if (!receivedEl) return;
  const listEl = document.getElementById('friends-list');
  const sentEl = document.getElementById('friends-sent-list');
  const blockedEl = document.getElementById('friends-blocked-list');

  receivedEl.innerHTML = receivedRequests.length === 0
    ? '<div class="timeline-empty">届いている申請はありません。</div>'
    : (await Promise.all(receivedRequests.map(async r => {
        const u = await fetchUserBrief(r.fromUserId);
        return `
        <div class="friend-row">
          <div class="friend-row-avatar">${userAvatarHtml(u)}</div>
          <div class="friend-row-name">${escapeHtml(u.name || '不明なユーザー')}</div>
          <button class="join-btn-sm" onclick="acceptFriendRequest('${r.id}','${r.fromUserId}')">承認する</button>
          <button class="organizer-delete-btn" onclick="declineFriendRequest('${r.id}')">拒否</button>
        </div>`;
      }))).join('');

  // ブロック中の相手は「友達一覧」からは隠す（チャットが無効化されておりボタンを
  // 押せても機能しないため。関係自体は「ブロック中」セクションに表示される）
  const blockedUids = new Set(blockedCache.map(b => b.blockedUserId));
  const visibleFriends = friendsCache.filter(f => !blockedUids.has(f.userIds.find(id => id !== currentUser.uid)));
  listEl.innerHTML = visibleFriends.length === 0
    ? '<div class="timeline-empty">友達はまだいません。</div>'
    : (await Promise.all(visibleFriends.map(async f => {
        const otherUid = f.userIds.find(id => id !== currentUser.uid);
        const [u, badges] = await Promise.all([fetchUserBrief(otherUid), computeCommonGround(otherUid)]);
        return `
        <div class="friend-row" style="cursor:pointer" onclick="openFriendDetailModal('${otherUid}')">
          <div class="friend-row-avatar">${userAvatarHtml(u)}</div>
          <div style="flex:1;min-width:0">
            <div class="friend-row-name">${escapeHtml(u.name || '不明なユーザー')}</div>
            ${badges.length ? `<div class="friend-badges">${badges.map(b => `<span class="pill pill-green">${escapeHtml(b)}</span>`).join('')}</div>` : ''}
          </div>
          <button class="join-btn-sm" onclick="event.stopPropagation();openChatThread('${f.id}','${otherUid}')">💬 チャット</button>
        </div>`;
      }))).join('');

  sentEl.innerHTML = sentRequests.length === 0
    ? '<div class="timeline-empty">送信済みの申請はありません。</div>'
    : (await Promise.all(sentRequests.map(async r => {
        const u = await fetchUserBrief(r.toUserId);
        return `
        <div class="friend-row">
          <div class="friend-row-avatar">${userAvatarHtml(u)}</div>
          <div class="friend-row-name">${escapeHtml(u.name || '不明なユーザー')}</div>
          <span class="pill pill-gray">申請中</span>
          <button class="organizer-delete-btn" onclick="cancelSentRequest('${r.id}')">取り消す</button>
        </div>`;
      }))).join('');

  blockedEl.innerHTML = blockedCache.length === 0
    ? '<div class="timeline-empty">ブロック中のユーザーはいません。</div>'
    : (await Promise.all(blockedCache.map(async b => {
        const u = await fetchUserBrief(b.blockedUserId);
        return `
        <div class="friend-row">
          <div class="friend-row-avatar">${userAvatarHtml(u)}</div>
          <div class="friend-row-name">${escapeHtml(u.name || '不明なユーザー')}</div>
          <button class="organizer-delete-btn" onclick="unblockUser('${b.blockedUserId}')">解除</button>
        </div>`;
      }))).join('');
}

// ── おすすめのつながり／検索 共通：ブロック除外 ──
// 自分自身とブロック関係（双方向）のuidセット。検索では「これだけ」を除外し、
// フレンド/申請中は除外せず状態バッジとして表示する
async function getBlockedUidSet() {
  const excluded = new Set([currentUser.uid]);
  blockedCache.forEach(b => excluded.add(b.blockedUserId));
  try {
    const blockedByOthersSnap = await db.collection('blocks').where('blockedUserId', '==', currentUser.uid).get();
    blockedByOthersSnap.docs.forEach(d => excluded.add(d.data().blockerUserId));
  } catch (err) {
    console.error('getBlockedUidSet error:', err.code, err.message);
  }
  return excluded;
}

// おすすめのつながり用：ブロックに加えて、既にフレンド／申請中の相手も除外
// フレンドタブを開いた時にだけ計算する受動的な表示（プッシュ通知等の能動的な通知はしない）
async function getExcludedUidsForDiscovery() {
  const excluded = await getBlockedUidSet();
  friendsCache.forEach(f => excluded.add(f.userIds.find(id => id !== currentUser.uid)));
  receivedRequests.forEach(r => excluded.add(r.fromUserId));
  sentRequests.forEach(r => excluded.add(r.toUserId));
  return excluded;
}

async function computeRecommendations() {
  const excluded = await getExcludedUidsForDiscovery();
  const candidates = new Map(); // uid -> reasons[]

  const addCandidate = (uid, reason) => {
    if (excluded.has(uid)) return;
    if (!candidates.has(uid)) candidates.set(uid, []);
    const reasons = candidates.get(uid);
    if (reasons.length < 2 && !reasons.includes(reason)) reasons.push(reason);
  };

  try {
    for (const circleId of Object.keys(myCircleMemberships)) {
      const snap = await db.collection('circleMembers').where('circleId', '==', circleId).get();
      const c = circlesCache.find(x => x.id === circleId);
      const label = c ? `同じ「${circleLabelWithSuffix(c.name)}」のメンバーです` : '同じサークルのメンバーです';
      snap.docs.forEach(d => addCandidate(d.data().userId, label));
    }
  } catch (err) {
    console.error('computeRecommendations circles error:', err.code, err.message);
  }

  try {
    for (const eventId of joinedEvents) {
      const snap = await db.collection('eventParticipants').where('eventId', '==', eventId).get();
      const ev = events.find(e => e.id === eventId);
      const label = ev ? `「${ev.title}」で一緒でした` : '同じイベントに参加していました';
      snap.docs.forEach(d => addCandidate(d.data().userId, label));
    }
  } catch (err) {
    console.error('computeRecommendations events error:', err.code, err.message);
  }

  return candidates;
}

async function renderRecommendations() {
  const el = document.getElementById('friends-recommend-list');
  if (!el || !currentUser) return;
  el.innerHTML = '<div class="timeline-empty">読み込み中...</div>';
  try {
    if (circlesCache.length === 0) {
      const snap = await db.collection('circles').get();
      circlesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const candidates = await computeRecommendations();
    if (candidates.size === 0) {
      el.innerHTML = '<div class="timeline-empty">おすすめのつながりはまだありません。</div>';
      return;
    }
    const uids = [...candidates.keys()];
    const rows = await Promise.all(uids.map(async uid => {
      const u = await fetchUserBrief(uid);
      const reasons = candidates.get(uid);
      return `
      <div class="friend-row" style="cursor:pointer" onclick="openFriendDetailModal('${uid}')">
        <div class="friend-row-avatar">${userAvatarHtml(u)}</div>
        <div style="flex:1;min-width:0">
          <div class="friend-row-name">${escapeHtml(u.name || '不明なユーザー')}</div>
          <div class="friend-reason">${reasons.map(r => escapeHtml(r)).join('・')}</div>
        </div>
        <button class="join-btn-sm" onclick="event.stopPropagation();sendFriendRequest('${uid}')">🤝 申請</button>
      </div>`;
    }));
    el.innerHTML = rows.join('');
  } catch (err) {
    console.error('renderRecommendations error:', err.code, err.message);
    el.innerHTML = '<div class="timeline-empty">読み込みに失敗しました。</div>';
  }
}

// ── 検索 ──
let friendsSearchDebounce = null;
function handleFriendsSearchInput(value) {
  clearTimeout(friendsSearchDebounce);
  friendsSearchDebounce = setTimeout(() => searchFriendsByName(value), 300);
}

async function searchFriendsByName(query) {
  const el = document.getElementById('friends-search-results');
  if (!el || !currentUser) return;
  const q = query.trim();
  if (!q) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = '<div class="timeline-empty">検索中...</div>';
  try {
    // 検索ではブロック関係（と自分自身）だけを除外する。フレンド・申請中の相手は
    // 除外せず、状態バッジとして表示する
    const blockedSet = await getBlockedUidSet();
    const friendUids = new Set(friendsCache.map(f => f.userIds.find(id => id !== currentUser.uid)));
    const receivedUids = new Set(receivedRequests.map(r => r.fromUserId));

    const snap = await db.collection('users').get();
    const matches = snap.docs
      .filter(d => !blockedSet.has(d.id))
      .filter(d => (d.data().name || '').includes(q))
      .slice(0, 30);

    if (matches.length === 0) {
      el.innerHTML = '<div class="timeline-empty">該当するユーザーが見つかりません。</div>';
      return;
    }
    el.innerHTML = matches.map(d => {
      const u = d.data();
      presenceUserCache[d.id] = u;
      let actionHtml;
      if (friendUids.has(d.id)) {
        actionHtml = `<span class="pill pill-green">フレンド</span>`;
      } else if (receivedUids.has(d.id)) {
        actionHtml = `<span class="pill pill-gray">承認待ち</span>`;
      } else if (sentRequests.some(r => r.toUserId === d.id)) {
        actionHtml = `<span class="pill pill-gray">申請中</span>`;
      } else {
        actionHtml = `<button class="join-btn-sm" onclick="event.stopPropagation();sendFriendRequest('${d.id}')">🤝 申請</button>`;
      }
      return `
      <div class="friend-row" style="cursor:pointer" onclick="openFriendDetailModal('${d.id}')">
        <div class="friend-row-avatar">${userAvatarHtml(u)}</div>
        <div class="friend-row-name">${escapeHtml(u.name || '不明なユーザー')}</div>
        ${actionHtml}
      </div>`;
    }).join('');
  } catch (err) {
    console.error('searchFriendsByName error:', err.code, err.message);
    el.innerHTML = '<div class="timeline-empty">検索に失敗しました。</div>';
  }
}

// ── ACTIONS ──
async function sendFriendRequest(toUserId) {
  if (!currentUser) { openMyPage(); return; }
  if (toUserId === currentUser.uid) return;
  try {
    await db.collection('friendRequests').add({
      fromUserId: currentUser.uid,
      toUserId,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('🤝 友達申請を送りました');
    if (currentScreen === 'friends') {
      renderRecommendations();
      const searchInput = document.getElementById('friends-search-input');
      if (searchInput && searchInput.value.trim()) searchFriendsByName(searchInput.value);
    }
    // 詳細プロフィールモーダルが同じ相手を表示中なら、アクションボタンを
    // 「申請中」状態に更新するためその場で再描画する
    if (activeFriendDetailUid === toUserId) {
      openFriendDetailModal(toUserId);
    }
  } catch (err) {
    console.error('sendFriendRequest error:', err.code, err.message);
    showToast('申請に失敗しました。もう一度お試しください。');
  }
}

async function acceptFriendRequest(requestId, fromUserId) {
  try {
    await db.collection('friendRequests').doc(requestId).update({
      status: 'accepted',
      respondedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    const userIds = [fromUserId, currentUser.uid].sort();
    const pairId = sortedPairId(fromUserId, currentUser.uid);
    await db.collection('friends').doc(pairId).set({
      userIds,
      sourceRequestId: requestId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('chatThreads').doc(pairId).set({
      participantIds: userIds,
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('🌿 友達になりました！');
  } catch (err) {
    console.error('acceptFriendRequest error:', err.code, err.message);
    showToast('承認に失敗しました。もう一度お試しください。');
  }
}

async function declineFriendRequest(requestId) {
  try {
    await db.collection('friendRequests').doc(requestId).update({
      status: 'declined',
      respondedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('申請を拒否しました');
  } catch (err) {
    console.error('declineFriendRequest error:', err.code, err.message);
    showToast('操作に失敗しました。もう一度お試しください。');
  }
}

async function cancelSentRequest(requestId) {
  try {
    await db.collection('friendRequests').doc(requestId).delete();
    showToast('申請を取り消しました');
  } catch (err) {
    console.error('cancelSentRequest error:', err.code, err.message);
    showToast('操作に失敗しました。もう一度お試しください。');
  }
}

async function blockUser(uid) {
  if (!currentUser || uid === currentUser.uid) return;
  try {
    await db.collection('blocks').doc(`${currentUser.uid}_${uid}`).set({
      blockerUserId: currentUser.uid,
      blockedUserId: uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('ブロックしました');
    if (currentScreen === 'chat-thread' && typeof closeChatThread === 'function') {
      closeChatThread();
      openFriendsScreen();
    }
  } catch (err) {
    console.error('blockUser error:', err.code, err.message);
    showToast('操作に失敗しました。もう一度お試しください。');
  }
}

async function unblockUser(uid) {
  if (!currentUser) return;
  try {
    await db.collection('blocks').doc(`${currentUser.uid}_${uid}`).delete();
    showToast('ブロックを解除しました');
  } catch (err) {
    console.error('unblockUser error:', err.code, err.message);
    showToast('操作に失敗しました。もう一度お試しください。');
  }
}

// ── RELATIONSHIP STATE（プロフィールモーダルの動的ボタン用） ──
async function getRelationshipState(otherUid) {
  if (!currentUser) return { state: 'none' };
  if (otherUid === currentUser.uid) return { state: 'self' };

  const [blockedByMeDoc, blockedByThemDoc] = await Promise.all([
    db.collection('blocks').doc(`${currentUser.uid}_${otherUid}`).get(),
    db.collection('blocks').doc(`${otherUid}_${currentUser.uid}`).get(),
  ]);
  if (blockedByMeDoc.exists) return { state: 'blocked_by_me' };
  if (blockedByThemDoc.exists) return { state: 'blocked_by_them' };

  const pairId = sortedPairId(currentUser.uid, otherUid);
  const friendDoc = await db.collection('friends').doc(pairId).get();
  if (friendDoc.exists) return { state: 'friends', pairId };

  const sentSnap = await db.collection('friendRequests')
    .where('fromUserId', '==', currentUser.uid).where('toUserId', '==', otherUid)
    .where('status', '==', 'pending').limit(1).get();
  if (!sentSnap.empty) return { state: 'pending_sent' };

  const receivedSnap = await db.collection('friendRequests')
    .where('fromUserId', '==', otherUid).where('toUserId', '==', currentUser.uid)
    .where('status', '==', 'pending').limit(1).get();
  if (!receivedSnap.empty) return { state: 'pending_received', requestId: receivedSnap.docs[0].id };

  return { state: 'none' };
}

// プロフィールモーダル用：関係性に応じたアクションボタンのHTML
function renderRelationshipActionHtml(otherUid, rel) {
  if (rel.state === 'self') return '';
  if (rel.state === 'blocked_by_me') {
    return `<button class="organizer-delete-btn" style="width:100%;margin-top:16px" onclick="unblockUser('${otherUid}');closeProfileViewModal()">ブロックを解除</button>`;
  }
  if (rel.state === 'blocked_by_them') {
    return `<div class="auth-error" style="margin-top:16px;text-align:center">この操作はできません。</div>`;
  }
  if (rel.state === 'friends') {
    return `
      <button class="btn-primary" style="width:100%;margin-top:16px" onclick="closeProfileViewModal();openChatThread('${rel.pairId}','${otherUid}')">💬 チャットする</button>
      <button class="organizer-delete-btn" style="width:100%;margin-top:8px" onclick="blockUser('${otherUid}');closeProfileViewModal()">🚫 ブロックする</button>`;
  }
  if (rel.state === 'pending_sent') {
    return `<div class="pill pill-gray" style="margin-top:16px">友達申請を送信中です</div>`;
  }
  if (rel.state === 'pending_received') {
    return `
      <button class="btn-primary" style="width:100%;margin-top:16px" onclick="acceptFriendRequest('${rel.requestId}','${otherUid}');closeProfileViewModal()">承認する</button>
      <button class="organizer-delete-btn" style="width:100%;margin-top:8px" onclick="declineFriendRequest('${rel.requestId}');closeProfileViewModal()">拒否する</button>`;
  }
  return `
    <button class="btn-primary" style="width:100%;margin-top:16px" onclick="sendFriendRequest('${otherUid}')">🤝 友達申請を送る</button>
    <button class="organizer-delete-btn" style="width:100%;margin-top:8px" onclick="blockUser('${otherUid}');closeProfileViewModal()">🚫 ブロックする</button>`;
}
