# 下北沢アプリ MVP機能追加 - 実装計画（Firebase版）

既存のHTML/CSS/JS + Firebase（Auth/Firestore）+ Google Maps構成に、
Phase1〜4で確定したMVP機能を追加するための実装計画。
既存ファイル構成（js/core.js, auth.js, data.js, events.js, home.js, map.js, news.js）
に沿って、新規ファイルを追加していく形にする。

## 現状の把握（既存コード確認済み）

- events / spots / news は data.js に静的配列としてハードコードされている
- ユーザープロフィールは Firestore の `users/{uid}` に保存済み（name, ageRange, hobby, bio, email）
- 参加登録（joinedEvents）は `core.js` の `let joinedEvents = new Set()` に保持されているのみで、
  **Firestoreに永続化されていない**（リロードすると消える）
- Firestoreセキュリティルールはおそらく未設定（要確認）。`firestore.rules` を新規作成したので、
  Firebase Consoleまたは `firebase deploy --only firestore:rules` で適用する

## Firestoreコレクション設計

```
users/{uid}
  name, ageRange, hobby, bio, email, role('user'|'organizer'), createdAt
  ※ roleフィールドが未追加。既存ドキュメントには手動で追加が必要
     (Firebase ConsoleのFirestoreデータエディタから直接編集、
      またはKokiさん自身のuidにrole:'organizer'を設定)

events/{eventId}
  ※ 当面はdata.jsの静的配列のままでよい。Phase3-B以降でFirestore管理に移行検討

eventParticipants/{autoId}
  eventId, userId, joinedAt, isRepeat(bool, クライアント側で計算してから書き込む)

posts/{autoId}
  userId, eventId(nullable), type('auto_join'|'free'), content, createdAt

reports/{autoId}
  postId, reporterId, reason, status('pending'|'reviewed'|'dismissed'), createdAt

presence/{autoId}
  userId, checkedInAt, expiresAt
```

## タスク一覧

### Task 1: Firestoreルール適用 + roleフィールド追加
- `firestore.rules` をFirebase Consoleの「Firestore Database > ルール」に貼り付けて公開
- Firestoreデータエディタで、Kokiさん自身の `users/{自分のuid}` ドキュメントに
  `role: "organizer"` フィールドを手動追加

### Task 2: 参加登録をFirestoreに永続化
対象ファイル：`js/events.js`, `js/core.js`

- `handleJoin(id, btn)` を書き換え、`joinedEvents`（メモリ上のSet）だけでなく
  `eventParticipants` コレクションにドキュメントを作成する
- 書き込み前に、同一 `userId` の既存ドキュメント件数をクエリして `isRepeat` を判定
  ```js
  const existing = await db.collection('eventParticipants')
    .where('userId', '==', currentUser.uid).get();
  const isRepeat = existing.size > 0;
  ```
- ログイン状態でない場合は `openMyPage()` を呼んで認証画面に誘導する
  （未ログインでの参加登録を防ぐ。今のコードにはこのガードがないため追加が必要）
- アプリ起動時（`auth.onAuthStateChanged` 内）に、ログインユーザーの
  `eventParticipants` を取得して `joinedEvents` Setを再構築する処理を追加
  （リロード後も参加済み状態が保持されるようにするため）

### Task 3: 参加登録時のタイムライン自動投稿
対象ファイル：`js/events.js`

- `handleJoin` で参加登録が成功したら、`posts` コレクションに
  `type: 'auto_join'` の投稿を自動作成する
  ```js
  db.collection('posts').add({
    userId: currentUser.uid,
    eventId: id,
    type: 'auto_join',
    content: `${userProfile.name}さんが「${ev.title}」に参加しました`,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  ```

### Task 4: タイムライン画面（新規）
新規ファイル：`js/timeline.js`

- `index.html` に `<div class="screen" id="timeline">` を追加、bottom-navにタブ追加
- 投稿一覧表示（`posts` を `createdAt desc` でクエリ）
- 自由投稿フォーム（テキストのみ、画像は見送り）
- NGワード簡易フィルタ（投稿前にクライアント側でチェック。完全な対策ではないが最初の防波堤として）
  ```js
  const NG_WORDS = ['副業', '権利収入', 'マルチ', /* 必要に応じて追加 */];
  function containsNgWord(text) {
    return NG_WORDS.some(w => text.includes(w));
  }
  ```
- 通報ボタン：`reports` コレクションに `status: 'pending'` でドキュメント作成
- 二重投稿防止：送信ボタンをローディング中disableする

### Task 5: 主催者ダッシュボード（新規）
新規ファイル：`js/organizer.js`

- `index.html` に `<div class="screen" id="organizer">` を追加
- アクセス制御：`userProfile.role !== 'organizer'` ならリダイレクトし遷移させない
- イベントごとの参加者一覧（`eventParticipants` を `eventId` でクエリ）、
  `isRepeat` の値に応じて「常連」「新規」タグ表示
- 通報された投稿一覧（`reports` を `status == 'pending'` でクエリ）、削除ボタン
  （削除は対象の `posts` ドキュメントをdeleteし、reportのstatusを`reviewed`に更新）

### Task 6: 下北オンライン（プレゼンス）機能
新規ファイル：`js/presence.js`

- ホーム画面にチェックインボタンを追加（GPS不要、手動チェックイン方式）
- チェックイン時：`presence` に `expiresAt: now + 3時間` でドキュメント作成
- 表示：`presence` を `expiresAt > now()` でクエリし、件数のみをホーム画面に表示
  （個人情報は画面に出さない。クエリ結果の `.size` だけ使う）

### Task 7: 次回イベントレコメンド
新規ファイル：`js/recommend.js`

- ロジック（Cloud Functions不要、クライアント側で完結）：
  1. ユーザーの過去参加イベント（`eventParticipants` → `data.js`のevents参照）から
     organizerを集計し、同じorganizerの未参加イベントを優先表示
  2. 該当がなければ、`participants`降順で上位のイベントを返す
- ホーム画面に「次はこれどう？」カードとして表示

### Task 8: マイページの参加履歴を実データに接続
対象ファイル：`js/auth.js`

- `renderMyPage` の `mypage-stat-joined` を、メモリ上の `joinedEvents.size` ではなく
  Firestoreの `eventParticipants` の実件数に置き換える
- 「前回も会った人」表示：直近参加イベントの他の参加者一覧を `eventParticipants` から取得

## 保留（Phase3-B）

- ポイント機能、役割・バッジ制度、店舗間コラボ掲示板、店主のひとこと日記欄
- presenceの厳密なプライバシー保護（Cloud Functions集計への移行）

## Claude Codeへの申し送り事項

- 既存の `data.js`（events/spots/news配列）は変更しない。イベント自体の管理は
  当面Firestore化せず、静的データのまま扱う
- 各Taskは1つずつ完了させ、動作確認してから次に進む
- `firebase.firestore.FieldValue.serverTimestamp()` を使い、クライアントの時刻ではなく
  サーバー時刻でcreatedAt/joinedAtを記録する（すでにauth.jsのprofile登録で使われている
  パターンを踏襲）
