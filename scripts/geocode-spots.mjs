const spots = [
  // カフェ
  { name: "OGAWA COFFEE LABORATORY 下北沢", category: "cafe",
    address: "東京都世田谷区北沢3-19-20 reload1-1",
    description: "reload内。コーヒーの淹れ方を学べる体験型ビーンズサロン。" },
  { name: "felice domani shimokitazawa", category: "cafe",
    address: "東京都世田谷区北沢2-26-14 下北沢Coo 1階B区画",
    description: "\"黒\"をテーマにしたモノトーンカフェ。デザートピザが人気。" },
  { name: "RBL CAFE", category: "cafe",
    address: "東京都世田谷区代沢5-32-12",
    description: "約7000冊の蔵書があるブックカフェ。クイズ作家が運営。" },

  // 古着（既存データと重複するFlamingo/フロリダは除外済み。詳細は実行時のレポート参照）
  { name: "NEW YORK JOE EXCHANGE", category: "vintage",
    address: "東京都世田谷区北沢3-26-4",
    description: "元銭湯を改装。買取査定額の60%相当を店内商品と交換できる。" },
  { name: "東洋百貨店 別館", category: "vintage",
    address: "東京都世田谷区北沢2-25-8",
    description: "個性的な古着店6店舗と雑貨・アクセサリー店が集まる複合スポット。" },

  // カレー（新規カテゴリとして追加）
  { name: "旧ヤム邸 シモキタ荘", category: "curry",
    address: "東京都世田谷区代沢5-29-9 ナイスビル1F",
    description: "大阪発の名店・東京1号店。月替わり3種のスパイスキーマカレー、あいがけ・全がけが定番。" },
  { name: "カレー食堂心", category: "curry",
    address: "東京都世田谷区北沢2-34-8 KMビル1F",
    description: "北海道の恵みを生かした滋味深いスープカレー。骨付きチキンが人気。" },
  { name: "虹色curry食堂", category: "curry",
    address: "東京都世田谷区北沢2-31-9 2F",
    description: "化学調味料無添加。牛すじスパイスカレーや石鍋キーマカレーなど。" },
  { name: "ADDA", category: "curry",
    address: "東京都世田谷区代田2-36-14 BONUS TRACK SOHO4",
    description: "BONUS TRACK内。インド・スリランカ発想で複数カレーと副菜を混ぜて楽しむ。" },
  { name: "カレーの店・八月", category: "curry",
    address: "東京都世田谷区北沢2-14-19",
    description: "東口徒歩3分。日替わりで3〜4種のカレーを提供、店主が一人でレシピを考案。" },
  { name: "YOUNG", category: "curry",
    address: "東京都世田谷区代田5-1-16 1F",
    description: "西口徒歩5分。牛骨・鶏ガラのフォンドボーをベースにした欧風カレー。" }
];

async function geocode(address, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK') {
    console.error(`Geocoding failed for "${address}": ${data.status}`);
    return null;
  }
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng };
}

async function main() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_MAPS_API_KEY環境変数が設定されていません');
    process.exit(1);
  }

  const results = [];
  for (const spot of spots) {
    const coords = await geocode(spot.address, apiKey);
    if (coords) {
      results.push({ ...spot, lat: coords.lat, lng: coords.lng });
      console.log(`✓ ${spot.name}: ${coords.lat}, ${coords.lng}`);
    }
    // レート制限対策として各リクエスト間に少し間隔を空ける
    await new Promise(r => setTimeout(r, 200));
  }

  // data.js にそのまま貼り付けられる形式で出力
  console.log('\n--- data.js用出力 ---\n');
  console.log(JSON.stringify(results, null, 2));
}

main();
