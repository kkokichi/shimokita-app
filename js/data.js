// ── DATA ──
// SEED_EVENTS: 初期データ。migrateSeedEventsOnce()（js/eventCreate.js）でFirestoreの
// eventsコレクションへ既存IDのまま一度だけ移行するための参照用。
const SEED_EVENTS = [
  { id:'1', title:'下北沢コミュニティラン', description:'初心者歓迎のゆるりとしたランニングイベント。下北沢駅集合→羽根木公園を目指します。走り終えた後は近くのカフェで交流タイム。一人参加が9割なので、気軽に来てください。', date:'2026年7月11日（土）', time:'08:00〜10:00', location:'下北沢駅 南口ロータリー', capacity:20, participants:13, organizer:'coen コミュニティチーム', category:'スポーツ', emoji:'🏃', grad:['#1C3A2F','#2D5A45'] },
  { id:'2', title:'ピアノコンサート by Yuki', description:'アメリカ在住のピアニスト・Yukiによる小規模でアットホームなコンサート。ハーフムーンホールのYamaha C3グランドピアノで奏でる、静かな夜を。定員30名の特別な時間。', date:'2026年8月16日（日）', time:'19:00〜21:00', location:'Half Moon Hall（下北沢）', capacity:30, participants:22, organizer:'coen × Yuki', category:'音楽', emoji:'🎹', grad:['#2C1810','#5C3020'] },
  { id:'3', title:'下北沢まちビンゴ', description:'25店舗をめぐってビンゴを完成させよう！参加店舗でキーワードを集めてLINEで送信。景品もあります。家族・友人・一人でも楽しめる下北沢探索イベント。', date:'2026年7月11日〜20日', time:'各店舗営業時間内', location:'下北沢エリア全域', capacity:1000, participants:342, organizer:'下北沢商店街振興組合 × coen', category:'まちあそび', emoji:'🎯', grad:['#C06030','#E8956D'] },
  { id:'4', title:'coenクラブ キックオフ夜話', description:'coenのコア会員コミュニティ「coenクラブ」の第一回集まり。自己紹介と今後やりたいことのシェア会。軽食・ドリンク付き。共に下北沢を面白くしていく仲間を募集中。', date:'2026年7月25日（土）', time:'19:00〜21:30', location:'coen（下北沢）', capacity:15, participants:8, organizer:'coen', category:'コミュニティ', emoji:'🌿', grad:['#1C3A2F','#3A6B52'] },
  { id:'5', title:'下北沢古着市', description:'下北沢ならではの古着文化を体験。地元セラーが集まるフリーマーケット形式のイベント。掘り出し物を探しながら、セラーとの会話も楽しもう。', date:'2026年7月19日（日）', time:'11:00〜17:00', location:'BONUS TRACK 広場', capacity:200, participants:87, organizer:'BONUS TRACK', category:'マーケット', emoji:'👗', grad:['#4A3728','#7A5748'] },
  { id:'6', title:'朝カフェ読書会', description:'静かな下北沢の朝に、好きな本を持ち寄って読む会。話すも良し、黙々と読むも良し。コーヒー1杯の時間で、ゆるやかに人と繋がる場所。', date:'2026年7月13日（月）', time:'07:30〜09:00', location:'下北沢エリアのカフェ（参加者に告知）', capacity:10, participants:6, organizer:'coen コミュニティ', category:'読書', emoji:'📚', grad:['#3D4B6B','#5D6B9B'] },
  { id:'7', title:'下北沢バル巡り', description:'下北沢の個性的なバル・立ち飲み・ダイニングを3〜4軒はしごするイベント。新しいお店の発見と、食を通じた出会いを楽しもう。', date:'2026年7月18日（金）', time:'19:00〜22:00', location:'下北沢駅周辺', capacity:12, participants:10, organizer:'coen × 下北沢商店街', category:'グルメ', emoji:'🍷', grad:['#6B2D3A','#9B4D5A'] },
  { id:'8', title:'街の写真散歩', description:'カメラ（スマホOK）を持って下北沢を歩こう。「あなたの下北沢」を撮影するゆるい散歩会。後日、参加者の写真でオンライン展示会を開催予定。', date:'2026年7月20日（日）', time:'14:00〜16:30', location:'下北沢駅 東口', capacity:15, participants:9, organizer:'coen', category:'写真', emoji:'📷', grad:['#2C4A6B','#4C7A9B'] },
  { id:'9', title:'ナイトマーケット', description:'夜の下北沢が舞台のクラフトマーケット。ハンドメイド作品や下北沢産食品を販売。ライブパフォーマンスも。街の夜を彩る特別な一夜。', date:'2026年7月26日（土）', time:'18:00〜22:00', location:'BONUS TRACK', capacity:300, participants:134, organizer:'BONUS TRACK × coen', category:'マーケット', emoji:'🌙', grad:['#1A1A3A','#3A3A7A'] },
  { id:'10', title:'こども自然探検隊', description:'羽根木公園で子どもたちが自然を探検するイベント。虫取り・植物観察・プチ工作。親子で楽しめる休日の午前中。', date:'2026年8月3日（日）', time:'09:30〜12:00', location:'羽根木公園', capacity:20, participants:12, organizer:'coen × 羽根木公園', category:'こども', emoji:'🌿', grad:['#2D6B1C','#4D9B3C'] },
];

// events: Firestoreの`events`コレクションから読み込む可変配列（js/eventCreate.jsのinitEventsListenerが更新する）
let events = [];

// SEED_SPOTS: 初期データ。migrateSeedSpotsOnce()（js/map.js）でFirestoreの
// spotsコレクションへ既存IDのまま一度だけ移行するための参照用。
const SEED_SPOTS = [
  // カフェ（実店舗ベース／2026年7月時点）
  { id:'c1', name:'fuzkue', cat:'カフェ', lat:35.6596, lng:139.6641, address:'東京都世田谷区代田2-36-14（BONUS TRACK内）', hours:'12:00〜22:00', desc:'私語厳禁の「本の読める店」。読書に没頭できる独特のルールを持つ、下北沢を代表する読書専門カフェ。', rating:'4.5', icon:'☕' },
  { id:'c2', name:'BEAR POND ESPRESSO', cat:'カフェ', lat:35.6631, lng:139.6649, address:'東京都世田谷区北沢2-36-12 1F', hours:'平日・土 10:30〜18:00／日 11:00〜18:30（火休）', phone:'03-5454-2486', desc:'行列必至の名店。芸術的なラテアートと濃厚な自家製エスプレッソが評判の小さなカフェ。', rating:'4.6', icon:'☕' },
  { id:'c3', name:'猿田彦珈琲 下北沢店', cat:'カフェ', lat:35.6613, lng:139.6678, address:'東京都世田谷区北沢2-24-5 SHIMOKITA FRONT 1F', hours:'平日 7:30〜22:30／休日 9:00〜22:30', phone:'03-6407-0085', desc:'駅前すぐの一号店。朝早くから開いており、19時以降はバーメニューも楽しめる。', rating:'4.3', icon:'☕' },
  { id:'c4', name:'CITY COUNTRY CITY', cat:'カフェ', lat:35.6608, lng:139.6675, address:'東京都世田谷区北沢2-12-13 細沢ビル4F', hours:'12:00〜22:00（L.O.21:30、水休）', phone:'03-3410-6080', desc:'レコード店とカフェバーが融合した空間。サニーデイ・サービスの曽我部恵一氏がオーナーを務める。', rating:'4.4', icon:'☕' },
  { id:'c5', name:'日記屋 月日', cat:'カフェ', lat:35.6595, lng:139.6640, address:'東京都世田谷区代田2-36-12（BONUS TRACK内）', hours:'8:00〜19:00（ドリンクL.O.18:45）', desc:'日記の専門店。新品・古本の日記本やリトルプレスを扱い、併設のコーヒースタンドで一息つける。', rating:'4.5', icon:'☕' },
  { id:'c6', name:'OGAWA COFFEE LABORATORY 下北沢', cat:'カフェ', lat:35.663524, lng:139.6701572, address:'東京都世田谷区北沢3-19-20 reload1-1', desc:'reload内。コーヒーの淹れ方を学べる体験型ビーンズサロン。', icon:'☕' },
  { id:'c7', name:'felice domani shimokitazawa', cat:'カフェ', lat:35.6625084, lng:139.6663559, address:'東京都世田谷区北沢2-26-14 下北沢Coo 1階B区画', desc:'"黒"をテーマにしたモノトーンカフェ。デザートピザが人気。', icon:'☕' },
  { id:'c8', name:'RBL CAFE', cat:'カフェ', lat:35.6589354, lng:139.6680426, address:'東京都世田谷区代沢5-32-12', desc:'約7000冊の蔵書があるブックカフェ。クイズ作家が運営。', icon:'☕' },
  // 古着（実店舗ベース／2026年7月時点）
  { id:'v1', name:'FLAMINGO 下北沢店', cat:'古着', lat:35.6620, lng:139.6674, address:'東京都世田谷区北沢2-25-12 リサビル1F', hours:'平日 12:00〜21:00／土日祝 11:00〜21:00', desc:'40s〜80sのアメリカ古着を1枚1枚セレクト。バイヤーが常駐し商品の入れ替えも早い、下北沢を代表するヴィンテージショップ。', rating:'4.5', icon:'👗' },
  { id:'v2', name:'原宿シカゴ 下北沢店', cat:'古着', lat:35.6598, lng:139.6659, address:'東京都世田谷区代沢5-32-5 シェルボ下北沢', hours:'11:00〜20:00（年中無休）', phone:'03-3419-2890', desc:'アメリカ・ヨーロッパ・日本の古着を幅広く扱う老舗。下北沢駅南西口から徒歩約4分。', rating:'4.4', icon:'👗' },
  { id:'v3', name:'BerBerJin（Straight From LA）', cat:'古着', lat:35.6616, lng:139.6668, address:'東京都世田谷区北沢2-13-15 2F', hours:'12:00〜20:00', desc:'古着を量り売りする話題の店舗。デニム・ミリタリーに強い個性的なセレクトが魅力。', rating:'4.6', icon:'👗' },
  { id:'v4', name:'FLORIDA 下北沢店', cat:'古着', lat:35.6622, lng:139.6681, address:'東京都世田谷区北沢2-29-2 フェニキアビルB1F', hours:'平日 12:00〜21:00／土日祝 11:00〜21:00', desc:'アメカジ・カラフルなヴィンテージが多数揃う。査定額をお米や店舗商品と交換できるユニークな買取システムも。', rating:'4.3', icon:'👗' },
  { id:'v5', name:'WEGO VINTAGE 下北沢店', cat:'古着', lat:35.6621, lng:139.6682, address:'東京都世田谷区北沢2-29-3 オークプラザ1F', hours:'11:00〜21:00', phone:'03-5790-5525', desc:'トレンドとヴィンテージをミックス。入りやすい大型店で、幅広い世代に人気。', rating:'4.2', icon:'👗' },
  { id:'v6', name:'NEW YORK JOE EXCHANGE', cat:'古着', lat:35.6639775, lng:139.6681924, address:'東京都世田谷区北沢3-26-4', desc:'元銭湯を改装。買取査定額の60%相当を店内商品と交換できる。', icon:'👗' },
  { id:'v7', name:'東洋百貨店 別館', cat:'古着', lat:35.6623286, lng:139.6672519, address:'東京都世田谷区北沢2-25-8', desc:'個性的な古着店6店舗と雑貨・アクセサリー店が集まる複合スポット。', icon:'👗' },
  // サウナ・銭湯（実店舗ベース／2026年7月時点）
  { id:'s1', name:'石川湯', cat:'サウナ', lat:35.6636, lng:139.6690, address:'東京都世田谷区北沢3-12-8', hours:'15:30〜23:45（月休、祝日の場合は翌日）', phone:'03-3466-4305', desc:'赤レンガの玄関が目印。下北沢・東北沢・池ノ上のどの駅からも歩ける、地元で愛される老舗銭湯。', rating:'4.2', icon:'♨️' },
  { id:'s2', name:'由縁別邸 代田', cat:'サウナ', lat:35.6588, lng:139.6634, address:'東京都世田谷区代田2-31-26', hours:'日帰り温泉 午前9:00〜／午後16:00〜22:00（最終入場21:30）', desc:'箱根から運ぶ温泉と、男湯ドライサウナ・女湯アロマミストサウナが自慢の温泉旅館。下北沢駅から徒歩8分。', rating:'4.5', icon:'♨️' },
  { id:'s3', name:'サウナ&カプセル ミナミ下北沢店', cat:'サウナ', lat:35.6600, lng:139.6660, address:'東京都世田谷区代沢2-29-9', phone:'03-5481-3731', desc:'南口徒歩3分、100℃超の高温サウナが名物の老舗サウナ＆カプセルホテル。※2026年5月より改装のため休業中、再開時期は要確認。', rating:'4.0', icon:'♨️' },
  // ライブハウス（実店舗ベース／2026年7月時点）
  { id:'l1', name:'下北沢SHELTER', cat:'ライブハウス', lat:35.6620, lng:139.6669, address:'東京都世田谷区北沢2-6-10 仙田ビルB1F', phone:'03-3466-7430', desc:'1991年創業、下北沢のシンボル的ライブハウス。キャパ250名で、POPs・Rock・Punkなど幅広いジャンルの公演を開催。', rating:'4.7', icon:'🎸' },
  { id:'l2', name:'下北沢THREE', cat:'ライブハウス', lat:35.6600, lng:139.6665, address:'東京都世田谷区代沢5-18-1 カラバッシュビルB1F', phone:'03-5486-8804', desc:'音響にこだわったキャパ170名のライブスペース。', rating:'4.5', icon:'🎸' },
  { id:'l3', name:'近道 / おてまえ', cat:'ライブハウス', lat:35.6640, lng:139.6685, address:'東京都世田谷区北沢3-31-15', desc:'2023年、閉店した「下北沢GARAGE」の跡地にオープン。1階はアコースティックBAR「おてまえ」、地下はライブハウス「近道」。', rating:'4.3', icon:'🎸' },
  { id:'l4', name:'Half Moon Hall', cat:'ライブハウス', lat:35.6650, lng:139.6700, address:'東京都世田谷区北沢4-10-4', desc:'Yamaha C3グランドピアノを設置。クラシック・ジャズに最適な、アットホームな音楽ホール。', rating:'4.6', icon:'🎸' },
  { id:'l5', name:'CLUB251', cat:'ライブハウス', lat:35.6595, lng:139.6662, address:'東京都世田谷区代沢5-29-15 SYビルB1', phone:'03-5481-4141', desc:'多彩なジャンルの公演が毎夜開催される、代沢のライブハウス。', rating:'4.4', icon:'🎸' },
  // カレー（実店舗ベース／2026年7月時点）
  { id:'k1', name:'旧ヤム邸 シモキタ荘', cat:'カレー', lat:35.6584323, lng:139.6670753, address:'東京都世田谷区代沢5-29-9 ナイスビル1F', desc:'大阪発の名店・東京1号店。月替わり3種のスパイスキーマカレー、あいがけ・全がけが定番。', icon:'🍛' },
  { id:'k2', name:'カレー食堂心', cat:'カレー', lat:35.6634103, lng:139.6685224, address:'東京都世田谷区北沢2-34-8 KMビル1F', desc:'北海道の恵みを生かした滋味深いスープカレー。骨付きチキンが人気。', icon:'🍛' },
  { id:'k3', name:'虹色curry食堂', cat:'カレー', lat:35.6629968, lng:139.6679816, address:'東京都世田谷区北沢2-31-9 2F', desc:'化学調味料無添加。牛すじスパイスカレーや石鍋キーマカレーなど。', icon:'🍛' },
  { id:'k4', name:'ADDA', cat:'カレー', lat:35.6593012, lng:139.6640272, address:'東京都世田谷区代田2-36-14 BONUS TRACK SOHO4', desc:'BONUS TRACK内。インド・スリランカ発想で複数カレーと副菜を混ぜて楽しむ。', icon:'🍛' },
  { id:'k5', name:'カレーの店・八月', cat:'カレー', lat:35.6594158, lng:139.6676191, address:'東京都世田谷区北沢2-14-19', desc:'東口徒歩3分。日替わりで3〜4種のカレーを提供、店主が一人でレシピを考案。', icon:'🍛' },
  { id:'k6', name:'YOUNG', cat:'カレー', lat:35.6597129, lng:139.66379, address:'東京都世田谷区代田5-1-16 1F', desc:'西口徒歩5分。牛骨・鶏ガラのフォンドボーをベースにした欧風カレー。', icon:'🍛' },
];

// spots: Firestoreの`spots`コレクションから読み込む可変配列（js/map.jsのinitSpotsListenerが更新する）
let spots = [];

const news = [
  { id:'1', title:'BONUS TRACK リニューアルオープン！新テナント情報', date:'2026年6月28日', category:'まちニュース', summary:'下北沢の人気スポットBONUS TRACKが一部リニューアル。新たに3店舗が加わり、さらに充実した空間に。', emoji:'🏗️' },
  { id:'2', title:'下北沢まちビンゴ参加店舗募集中（締切7/5）', date:'2026年6月25日', category:'イベント', summary:'7月11〜20日開催のまちビンゴに参加する店舗を募集しています。参加費無料、商店街振興組合経由でお申込みを。', emoji:'🎯' },
  { id:'3', title:'羽根木公園の梅まつり、記録的来場者数を達成', date:'2026年6月20日', category:'まちニュース', summary:'今年の梅まつりは約15万人が来場。下北沢エリア全体の経済波及効果は前年比120%を記録した。', emoji:'🌸' },
  { id:'4', title:'coenが「共創スペース」として下北沢に誕生', date:'2026年6月15日', category:'コミュニティ', summary:'下北沢に新しいコミュニティ共創スペース「coen」がオープン。地域の人と街をつなぐ場として注目を集めている。', emoji:'🌿' },
  { id:'5', title:'下北沢の音楽シーン2026年上半期レポート', date:'2026年6月10日', category:'音楽', summary:'上半期のライブ開催数は前年比115%。若手アーティストの登竜門として、全国からの注目が集まっている。', emoji:'🎸' },
  { id:'6', title:'商店街マップ2026年版、デジタル版が公開', date:'2026年6月5日', category:'まちニュース', summary:'下北沢商店街振興組合が今年版のデジタルマップを公開。100以上の店舗が掲載されている。', emoji:'🗺️' },
  { id:'7', title:'「下北沢を歩く」写真展、7月開催決定', date:'2026年5月30日', category:'アート', summary:'地元在住のフォトグラファー5名による写真展が7月に開催予定。下北沢の「今」を切り取った作品が並ぶ。', emoji:'📸' },
  { id:'8', title:'下北沢カレー激戦区、新店情報まとめ', date:'2026年5月25日', category:'グルメ', summary:'「カレーの街」として知られる下北沢に今年上半期だけで5店舗の新規カレー店がオープン。各店の特徴をまとめた。', emoji:'🍛' },
  { id:'9', title:'古着文化の新潮流、下北沢から発信', date:'2026年5月20日', category:'ファッション', summary:'Z世代を中心に古着ブームが継続。下北沢の古着店売上は前年比130%と好調で、海外観光客の来店も増加。', emoji:'👗' },
  { id:'10', title:'下北沢エリア夏のイベントカレンダー公開', date:'2026年5月15日', category:'イベント', summary:'7月〜8月の夏シーズンのイベント情報をまとめたカレンダーが公開。20以上のイベントが予定されている。', emoji:'📅' },
];

const catConfig = {
  'カフェ':       { color:'#E65100', bg:'#FFF3E0', icon:'☕', pin:'http://maps.google.com/mapfiles/ms/icons/orange-dot.png' },
  '古着':         { color:'#6A1B9A', bg:'#F3E5F5', icon:'👗', pin:'http://maps.google.com/mapfiles/ms/icons/purple-dot.png' },
  'サウナ':       { color:'#0D47A1', bg:'#E3F2FD', icon:'♨️', pin:'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'   },
  'ライブハウス':  { color:'#880E4F', bg:'#FCE4EC', icon:'🎸', pin:'http://maps.google.com/mapfiles/ms/icons/pink-dot.png'   },
  'カレー':       { color:'#F9A825', bg:'#FFF8E1', icon:'🍛', pin:'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png' },
};
