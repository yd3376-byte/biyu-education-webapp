// 비유 표현 연습하기 — 하이브리드 채점 엔진.
// scoreAnswer()가 유일한 진입점: 규칙 기반 채점을 항상 먼저 계산해 두고,
// 교사가 AI 채점을 켰을 때만 Edge Function을 호출한다. AI 호출이 실패/타임아웃/
// 키없음/한도초과 등 어떤 이유로든 실패하면 예외 없이 규칙 기반 결과로 돌아간다.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { BANNED_WORDS } from './metaphor.js';

const AI_TOGGLE_KEY = 'ba_ai_scoring_enabled';
const AI_TIMEOUT_MS = 5000;

const SIMILE_RE = /같(은|이|아|아서|던|다)|처럼|듯이?|마냥|양\s/;
const METAPHOR_RE = /(는|은)\s*\S+(이다|다)[.!]?$/;
const REPEAT_CHAR_RE = /(.)\1{3,}/; // ㅋㅋㅋㅋ, 가가가가처럼 같은 글자 4회 이상 반복

let ruleDataPromise = null;

function loadRuleData() {
  if (!ruleDataPromise) {
    ruleDataPromise = Promise.all([
      fetch('data/cliches.json', { cache: 'no-store' }).then(r => r.json()),
      fetch('data/bonus-words.json', { cache: 'no-store' }).then(r => r.json())
    ]).then(([cliches, bonus]) => ({
      cliches: cliches.cliches || [],
      alphaWords: bonus.alpha_words || [],
      onomatopoeia: bonus.onomatopoeia || []
    }));
  }
  return ruleDataPromise;
}

/* ---------------- 교사용 AI 채점 on/off ---------------- */

export function isAiScoringEnabled() {
  const v = localStorage.getItem(AI_TOGGLE_KEY);
  return v === null ? true : v === '1';
}

export function setAiScoringEnabled(enabled) {
  localStorage.setItem(AI_TOGGLE_KEY, enabled ? '1' : '0');
}

/* ---------------- 부정 입력 방어용 유사도 계산 ---------------- */

function similarityRatio(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  let same = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) if (a[i] === b[i]) same += 1;
  return same / Math.max(a.length, b.length);
}

function zeroResult(message, sample, extra = {}) {
  return {
    stars: { fit: 0, expression: 0, creativity: 0, wit: 0, vivid: 0 },
    total: 0,
    good: '',
    next: message,
    models: [],
    fallback: true,
    ...extra
  };
}

/* ---------------- 규칙 기반 채점 (하이브리드의 기본 기능) ---------------- */

function ruleBasedScore(question, answer, ruleData) {
  const raw = (answer ?? '').trim();
  const noSpace = raw.replace(/\s/g, '');
  const sourceNoSpace = question.source.replace(/\s/g, '');

  if (noSpace.length < sourceNoSpace.length || similarityRatio(noSpace, sourceNoSpace) >= 0.9) {
    return zeroResult('원래 문장 그대로야. 비유를 넣어 볼까?', question.sample);
  }
  if (BANNED_WORDS.some(w => raw.includes(w))) {
    return zeroResult('이런 말은 쓸 수 없어.', question.sample);
  }
  if (REPEAT_CHAR_RE.test(raw.replace(/\s/g, ''))) {
    return zeroResult('같은 글자를 반복했어. 진지하게 다시 써 볼까?', question.sample);
  }

  const hasFigure = SIMILE_RE.test(raw) || METAPHOR_RE.test(raw);
  if (!hasFigure) {
    return zeroResult(
      '아직 빗대어 말하지 않았어. "~처럼", "~같이"를 넣어 다시 써 볼까?',
      question.sample,
      { needsRetry: true }
    );
  }

  // 초등학생 격려 취지의 기본 점수. 완전한 판정은 아니지만 오프라인에서도
  // 20문항을 끝까지 진행할 수 있는 "간이 채점"이다.
  let fit = 3;
  let expression = 3;
  let creativity = 3;
  let wit = 2;
  let vivid = 3;

  const growthRatio = noSpace.length / Math.max(1, sourceNoSpace.length);
  if (growthRatio > 1.6) expression = 4;
  if (growthRatio > 2.2) expression = 5;

  // 클리셰를 "자기만의 묘사로 확장했는지"는 진짜 의미 판단이 필요해 규칙만으로는
  // 신뢰할 수 없다 (Phase B의 AI 채점이 이 판단을 담당한다 — 시스템 프롬프트의
  // "확장했다면 감점하지 않는다" 규칙 참고). 규칙 기반에서는 클리셰 문구를 거의
  // 그대로(공백만 다르게) 쓴 경우만 감점한다. 학생이 문구를 바꿔 써서 사전 문자열과
  // 더 이상 일치하지 않는다면, 그 자체가 이미 "확장"의 근거이므로 감점하지 않는다.
  const clicheHit = ruleData.cliches.find(c => raw.includes(c) || raw.includes(c.replace(/\s/g, '')));
  if (clicheHit) creativity = 1;

  const alphaHit = ruleData.alphaWords.some(w => raw.includes(w));
  const onomatopoeiaHit = ruleData.onomatopoeia.some(w => raw.includes(w));
  if (alphaHit) wit = Math.min(5, wit + 1);
  if (onomatopoeiaHit) vivid = Math.min(5, vivid + 1);

  // 적합성이 낮으면 가산점을 전부 무효로 한다. 규칙 기반에서는 "문맥에 실제로
  // 어울리는가"를 판단할 수 없어 fit을 항상 3으로 두지만(그래서 이 블록은 규칙
  // 기반에서는 실행되지 않는다), Phase B의 AI 채점은 fit을 낮게 매길 수 있으므로
  // 이 무효화 규칙은 구조적으로 유지해 둔다.
  if (fit < 3) {
    wit = Math.min(wit, 2);
    vivid = Math.min(vivid, 3);
  }

  const stars = { fit, expression, creativity, wit, vivid };
  const total = Object.values(stars).reduce((a, b) => a + b, 0);

  return {
    stars,
    total,
    good: '비유를 넣어 문장에 생명을 불어넣었구나!',
    next: '색깔, 소리, 촉감 같은 구체적인 감각을 더해 보면 더 생생해질 거야.',
    models: [],
    fallback: true
  };
}

/* ---------------- AI 정밀 채점 (선택 기능) ---------------- */

async function aiScore(question, answer) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/score-metaphor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        questionId: question.id,
        source: question.source,
        answer
      }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`score-metaphor http ${res.status}`);
    const data = await res.json();
    if (!data || !data.stars) throw new Error('score-metaphor invalid response');
    return {
      stars: data.stars,
      total: data.total ?? Object.values(data.stars).reduce((a, b) => a + b, 0),
      good: data.good || '',
      next: data.next || '',
      models: Array.isArray(data.models) ? data.models : [],
      fallback: false
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 하이브리드 채점 진입점. 항상 규칙 기반 결과를 먼저 계산하고,
 * (게이트/부정입력이 아니며) 교사가 AI 채점을 켠 경우에만 정밀 채점을 시도한다.
 * AI 호출이 어떤 이유로든 실패하면 규칙 기반 결과로 조용히 대체한다.
 * @param {{id:string, source:string, sample:string}} question
 * @param {string} answer
 */
export async function scoreAnswer(question, answer) {
  const ruleData = await loadRuleData();
  const rule = ruleBasedScore(question, answer, ruleData);

  // 게이트(비유 없음)나 부정 입력은 AI를 부를 필요 없이 즉시 반환
  if (rule.needsRetry || rule.total === 0) return rule;

  if (!isAiScoringEnabled()) return rule;

  try {
    return await aiScore(question, answer);
  } catch {
    return rule;
  }
}
