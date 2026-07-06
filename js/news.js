// ── しもブロ（外部サイト）RSS取得 ──
// 取得結果はメモリ内（news配列）にのみ保持し、localStorage等には残さない。
// 画面遷移中は再取得せず、アプリ（タブ）を開き直すと再取得される。
const SHIMOBURO_FEED_URL = 'https://www.shimokitazawa.info/feed/';
const RSS2JSON_PROXY_URL = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(SHIMOBURO_FEED_URL);

let newsLoadState = 'idle'; // 'idle' | 'loading' | 'loaded' | 'error'

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || '').trim();
}

function formatRssDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr || '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// しもブロのRSSに直接アクセス（WordPress標準構成であれば/feed/で取得できるが、
// CORSで拒否される可能性が高いため失敗したらrss2json経由にフォールバックする）
async function fetchShimokitaNewsDirect() {
  const res = await fetch(SHIMOBURO_FEED_URL);
  if (!res.ok) throw new Error('feed fetch failed: ' + res.status);
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, 'text/xml');
  if (xml.querySelector('parsererror')) throw new Error('feed parse error');
  const items = [...xml.querySelectorAll('item')].slice(0, 10);
  if (items.length === 0) throw new Error('feed has no items');
  return items.map((item, i) => {
    const title = item.querySelector('title')?.textContent || '';
    const link = item.querySelector('link')?.textContent || SHIMOBURO_FEED_URL;
    const pubDate = item.querySelector('pubDate')?.textContent || '';
    const description = stripHtml(item.querySelector('description')?.textContent || '');
    return {
      id: `rss-${i}`,
      title,
      link,
      date: formatRssDate(pubDate),
      category: 'しもブロ',
      summary: description,
      emoji: '📰',
    };
  });
}

// 直接取得できない場合のフォールバック（RSS→JSON変換の中継サービス経由）
async function fetchShimokitaNewsViaProxy() {
  const res = await fetch(RSS2JSON_PROXY_URL);
  if (!res.ok) throw new Error('proxy fetch failed: ' + res.status);
  const data = await res.json();
  if (data.status !== 'ok' || !Array.isArray(data.items) || data.items.length === 0) {
    throw new Error('proxy returned no items');
  }
  return data.items.slice(0, 10).map((item, i) => ({
    id: `rss-${i}`,
    title: item.title || '',
    link: item.link || SHIMOBURO_FEED_URL,
    date: formatRssDate(item.pubDate),
    category: 'しもブロ',
    summary: stripHtml(item.description || ''),
    emoji: '📰',
    imageUrl: item.thumbnail || null,
  }));
}

async function ensureNewsLoaded() {
  if (newsLoadState === 'loaded' || newsLoadState === 'loading') return;
  newsLoadState = 'loading';
  try {
    let items;
    try {
      items = await fetchShimokitaNewsDirect();
    } catch (directErr) {
      console.error('news direct fetch failed, falling back to proxy:', directErr.message);
      items = await fetchShimokitaNewsViaProxy();
    }
    news.splice(0, news.length, ...items);
    newsLoadState = 'loaded';
  } catch (err) {
    console.error('news fetch error (both direct and proxy failed):', err.message);
    newsLoadState = 'error';
  }
  renderNews();
  renderHome();
}

// ── RENDER NEWS ──
function renderNews() {
  const listEl = document.getElementById('news-list');
  if (newsLoadState === 'loading' && news.length === 0) {
    listEl.innerHTML = '<div class="timeline-empty">読み込み中...</div>';
    return;
  }
  if (newsLoadState === 'error' && news.length === 0) {
    listEl.innerHTML = '<div class="timeline-empty">最新情報の取得に失敗しました。</div>';
    return;
  }
  listEl.innerHTML = news.map(n => `
    <div class="news-card-full" onclick="showNewsDetail('${n.id}')">
      <div class="news-card-img">${n.imageUrl ? `<img src="${n.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover">` : n.emoji}</div>
      <div class="news-card-body">
        <div class="news-card-cat">${n.category}</div>
        <div class="news-card-title">${n.title}</div>
        <div class="news-card-summary">${truncateSummary(n.summary)}</div>
        <div class="news-card-date">${n.date}</div>
      </div>
    </div>
  `).join('');
}

// 文字数で単純に切ると文の途中で終わってしまうため、直近の句点（。！？）を
// 探してそこで終わるように調整する（見つからない場合のみ「…」で強制的に切る）
function trimToSentenceEnd(text, maxLength = 120) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  const trimmed = text.slice(0, maxLength);
  const lastPeriod = Math.max(
    trimmed.lastIndexOf('。'),
    trimmed.lastIndexOf('！'),
    trimmed.lastIndexOf('？')
  );
  return lastPeriod > maxLength * 0.5
    ? trimmed.slice(0, lastPeriod + 1)
    : trimmed + '…';
}

function truncateSummary(text, max = 80) {
  return trimToSentenceEnd(text, max);
}

// ── 詳細ページ（取得したRSSの情報のみを表示。本文全体は複製せず、
// 続きはしもブロ側で読んでもらう外部リンクを設置する） ──
function showNewsDetail(id) {
  const n = news.find(item => item.id === id);
  if (!n) return;
  renderNewsDetail(n);
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById('news-detail').classList.add('active');
  document.getElementById('news-detail').scrollTop = 0;
  prevScreen = currentScreen;
  currentScreen = 'news-detail';
}

function renderNewsDetail(n) {
  document.getElementById('news-detail-content').innerHTML = `
    <div class="detail-banner" style="background:var(--forest-pale)">
      ${n.imageUrl ? `<img src="${n.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<div class="detail-banner-emoji">${n.emoji}</div>`}
    </div>
    <div class="detail-body">
      <div class="detail-category"><span class="pill pill-green">${n.category}</span></div>
      <div class="detail-title">${n.title}</div>
      <div class="detail-info-row">
        <div class="detail-info-icon">📅</div>
        <div><div class="detail-info-label">掲載日</div><div class="detail-info-value">${n.date}</div></div>
      </div>
      <div class="detail-desc-label">記事の一部より</div>
      <div class="detail-desc">${n.summary ? trimToSentenceEnd(n.summary, 200) : '（抜粋はありません）'}</div>
      ${n.link ? `
      <a class="detail-map-placeholder" href="${n.link}" target="_blank" rel="noopener" style="text-decoration:none">
        <div class="detail-map-icon">📰</div>
        <div class="detail-map-text">しもブロで全文を読む</div>
      </a>` : ''}
    </div>
  `;
}
