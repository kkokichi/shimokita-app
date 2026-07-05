// ── AUTH STATE ──
let currentUser = null;
let userProfile = null;

// avatarUrlがあれば画像を、なければ既存の🌿絵文字を表示するフォールバック
// （js/events.jsのeventBannerEmojiHtmlと同じ考え方。呼び出し側のdivが既に
// サイズ・背景を持つクラスを付けている前提で、中身だけを返す）
function userAvatarHtml(user) {
  const url = user && user.avatarUrl;
  return url
    ? `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`
    : '🌿';
}

async function uploadAvatarImage(file) {
  const path = `avatar-images/${currentUser.uid}/${Date.now()}_${file.name}`;
  return uploadImageWithTimeout(path, file);
}

function switchAuthTab(tab) {
  document.getElementById('auth-tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('auth-tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('login-form').style.display = tab === 'login' ? 'flex' : 'none';
  document.getElementById('signup-form').style.display = tab === 'signup' ? 'flex' : 'none';
  document.getElementById('login-error').textContent = '';
  document.getElementById('signup-error').textContent = '';
}

function authErrorMessage(err) {
  console.error('Firebase error:', err.code, err.message);
  switch (err.code) {
    case 'auth/email-already-in-use': return 'このメールアドレスは既に登録されています。';
    case 'auth/invalid-email': return 'メールアドレスの形式が正しくありません。';
    case 'auth/weak-password': return 'パスワードは6文字以上で入力してください。';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'メールアドレスまたはパスワードが正しくありません。';
    case 'auth/operation-not-allowed': return 'メール/パスワード認証が無効です。Firebaseコンソールで有効にしてください。';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.': return 'APIキーが正しくありません。firebase-init.jsの設定を確認してください。';
    case 'auth/network-request-failed': return 'ネットワークエラーです。接続を確認してください。';
    case 'permission-denied': return 'データベースへの権限がありません。Firestoreのセキュリティルールを確認してください。';
    case 'unavailable':
    case 'not-found': return 'データベースに接続できません。Firestoreが作成されているか確認してください。';
    case 'auth/requires-recent-login': return 'セキュリティのため、再度ログインしてからお試しください。';
    default: return `エラーが発生しました（${err.code || err.message}）。もう一度お試しください。`;
  }
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = e.target.querySelector('.auth-submit');
  errEl.textContent = '';
  btn.disabled = true;
  auth.signInWithEmailAndPassword(email, password)
    .catch(err => { errEl.textContent = authErrorMessage(err); })
    .finally(() => { btn.disabled = false; });
}

function handleSignup(e) {
  e.preventDefault();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl = document.getElementById('signup-error');
  const btn = e.target.querySelector('.auth-submit');
  errEl.textContent = '';
  btn.disabled = true;
  auth.createUserWithEmailAndPassword(email, password)
    .catch(err => { errEl.textContent = authErrorMessage(err); })
    .finally(() => { btn.disabled = false; });
}

async function handleProfileSubmit(e) {
  e.preventDefault();
  if (!currentUser) return;
  const name = document.getElementById('profile-name').value.trim();
  const ageRange = document.getElementById('profile-age').value;
  const hobby = document.getElementById('profile-hobby').value.trim();
  const bio = document.getElementById('profile-bio').value.trim();
  const avatarFile = document.getElementById('profile-avatar-image').files[0] || null;
  const errEl = document.getElementById('profile-error');
  const btn = e.target.querySelector('.auth-submit');
  errEl.textContent = '';
  if (avatarFile && avatarFile.size > 5 * 1024 * 1024) {
    errEl.textContent = '画像は5MB以下にしてください。';
    return;
  }
  const originalBtnText = btn.textContent;
  btn.disabled = true;
  try {
    let avatarUrl = null;
    if (avatarFile) {
      btn.textContent = '画像をアップロード中...';
      try {
        avatarUrl = await uploadAvatarImage(avatarFile);
      } catch (uploadErr) {
        console.error('avatar upload error:', uploadErr.code, uploadErr.message);
        errEl.textContent = uploadErr.message && uploadErr.message.includes('タイムアウト')
          ? uploadErr.message
          : '画像のアップロードに失敗しました。もう一度お試しください。';
        return;
      }
      btn.textContent = originalBtnText;
    }
    const profile = { name, ageRange, hobby, bio, avatarUrl, email: currentUser.email };
    await db.collection('users').doc(currentUser.uid).set({
      ...profile,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    userProfile = profile;
    showToast('🎉 プロフィールを登録しました！');
    openMyPage();
  } catch (err) {
    errEl.textContent = authErrorMessage(err);
  } finally {
    btn.disabled = false;
    btn.textContent = originalBtnText;
  }
}

function handleLogout() {
  auth.signOut().then(() => {
    userProfile = null;
    joinedEvents.clear();
    renderEvents();
    renderRecommendedEvent();
    navigate('home');
    showToast('ログアウトしました');
  });
}

// ── MYPAGE ROUTING ──
function openMyPage() {
  let target = 'auth';
  if (currentUser && userProfile) target = 'mypage';
  else if (currentUser && !userProfile) target = 'profile-setup';
  if (target === 'mypage') renderMyPage(userProfile);
  navigate(target);
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-mypage').classList.add('active');
}

function renderMyPage(profile) {
  document.getElementById('mypage-avatar').innerHTML = userAvatarHtml(profile);
  document.getElementById('mypage-name').textContent = profile.name;
  document.getElementById('mypage-bio').textContent = profile.bio || `${profile.ageRange}・趣味は${profile.hobby}`;
  document.getElementById('mypage-meta').textContent = profile.email;
  document.getElementById('mypage-hobby-value').textContent = profile.hobby;
  document.getElementById('menu-organizer').style.display = profile.role === 'organizer' ? 'flex' : 'none';
  renderMyPageJoinedStats();
  renderMyPageFriendsCount();
  if (typeof renderMyPageCircles === 'function') renderMyPageCircles();
  if (typeof updateThemeToggleUI === 'function') updateThemeToggleUI();
}

// ── フレンド数（実データ） ──
async function renderMyPageFriendsCount() {
  if (!currentUser) return;
  try {
    const snapshot = await db.collection('friends').where('userIds', 'array-contains', currentUser.uid).get();
    document.getElementById('mypage-stat-friends').textContent = snapshot.size;
  } catch (err) {
    console.error('friends count error:', err.code, err.message);
  }
}

// ── JOINED STATS (Firestore実データ) ──
async function renderMyPageJoinedStats() {
  if (!currentUser) return;
  try {
    const snapshot = await db.collection('eventParticipants').where('userId', '==', currentUser.uid).get();
    document.getElementById('mypage-stat-joined').textContent = snapshot.size;

    let latest = null;
    snapshot.docs.forEach(doc => {
      const d = doc.data();
      if (!d.joinedAt) return;
      if (!latest || d.joinedAt.toMillis() > latest.joinedAt.toMillis()) {
        latest = { eventId: d.eventId, joinedAt: d.joinedAt };
      }
    });
    if (!latest) {
      renderMetPeopleSection(null, []);
      return;
    }

    const ev = events.find(e => e.id === latest.eventId);
    const othersSnapshot = await db.collection('eventParticipants').where('eventId', '==', latest.eventId).get();
    const otherUids = [...new Set(
      othersSnapshot.docs.map(doc => doc.data().userId).filter(uid => uid !== currentUser.uid)
    )];
    const names = await Promise.all(otherUids.map(async uid => {
      try {
        const doc = await db.collection('users').doc(uid).get();
        return doc.exists ? doc.data().name : '不明なユーザー';
      } catch (err) {
        return '不明なユーザー';
      }
    }));
    renderMetPeopleSection(ev, names);
  } catch (err) {
    console.error('mypage joined stats error:', err.code, err.message);
  }
}

function renderMetPeopleSection(ev, names) {
  const section = document.getElementById('mypage-met-section');
  const list = document.getElementById('mypage-met-list');
  if (!ev || names.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  document.getElementById('mypage-met-title').textContent = `「${ev.title}」で会った人`;
  list.innerHTML = names.map(name => `<div class="met-person-chip">🌿 ${escapeHtml(name)}</div>`).join('');
}

// ── アカウント設定 ──
function openAccountSettingsScreen() {
  if (!userProfile) return;
  document.getElementById('account-avatar-preview').innerHTML = userAvatarHtml(userProfile);
  document.getElementById('account-avatar-image').value = '';
  document.getElementById('account-name').value = userProfile.name || '';
  document.getElementById('account-age').value = userProfile.ageRange || '';
  document.getElementById('account-hobby').value = userProfile.hobby || '';
  document.getElementById('account-bio').value = userProfile.bio || '';
  document.getElementById('account-profile-error').textContent = '';
  document.getElementById('account-email-new').value = '';
  document.getElementById('account-email-password').value = '';
  document.getElementById('account-email-error').textContent = '';
  document.getElementById('account-password-new').value = '';
  document.getElementById('account-password-current').value = '';
  document.getElementById('account-password-error').textContent = '';
  navigate('account-settings');
}

async function handleAccountProfileUpdate(e) {
  e.preventDefault();
  if (!currentUser || !userProfile) return;
  const name = document.getElementById('account-name').value.trim();
  const ageRange = document.getElementById('account-age').value;
  const hobby = document.getElementById('account-hobby').value.trim();
  const bio = document.getElementById('account-bio').value.trim();
  const avatarFile = document.getElementById('account-avatar-image').files[0] || null;
  const errEl = document.getElementById('account-profile-error');
  const btn = e.target.querySelector('.auth-submit');
  errEl.textContent = '';
  if (avatarFile && avatarFile.size > 5 * 1024 * 1024) {
    errEl.textContent = '画像は5MB以下にしてください。';
    return;
  }
  const originalBtnText = btn.textContent;
  btn.disabled = true;
  try {
    const updates = { name, ageRange, hobby, bio };
    if (avatarFile) {
      btn.textContent = '画像をアップロード中...';
      try {
        updates.avatarUrl = await uploadAvatarImage(avatarFile);
      } catch (uploadErr) {
        console.error('avatar upload error:', uploadErr.code, uploadErr.message);
        errEl.textContent = uploadErr.message && uploadErr.message.includes('タイムアウト')
          ? uploadErr.message
          : '画像のアップロードに失敗しました。もう一度お試しください。';
        return;
      }
      btn.textContent = originalBtnText;
    }
    await db.collection('users').doc(currentUser.uid).update(updates);
    Object.assign(userProfile, updates);
    renderMyPage(userProfile);
    showToast('プロフィールを更新しました');
  } catch (err) {
    errEl.textContent = authErrorMessage(err);
  } finally {
    btn.disabled = false;
    btn.textContent = originalBtnText;
  }
}

async function handleAccountEmailChange(e) {
  e.preventDefault();
  if (!currentUser) return;
  const newEmail = document.getElementById('account-email-new').value.trim();
  const currentPassword = document.getElementById('account-email-password').value;
  const errEl = document.getElementById('account-email-error');
  const btn = e.target.querySelector('.auth-submit');
  errEl.textContent = '';
  btn.disabled = true;
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPassword);
    await currentUser.reauthenticateWithCredential(cred);
    // Firebaseの現行仕様ではupdateEmail()は使えず、新しいメールアドレス宛に確認リンクを送る
    // verifyBeforeUpdateEmail()が必須。実際の反映はユーザーがリンクをクリックした後になる。
    await currentUser.verifyBeforeUpdateEmail(newEmail);
    document.getElementById('account-email-new').value = '';
    document.getElementById('account-email-password').value = '';
    showToast(`確認メールを${newEmail}に送信しました。リンクをクリックすると変更が完了します`);
  } catch (err) {
    errEl.textContent = authErrorMessage(err);
  } finally {
    btn.disabled = false;
  }
}

async function handleAccountPasswordChange(e) {
  e.preventDefault();
  if (!currentUser) return;
  const newPassword = document.getElementById('account-password-new').value;
  const currentPassword = document.getElementById('account-password-current').value;
  const errEl = document.getElementById('account-password-error');
  const btn = e.target.querySelector('.auth-submit');
  errEl.textContent = '';
  btn.disabled = true;
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPassword);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(newPassword);
    document.getElementById('account-password-new').value = '';
    document.getElementById('account-password-current').value = '';
    showToast('パスワードを変更しました');
  } catch (err) {
    errEl.textContent = authErrorMessage(err);
  } finally {
    btn.disabled = false;
  }
}

auth.onAuthStateChanged(user => {
  currentUser = user;
  if (typeof initCirclesListener === 'function') initCirclesListener();
  if (typeof initMypageListsListener === 'function') initMypageListsListener();
  if (typeof initFriendsListener === 'function') initFriendsListener();
  if (!user) {
    userProfile = null;
    joinedEvents.clear();
    renderEvents();
    renderRecommendedEvent();
    return;
  }
  db.collection('users').doc(user.uid).get().then(doc => {
    userProfile = doc.exists ? doc.data() : null;
    renderEvents(); // organizer限定の「＋イベントを作る」ボタン表示をロール判明後に反映
    if (['mypage', 'auth', 'profile-setup'].includes(currentScreen)) {
      openMyPage();
    }
  }).catch(err => console.error('Firestore fetch error:', err.code, err.message));

  db.collection('eventParticipants').where('userId', '==', user.uid).get().then(snapshot => {
    joinedEvents = new Set(snapshot.docs.map(doc => doc.data().eventId));
    renderEvents();
    renderRecommendedEvent();
    if (typeof checkReminders === 'function') checkReminders();
  }).catch(err => console.error('eventParticipants fetch error:', err.code, err.message));
});
