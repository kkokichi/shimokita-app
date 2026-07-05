// ── NG WORD FILTER（タイムライン・サークル掲示板共通） ──
const NG_WORDS = ['副業', '権利収入', 'マルチ'];
function containsNgWord(text) {
  return NG_WORDS.some(w => text.includes(w));
}
