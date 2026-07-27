// 비유 표현 검증 — 세 기능(스토리, 연습, 쪽지 숨기기) 전부 이 파일 하나만 사용한다.

export const BANNED_WORDS = [
  '바보', '멍청이', '병신', '죽어', '꺼져', '시발', '씨발', '개새끼', '병신아',
  '지랄', '닥쳐', '미친놈', '미친년', '좆', '섹스', '자살', '개새'
];

const SIMILE_RE = /같(은|이|아|아서|던)|처럼|듯이?|마냥|양\s/;
const METAPHOR_RE = /(는|은)\s*\S+(이다|다)[.!]?$/;
const LONG_DIGITS_RE = /\d{7,}/;

/**
 * @param {string} text
 * @returns {{ok: boolean, code: string, message: string, type: 'simile'|'metaphor'|null}}
 */
export function checkMetaphor(text) {
  const raw = (text ?? '').trim();
  const noSpace = raw.replace(/\s/g, '');

  if (noSpace.length < 8) {
    return { ok: false, code: 'TOO_SHORT', message: '조금만 더 자세히 써 볼까? (8글자 이상)', type: null };
  }

  const hasBanned = BANNED_WORDS.some(w => raw.includes(w));
  if (hasBanned || LONG_DIGITS_RE.test(raw)) {
    return { ok: false, code: 'BLOCKED', message: '이 표현은 사용할 수 없어.', type: null };
  }

  if (SIMILE_RE.test(raw)) {
    return { ok: true, code: 'OK', message: '', type: 'simile' };
  }

  if (METAPHOR_RE.test(raw)) {
    return { ok: true, code: 'OK', message: '', type: 'metaphor' };
  }

  return {
    ok: false,
    code: 'NO_FIGURE',
    message: '"~같이", "~처럼"을 넣거나 "○○는 △△다"처럼 써 보자.',
    type: null
  };
}

// 콘솔 확인용 예제 (직접 실행 시에만 출력됨: node js/metaphor.js 로 확인 가능한 형태)
export const METAPHOR_EXAMPLES = [
  '짧아',                                   // TOO_SHORT
  '너는 바보 같은 애야 정말로',                 // BLOCKED
  '오늘 날씨가 정말 좋다 진짜로',                // NO_FIGURE
  '운동장은 네모난 초원 같다',                  // simile
  '내 동생은 작은 태풍이다'                     // metaphor
];

if (typeof window === 'undefined') {
  METAPHOR_EXAMPLES.forEach(t => console.log(t, '=>', checkMetaphor(t)));
}
