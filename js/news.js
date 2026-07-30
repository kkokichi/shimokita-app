// ── 下北沢関連ニュース（複数の外部RSS） ──
// 各配信元は独立して取得する。一部が失敗しても、取得できた配信元だけで
// 新着順の一覧を作る。取得結果はメモリ内にのみ保持する。
const NEWS_FEEDS = [
  {
    id: 'shimoburo',
    name: 'しもブロ',
    url: 'https://www.shimokitazawa.info/feed/',
    emoji: '📰',
    limit: 8,
  },
  {
    id: 'shimokita-keizai',
    name: '下北沢経済新聞',
    url: 'https://shimokita.keizai.biz/rss.xml',
    emoji: '🏙️',
    limit: 8,
  },
  {
    id: 'google-news',
    name: 'Googleニュース',
    url: 'https://news.google.com/rss/search?q=%E4%B8%8B%E5%8C%97%E6%B2%A2&hl=ja&gl=JP&ceid=JP:ja',
    emoji: '🌐',
    limit: 10,
  },
];
const RSS2JSON_API_URL = 'https://api.rss2json.com/v1/api.json?rss_url=';

let newsLoadState = 'idle'; // 'idle' | 'loading' | 'loaded' | 'error'

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || '').trim();
}

function escapeNewsHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeNewsUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (_) {
    return '';
  }
}

function formatRssDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr || '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function createNewsId(sourceId, link, index) {
  const input = `${sourceId}:${link}:${index}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  return `feed-${sourceId}-${Math.abs(hash)}`;
}

function newsItemFromValues(source, item, index) {
  const link = safeNewsUrl(item.link) || source.url;
  const publishedAt = new Date(item.pubDate || '').getTime();
  return {
    id: createNewsId(source.id, link, index),
    title: stripHtml(item.title),
    link,
    date: formatRssDate(item.pubDate),
    publishedAt: Number.isFinite(publishedAt) ? publishedAt : 0,
    category: source.name,
    sourceName: source.name,
    summary: stripHtml(item.description),
    emoji: source.emoji,
    imageUrl: safeNewsUrl(item.imageUrl),
  };
}

// ブラウザからRSSへ直接アクセスし、CORSで拒否された場合は上位側で
// RSS→JSON変換サービスにフォールバックする。
async function fetchNewsFeedDirect(source) {
  const res = await fetch(source.url);
  if (!res.ok) throw new Error('feed fetch failed: ' + res.status);
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, 'text/xml');
  if (xml.querySelector('parsererror')) throw new Error('feed parse error');
  const items = [...xml.querySelectorAll('item')].slice(0, source.limit);
  if (items.length === 0) throw new Error('feed has no items');
  return items.map((item, i) => {
    const media = item.getElementsByTagName('media:content')[0]
      || item.getElementsByTagName('media:thumbnail')[0]
      || item.querySelector('enclosure');
    return newsItemFromValues(source, {
      title: item.querySelector('title')?.textContent || '',
      link: item.querySelector('link')?.textContent || source.url,
      pubDate: item.querySelector('pubDate')?.textContent || '',
      description: item.querySelector('description')?.textContent || '',
      imageUrl: media?.getAttribute('url') || '',
    }, i);
  });
}

async function fetchNewsFeedViaProxy(source) {
  const res = await fetch(RSS2JSON_API_URL + encodeURIComponent(source.url));
  if (!res.ok) throw new Error('proxy fetch failed: ' + res.status);
  const data = await res.json();
  if (data.status !== 'ok' || !Array.isArray(data.items) || data.items.length === 0) {
    throw new Error('proxy returned no items');
  }
  return data.items.slice(0, source.limit).map((item, i) => newsItemFromValues(source, {
    title: item.title || '',
    link: item.link || source.url,
    pubDate: item.pubDate || '',
    description: item.description || item.content || '',
    imageUrl: item.thumbnail || item.enclosure?.link || '',
  }, i));
}

async function fetchNewsSource(source) {
  try {
    return await fetchNewsFeedDirect(source);
  } catch (directErr) {
    console.info(`${source.name}: direct RSS fetch failed; using proxy`, directErr.message);
    return fetchNewsFeedViaProxy(source);
  }
}

function mergeNewsItems(items) {
  const seenLinks = new Set();
  const seenTitles = new Set();
  return items
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter(item => {
      const linkKey = item.link.replace(/[?#].*$/, '');
      const titleKey = item.title.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!titleKey || seenLinks.has(linkKey) || seenTitles.has(titleKey)) return false;
      seenLinks.add(linkKey);
      seenTitles.add(titleKey);
      return true;
    })
    .slice(0, 24);
}

async function ensureNewsLoaded() {
  if (newsLoadState === 'loaded' || newsLoadState === 'loading') return;
  newsLoadState = 'loading';
  try {
    const results = await Promise.allSettled(NEWS_FEEDS.map(fetchNewsSource));
    const items = mergeNewsItems(results
      .filter(result => result.status === 'fulfilled')
      .flatMap(result => result.value));
    const failedSources = results
      .map((result, i) => result.status === 'rejected' ? NEWS_FEEDS[i].name : null)
      .filter(Boolean);
    if (failedSources.length) console.warn('news sources unavailable:', failedSources.join(', '));
    if (items.length === 0) throw new Error('all news sources returned no items');
    news.splice(0, news.length, ...items);
    newsLoadState = 'loaded';
  } catch (err) {
    console.error('news fetch error:', err.message);
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
    <div class="news-card-full" onclick="showNewsDetail('${escapeNewsHtml(n.id)}')">
      <div class="news-card-img">${n.imageUrl ? `<img src="${escapeNewsHtml(n.imageUrl)}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy">` : escapeNewsHtml(n.emoji)}</div>
      <div class="news-card-body">
        <div class="news-card-cat">${escapeNewsHtml(n.category)}</div>
        <div class="news-card-title">${escapeNewsHtml(n.title)}</div>
        <div class="news-card-summary">${escapeNewsHtml(truncateSummary(n.summary))}</div>
        <div class="news-card-date">${escapeNewsHtml(n.date)}</div>
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

// ── 詳細ページ（RSSの抜粋のみを表示し、本文は配信元へリンクする） ──
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
  const imageUrl = safeNewsUrl(n.imageUrl);
  const articleUrl = safeNewsUrl(n.link);
  document.getElementById('news-detail-content').innerHTML = `
    <div class="detail-banner" style="background:var(--forest-pale)">
      ${imageUrl ? `<img src="${escapeNewsHtml(imageUrl)}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<div class="detail-banner-emoji">${escapeNewsHtml(n.emoji)}</div>`}
    </div>
    <div class="detail-body">
      <div class="detail-category"><span class="pill pill-green">${escapeNewsHtml(n.category)}</span></div>
      <div class="detail-title">${escapeNewsHtml(n.title)}</div>
      <div class="detail-info-row">
        <div class="detail-info-icon">📅</div>
        <div><div class="detail-info-label">掲載日</div><div class="detail-info-value">${escapeNewsHtml(n.date)}</div></div>
      </div>
      <div class="detail-desc-label">記事の一部より</div>
      <div class="detail-desc">${escapeNewsHtml(n.summary ? trimToSentenceEnd(n.summary, 200) : '（抜粋はありません）')}</div>
      ${articleUrl ? `
      <a class="detail-map-placeholder" href="${escapeNewsHtml(articleUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">
        <div class="detail-map-icon">📰</div>
        <div class="detail-map-text">${escapeNewsHtml(n.sourceName || n.category)}で全文を読む</div>
      </a>` : ''}
    </div>
  `;
}
