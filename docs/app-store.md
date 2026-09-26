# App Store 申請ガイド（下北沢アプリ）

iOSアプリをApp Storeで公開するための手順と、App Store Connectに入力する内容をまとめたもの。
入力値はそのままコピーして使える。

- Bundle ID：`com.shimokita.app`
- ビルド方法：Codemagic（`codemagic.yaml` の `ios-workflow`、手動実行）
- 公開URL：https://shimokita-app.vercel.app

---

## 1. Apple Developer Program に登録する（本人のみ）

1. https://developer.apple.com/programs/enroll/ から「個人」で登録（年額12,980円）
2. Apple IDの2ファクタ認証が必要
3. 承認まで通常24〜48時間

## 2. Bundle ID を登録する（本人のみ）

1. https://developer.apple.com/account/resources/identifiers/list →「＋」
2. App IDs → App → Description：`Shimokita App`、Bundle ID（Explicit）：`com.shimokita.app`
3. Capabilities は何も追加しない → Register

## 3. App Store Connect でアプリを作成する（本人のみ）

https://appstoreconnect.apple.com/apps →「＋」→ 新規App

| 項目 | 値 |
|---|---|
| プラットフォーム | iOS |
| 名前 | 下北沢アプリ（使用済みの場合は「しもきた - 下北沢コミュニティ」） |
| プライマリ言語 | 日本語 |
| バンドルID | com.shimokita.app |
| SKU | shimokita-app-001 |
| ユーザアクセス | アクセス制限なし |

## 4. App Store Connect APIキーを作り、Codemagicに登録する（本人のみ）

1. App Store Connect → ユーザとアクセス → 統合 → App Store Connect API →「＋」
   - 名前：`codemagic`、アクセス：`App Manager`
2. `.p8` ファイルをダウンロード（**1回しかダウンロードできない。人に渡さない・Gitに入れない**）
3. Issuer ID と Key ID を控える
4. https://codemagic.io に GitHub でサインアップ → `kkokichi/shimokita-app` を追加
5. Team settings → Integrations → Developer Portal → Connect
   - **名前は `shimokita-asc`**（codemagic.yaml と一致させる）
   - Issuer ID・Key ID・.p8 を入力
6. Team settings → Code signing identities → iOS certificates → 「Generate certificate」
   （Apple Distribution証明書が自動で作られる。秘密鍵のパスワードは控えておく）
7. iOS provisioning profiles →「Fetch profiles」→ `com.shimokita.app` の App Store プロファイルを作成・取得

## 5. ビルドしてTestFlightに上げる

1. Codemagic → shimokita-app →「Start new build」→ ブランチ `main`、ワークフロー `iOS Workflow (TestFlight)`
2. 約15〜25分でApp Store Connectの「TestFlight」にビルドが届く
3. 自分のiPhoneにTestFlightアプリを入れ、次を確認する
   - [ ] 地図が表示される（APIキーの制限に `capacitor://localhost/*` を入れてある）
   - [ ] ログイン・新規登録ができる
   - [ ] 「下北沢にチェックイン」で位置情報の許可ダイアログが日本語で出る
   - [ ] プロフィール画像で写真を選べる
   - [ ] マイページ → 利用規約・プライバシーポリシーが開き、「アプリに戻る」で戻れる
   - [ ] テスト用アカウントで「アカウント削除」ができる

地図が表示されない場合：Google Cloud（プロジェクト `shimokita-community`）でiOS用のAPIキーを別に作る。

## 6. 審査用のデモアカウントを作る（本人のみ）

https://shimokita-app.vercel.app で審査専用のアカウントを新規登録し、プロフィールも登録しておく。
（例：`review.shimokita@<自分のドメインやGmailのエイリアス>`）。このパスワードは審査メモにだけ書く。

---

## 7. App Store Connect に入力する内容

### App情報

| 項目 | 値 |
|---|---|
| サブタイトル（30字） | 下北沢のイベントと仲間が見つかる |
| カテゴリ（プライマリ） | ソーシャルネットワーキング |
| カテゴリ（セカンダリ） | ナビゲーション |
| コンテンツ配信権 | 第三者のコンテンツを含む → はい（Googleマップの店舗情報・ニュースRSS。表示権限あり） |

### 年齢制限（Age Rating）の回答

| 質問 | 回答 |
|---|---|
| 暴力・性的表現・ギャンブル・薬物など | すべて「なし」 |
| ユーザー生成コンテンツ | はい |
| メッセージ・チャット | はい |
| 無制限のWebアクセス | いいえ |
| 年齢確認・ペアレンタルコントロール | いいえ |

### プライバシー（App のプライバシー）

「データを収集していますか？」→ **はい**。トラッキング：**いいえ**（どの項目も「トラッキングに使用」はオフ）

| データの種類 | 用途 | ユーザーに関連付け |
|---|---|---|
| 連絡先情報 → メールアドレス | Appの機能 | はい |
| 連絡先情報 → 名前（表示名） | Appの機能 | はい |
| ユーザコンテンツ → 写真 | Appの機能 | はい |
| ユーザコンテンツ → その他のユーザコンテンツ（投稿・チャット） | Appの機能 | はい |
| 位置情報 → 正確な位置情報 | Appの機能 | はい |
| ID → ユーザID | Appの機能 | はい |

- プライバシーポリシーURL：`https://shimokita-app.vercel.app/privacy.html`

### バージョン情報（1.0）

- サポートURL：`https://shimokita-app.vercel.app/support.html`
- マーケティングURL：`https://shimokita-app.vercel.app`
- 著作権：`2026 下北沢アプリ運営者`
- キーワード（100字）：
  ```
  下北沢,下北,シモキタ,イベント,カフェ,古着,ライブハウス,サウナ,地図,マップ,コミュニティ,サークル,友達,街歩き,世田谷
  ```
- プロモーション用テキスト（170字）：
  ```
  今日の下北沢、どこに行く？ イベント・カフェ・古着屋・ライブハウスを地図で見つけて、同じ街が好きな仲間とつながろう。
  ```
- 概要（説明文）：
  ```
  「下北沢アプリ」は、下北沢のイベント・お店・ニュースを見つけて、同じ街が好きな人とつながるためのコミュニティアプリです。

  ■ イベント
  下北沢で開催中・開催予定のイベントを一覧で確認。気になるイベントは保存したり、参加登録したりできます。

  ■ マップ
  カフェ・古着・サウナ・ライブハウス・カレーなど、ジャンル別に下北沢のお店を地図で探せます。「下北沢にチェックイン」すると、いま街にいる人たちとゆるくつながれます。

  ■ サークル・タイムライン
  同じ趣味の仲間とサークルをつくったり、イベントの参加報告を投稿したり。フレンドになった人とはチャットもできます。

  ■ ニュース
  下北沢の最新ニュースをまとめてチェックできます。

  ■ 安心して使うために
  ・不適切な投稿やユーザーは「通報」「ブロック」できます
  ・位置情報はチェックインしたときだけ使用します
  ・アカウントはアプリからいつでも削除できます
  ```
- スクリーンショット（6.9インチ）：`docs/app-store-screenshots/` の6枚（1290×2796）をこの順番でアップロード
- ビルド：TestFlightに届いたビルドを選択

### App Review に関する情報

- サインインが必要：**はい**（手順6のデモアカウントのメールアドレスとパスワード）
- 連絡先：自分の氏名・電話番号・メールアドレス
- メモ（英語）：
  ```
  Shimokita App is a local community app for the Shimokitazawa neighborhood in Tokyo.

  - Browsing events, the map and news does not require an account.
  - Sign in with the demo account above to try the timeline, circles, friends and chat.
  - Account deletion: My Page > Account Settings > "Delete account" (bottom of the screen).
  - User-generated content safeguards: posts are filtered for objectionable words, every post and
    message can be reported, users can be blocked from their profile, and reports are reviewed by
    the operator within 24 hours (see Terms of Use: https://shimokita-app.vercel.app/terms.html).
  - Location is requested only when the user taps "Check in to Shimokitazawa".
  ```

### 価格と配信状況

- 価格：無料（0円）
- 配信国：日本（最初は日本のみを推奨）

---

## 8. 審査に提出する

「審査用に追加」→「審査へ提出」。結果は通常24〜48時間でメールが届く。
リジェクトされた場合は、Resolution Centerの指摘文をそのままClaudeに貼れば対応できる。

## 公開後に運営者がやること

- **通報への対応**：利用規約で「原則24時間以内に対応」と約束している。主催者ダッシュボードで通報を確認する
- 主催者（organizer）権限は、Firebaseコンソールで `users/{uid}` に `role: "organizer"` を追加して付与する
- アプリを更新したら、Codemagicで再ビルド → 審査に提出（ビルド番号は自動で増える）
