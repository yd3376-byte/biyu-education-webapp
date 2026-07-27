// 비유 표현 연습하기 2.0 — 문장 다시쓰기 + 5지표 별점 채점.
// 하이브리드 채점(js/scoring.js)만 사용하며, 이 파일이 유일한 화면 로직 진입점이다.

import {
  ensureIdentity, mountNickHeader, showToast, loadJson, escapeHtml,
  validateNickname, validateSchoolCode, getNickname, getSchoolCode
} from './common.js';
import { scoreAnswer, isAiScoringEnabled, setAiScoringEnabled } from './scoring.js';
import { savePracticeSession, getPracticeRankings } from './db.js';

const PROGRESS_KEY = 'ba_practice_progress';
const METRICS = [
  ['fit', '🎯 적합성'],
  ['expression', '🎨 표현력'],
  ['creativity', '💡 창의성'],
  ['wit', '⚡ 기발함'],
  ['vivid', '✨ 생생함']
];

const root = document.getElementById('practice-root');

let questions = [];
let progress = null;
let savedProgress = null;
let viewingRankingStandalone = false; // 문제를 시작하지 않고 랭킹만 보러 온 경우

async function init() {
  await ensureIdentity();
  mountNickHeader(document.getElementById('nick-header'));
  try {
    questions = await loadJson('data/sentences.json');
  } catch {
    root.innerHTML = '<div class="card">문제를 불러오지 못했어. 새로고침 해줘.</div>';
    return;
  }
  savedProgress = loadProgress();
  render();
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function clearProgress() {
  localStorage.removeItem(PROGRESS_KEY);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function questionOrder(mode) {
  return questions.slice(0, mode).map(q => q.id);
}

function currentQuestion() {
  const qid = progress.order[progress.index];
  return questions.find(q => q.id === qid);
}

function cumulativeScore() {
  return Object.values(progress.answers).reduce((s, a) => s + a.total, 0);
}

/* ---------------- 화면 분기 ---------------- */

function render() {
  root.innerHTML = '';
  if (viewingRankingStandalone) return renderRanking();
  if (!progress) return renderStart();
  switch (progress.phase) {
    case 'question': return renderQuestion();
    case 'result': return renderResult();
    case 'nameEntry': return renderNameEntry();
    case 'portfolio': return renderPortfolio();
    case 'ranking': return renderRanking();
    default: return renderStart();
  }
}

/* ---------------- 시작 화면 ---------------- */

function renderStart() {
  const wrap = document.createElement('div');
  wrap.className = 'practice-start card';

  let resumeHtml = '';
  if (savedProgress && savedProgress.order) {
    const doneCount = Object.keys(savedProgress.answers || {}).length;
    resumeHtml = `
      <div class="resume-box">
        <p>이전에 풀던 문제가 있어. (${doneCount}/${savedProgress.order.length}문항 진행)</p>
        <div class="row-btns">
          <button class="btn" id="resume-btn">이어서 하기</button>
          <button class="btn btn-ghost" id="restart-btn">처음부터</button>
        </div>
      </div>`;
  }

  wrap.innerHTML = `
    <h2 class="title">✏️ 비유 표현 연습하기</h2>
    <p>문장을 비유를 사용해 다시 써 보는 연습이야. 다섯 가지 지표로 별점을 받아 볼까?</p>
    <div class="demo-example">
      <div class="demo-label">예시</div>
      <div class="demo-source">원문: 밤이 깊어지자 마을은 조용해졌다.</div>
      <div class="demo-answer">답안: 밤이 깊어지자 마을은 잠든 아기처럼 조용해졌다.</div>
      <div class="demo-stars">🎯🎯🎯 🎨🎨🎨🎨 💡💡💡 ⚡⚡ ✨✨✨</div>
    </div>
    ${resumeHtml}
    <div class="mode-select">
      <div class="field-label">몇 문제 풀까?</div>
      <div class="row-btns" id="mode-btns">
        <button class="btn btn-ghost" data-mode="5">5문제</button>
        <button class="btn btn-ghost" data-mode="10">10문제</button>
        <button class="btn" data-mode="20">20문제 (랭킹 등록 가능)</button>
      </div>
    </div>
    <div class="teacher-toggle">
      <label><input type="checkbox" id="ai-toggle" ${isAiScoringEnabled() ? 'checked' : ''}/> AI 정밀 채점 사용 (교사용 · 설정되어 있을 때만 동작)</label>
    </div>
    <div class="row-btns">
      <button class="btn btn-ghost" id="view-ranking-start-btn">🏆 랭킹 보기</button>
    </div>
  `;
  root.appendChild(wrap);

  wrap.querySelector('#ai-toggle').addEventListener('change', (e) => setAiScoringEnabled(e.target.checked));

  wrap.querySelector('#resume-btn')?.addEventListener('click', () => {
    progress = savedProgress;
    render();
  });
  wrap.querySelector('#restart-btn')?.addEventListener('click', () => {
    clearProgress();
    savedProgress = null;
    render();
  });

  wrap.querySelectorAll('#mode-btns button').forEach((btn) => {
    btn.addEventListener('click', () => startQuiz(Number(btn.dataset.mode)));
  });

  wrap.querySelector('#view-ranking-start-btn').addEventListener('click', () => {
    viewingRankingStandalone = true;
    render();
  });
}

function startQuiz(mode) {
  clearProgress();
  savedProgress = null;
  progress = {
    mode,
    order: questionOrder(mode),
    index: 0,
    answers: {},
    phase: 'question'
  };
  saveProgress();
  render();
}

/* ---------------- 문제 화면 ---------------- */

function buildHint(q) {
  const hints = [
    '소리, 색깔, 촉감 같은 감각을 떠올려 봐.',
    '"~처럼", "~같이"를 붙여 다른 대상에 빗대어 볼까?',
    '"○○는 △△다"처럼 곧바로 비유해도 좋아.',
    '원문보다 더 구체적이고 길게 써 봐.'
  ];
  const idx = [...q.id].reduce((s, c) => s + c.charCodeAt(0), 0) % hints.length;
  return hints[idx];
}

function renderQuestion() {
  const q = currentQuestion();
  const wrap = document.createElement('div');
  wrap.className = 'practice-question card';
  wrap.innerHTML = `
    <div class="q-progress">
      <span>${progress.index + 1} / ${progress.order.length}</span>
      <span class="q-score">누적 ${cumulativeScore()}점</span>
    </div>
    <div class="q-source">
      <div class="q-source-label">원문</div>
      <div class="q-source-text">${escapeHtml(q.source)}</div>
    </div>
    <textarea id="q-answer" rows="4" placeholder="비유를 사용해 문장을 다시 써 봐. (예: '~처럼', '~같이', '○○는 △△다')"></textarea>
    <div class="q-hint" id="q-hint-box" hidden></div>
    <div class="row-btns">
      <button class="btn btn-ghost" id="hint-btn">💡 힌트 보기</button>
      <button class="btn" id="submit-btn" disabled>채점하기</button>
    </div>
  `;
  root.appendChild(wrap);

  const textarea = wrap.querySelector('#q-answer');
  const submitBtn = wrap.querySelector('#submit-btn');
  const sourceLen = q.source.replace(/\s/g, '').length;

  textarea.addEventListener('input', () => {
    const len = textarea.value.replace(/\s/g, '').length;
    submitBtn.disabled = len < sourceLen;
  });

  wrap.querySelector('#hint-btn').addEventListener('click', () => {
    const box = wrap.querySelector('#q-hint-box');
    box.hidden = false;
    box.textContent = buildHint(q);
  });

  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = '채점 중...';
    const answerText = textarea.value.trim();
    let result;
    try {
      result = await scoreAnswer(q, answerText);
    } catch {
      showToast('채점 중 문제가 생겼어. 다시 시도해줘.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = '채점하기';
      return;
    }

    if (result.needsRetry) {
      showToast(result.next, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = '채점하기';
      return;
    }

    progress.answers[q.id] = { ...result, answer: answerText };
    progress.phase = 'result';
    saveProgress();
    render();
  });
}

/* ---------------- 채점 결과 화면 ---------------- */

function buildModelsHtml(q, result) {
  const items = [
    `<div class="model-item"><div class="model-label">선생님 예시</div><div class="model-text">${escapeHtml(q.sample)}</div></div>`
  ];
  if (!result.fallback && Array.isArray(result.models)) {
    result.models.slice(0, 2).forEach((m, i) => {
      items.push(`<div class="model-item"><div class="model-label">AI 예시 ${i + 1}</div><div class="model-text">${escapeHtml(m)}</div></div>`);
    });
  }
  return `<div class="result-models"><div class="result-models-title">모범 답안</div>${items.join('')}</div>`;
}

function renderResult() {
  const q = currentQuestion();
  const result = progress.answers[q.id];
  const isLast = progress.index >= progress.order.length - 1;

  const wrap = document.createElement('div');
  wrap.className = 'practice-result card';
  wrap.innerHTML = `
    ${result.fallback ? '<div class="badge-fallback">간이 채점</div>' : ''}
    <div class="result-stars">
      ${METRICS.map(([, label]) => `
        <div class="star-row">
          <span class="star-row-label">${label}</span>
          <span class="star-row-stars">☆☆☆☆☆</span>
        </div>`).join('')}
    </div>
    <div class="result-total">이번 문제 점수: <strong>${result.total}</strong> / 25</div>
    <div class="result-feedback">
      <p class="good">${escapeHtml(result.good || '잘했어!')}</p>
      <p class="next">${escapeHtml(result.next || '')}</p>
    </div>
    ${buildModelsHtml(q, result)}
    <div class="row-btns">
      ${result.fallback ? '<button class="btn btn-ghost" id="rescore-btn">다시 채점하기</button>' : ''}
      <button class="btn" id="next-btn">${isLast ? '결과 보기' : '다음 문제'}</button>
    </div>
  `;
  root.appendChild(wrap);

  animateStars(wrap, result.stars);
  if (result.total >= 20) fireConfetti();

  wrap.querySelector('#next-btn').addEventListener('click', () => {
    if (isLast) {
      progress.phase = 'nameEntry';
    } else {
      progress.index += 1;
      progress.phase = 'question';
    }
    saveProgress();
    render();
  });

  const rescoreBtn = wrap.querySelector('#rescore-btn');
  rescoreBtn?.addEventListener('click', async () => {
    rescoreBtn.disabled = true;
    rescoreBtn.textContent = '채점 중...';
    try {
      const fresh = await scoreAnswer(q, result.answer);
      progress.answers[q.id] = { ...fresh, answer: result.answer };
      saveProgress();
      render();
    } catch {
      showToast('다시 채점하지 못했어.', 'error');
      rescoreBtn.disabled = false;
      rescoreBtn.textContent = '다시 채점하기';
    }
  });
}

async function animateStars(wrap, stars) {
  const rows = wrap.querySelectorAll('.star-row');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduce) {
    rows.forEach((row, i) => {
      const count = stars[METRICS[i][0]] || 0;
      row.querySelector('.star-row-stars').textContent = '★'.repeat(count) + '☆'.repeat(5 - count);
    });
    return;
  }

  for (let i = 0; i < rows.length; i += 1) {
    const count = stars[METRICS[i][0]] || 0;
    const starsEl = rows[i].querySelector('.star-row-stars');
    for (let s = 0; s <= count; s += 1) {
      starsEl.textContent = '★'.repeat(s) + '☆'.repeat(5 - s);
      // eslint-disable-next-line no-await-in-loop
      await sleep(90);
    }
  }
}

function fireConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  document.body.appendChild(layer);
  const colors = ['#F2A65A', '#6FA287', '#D46A5F', '#1B2A41'];
  for (let i = 0; i < 24; i += 1) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    layer.appendChild(piece);
  }
  setTimeout(() => layer.remove(), 1800);
}

/* ---------------- 이름 입력 화면 ---------------- */

function renderNameEntry() {
  const wrap = document.createElement('div');
  wrap.className = 'practice-name-entry card';
  const total = cumulativeScore();
  const max = progress.order.length * 25;

  wrap.innerHTML = `
    <h2 class="title">수고했어! 🎉</h2>
    <p>총점: <strong>${total}</strong> / ${max}</p>
    ${progress.mode !== 20 ? '<p class="hint">20문제 모드만 랭킹에 등록돼.</p>' : ''}
    <div class="field">
      <label for="pe-nick">닉네임 (2~10자)</label>
      <input id="pe-nick" type="text" maxlength="10" value="${escapeHtml(getNickname())}" />
      <div class="error" id="pe-nick-err"></div>
    </div>
    <div class="field">
      <label for="pe-school">학교 코드 (영문/숫자 4~8자)</label>
      <input id="pe-school" type="text" maxlength="8" value="${escapeHtml(getSchoolCode())}" />
      <div class="error" id="pe-school-err"></div>
    </div>
    <div class="row-btns">
      <button class="btn" id="register-btn">랭킹에 등록하기</button>
      <button class="btn btn-ghost" id="skip-btn">안 올릴래요</button>
    </div>
  `;
  root.appendChild(wrap);

  const goPortfolio = () => {
    progress.phase = 'portfolio';
    saveProgress();
    render();
  };

  wrap.querySelector('#skip-btn').addEventListener('click', goPortfolio);

  wrap.querySelector('#register-btn').addEventListener('click', async () => {
    const nick = wrap.querySelector('#pe-nick').value;
    const school = wrap.querySelector('#pe-school').value;
    const nickResult = validateNickname(nick);
    const schoolResult = validateSchoolCode(school);
    wrap.querySelector('#pe-nick-err').textContent = nickResult.ok ? '' : nickResult.message;
    wrap.querySelector('#pe-school-err').textContent = schoolResult.ok ? '' : schoolResult.message;
    if (!nickResult.ok || !schoolResult.ok) return;

    if (progress.mode === 20) {
      const answersArr = progress.order.map((qid) => {
        const a = progress.answers[qid];
        return { question_id: qid, answer: a.answer, stars: a.stars, score: a.total };
      });
      const bestAnswer = answersArr.reduce((best, a) => (a.score > (best?.score ?? -1) ? a : best), null);
      const { error } = await savePracticeSession({
        nickname: nick.trim(),
        school_code: school.trim().toUpperCase(),
        mode: progress.mode,
        total_score: total,
        max_score: max,
        best_answer: bestAnswer ? bestAnswer.answer : null,
        answers: answersArr
      });
      if (error) showToast('랭킹 등록에 실패했어. 그래도 계속 진행할게.', 'error');
      else showToast('랭킹에 등록됐어!', 'success');
    }
    goPortfolio();
  });
}

/* ---------------- 모음집(포트폴리오) 화면 ---------------- */

function starsSummary(stars) {
  return METRICS.map(([key, label]) => `${label.slice(0, 2)}${stars[key] || 0}`).join(' ');
}

function renderPortfolio() {
  const wrap = document.createElement('div');
  wrap.className = 'practice-portfolio';
  const total = cumulativeScore();
  const max = progress.order.length * 25;
  const n = progress.order.length;

  const metricSums = {};
  METRICS.forEach(([key]) => { metricSums[key] = 0; });
  progress.order.forEach((qid) => {
    const a = progress.answers[qid];
    METRICS.forEach(([key]) => { metricSums[key] += (a.stars[key] || 0); });
  });

  const cardsHtml = progress.order.map((qid) => {
    const q = questions.find((x) => x.id === qid);
    const a = progress.answers[qid];
    return `
      <div class="portfolio-card card">
        <div class="portfolio-source">${escapeHtml(q.source)}</div>
        <div class="portfolio-answer">${escapeHtml(a.answer)}</div>
        <div class="portfolio-stars">${starsSummary(a.stars)}</div>
        <div class="portfolio-score">${a.total} / 25</div>
      </div>`;
  }).join('');

  const metricBarsHtml = METRICS.map(([key, label]) => {
    const avg = (metricSums[key] / n).toFixed(1);
    const pct = Math.round((metricSums[key] / (n * 5)) * 100);
    return `
      <div class="metric-bar-row">
        <span>${label}</span>
        <div class="metric-bar"><div class="metric-bar-fill" style="width:${pct}%"></div></div>
        <span>${avg}</span>
      </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="portfolio-header card">
      <h2 class="title">나의 비유 모음집</h2>
      <div class="portfolio-total">총점 <strong>${total}</strong> / ${max}</div>
      <div class="metric-bars">${metricBarsHtml}</div>
      <div class="row-btns">
        <button class="btn btn-ghost" id="save-image-btn">🖼 이미지로 저장</button>
        <button class="btn btn-ghost" id="print-btn">🖨 인쇄하기</button>
        <button class="btn" id="view-ranking-btn">🏆 랭킹 보기</button>
      </div>
      <div class="row-btns">
        <a class="btn btn-ghost" href="index.html">🏠 메인으로</a>
      </div>
    </div>
    <div class="portfolio-cards" id="portfolio-cards">${cardsHtml}</div>
  `;
  root.appendChild(wrap);

  wrap.querySelector('#print-btn').addEventListener('click', () => window.print());
  wrap.querySelector('#save-image-btn').addEventListener('click', () => saveAsImage(wrap));
  wrap.querySelector('#view-ranking-btn')?.addEventListener('click', () => {
    progress.phase = 'ranking';
    saveProgress();
    render();
  });
}

async function saveAsImage(wrap) {
  if (!window.html2canvas) {
    showToast('이미지 저장 기능을 불러오지 못했어.', 'error');
    return;
  }
  try {
    const canvas = await window.html2canvas(wrap);
    const link = document.createElement('a');
    link.download = '나의_비유_모음집.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch {
    showToast('이미지 저장에 실패했어.', 'error');
  }
}

/* ---------------- 랭킹 화면 ---------------- */

function renderRanking() {
  const wrap = document.createElement('div');
  wrap.className = 'practice-ranking card';
  const backLabel = viewingRankingStandalone ? '← 처음으로' : '← 모음집으로';
  wrap.innerHTML = `
    <h2 class="title">🏆 랭킹</h2>
    <div class="row-btns" id="rank-tabs">
      <button class="btn" data-tab="school">우리 학교</button>
      <button class="btn btn-ghost" data-tab="all">전체</button>
    </div>
    <div id="rank-list">불러오는 중...</div>
    <div class="row-btns">
      <button class="btn btn-ghost" id="back-portfolio-btn">${backLabel}</button>
      <a class="btn btn-ghost" href="index.html">🏠 메인으로</a>
    </div>
  `;
  root.appendChild(wrap);

  wrap.querySelector('#back-portfolio-btn').addEventListener('click', () => {
    if (viewingRankingStandalone) {
      viewingRankingStandalone = false;
    } else {
      progress.phase = 'portfolio';
      saveProgress();
    }
    render();
  });

  async function loadTab(tab) {
    wrap.querySelectorAll('#rank-tabs button').forEach((b) => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('btn', active);
      b.classList.toggle('btn-ghost', !active);
    });
    const listEl = wrap.querySelector('#rank-list');
    listEl.textContent = '불러오는 중...';
    const { data, error } = await getPracticeRankings({ school_code: tab === 'school' ? getSchoolCode() : null });
    if (error) {
      listEl.textContent = '랭킹을 불러오지 못했어.';
      return;
    }
    if (!data || !data.length) {
      listEl.textContent = '아직 랭킹이 없어.';
      return;
    }
    const myNick = getNickname();
    listEl.innerHTML = data.map((row, i) => `
      <div class="rank-row ${row.nickname === myNick ? 'rank-me' : ''}">
        <span class="rank-order">${i + 1}</span>
        <span class="rank-nick">${escapeHtml(row.nickname)}</span>
        <span class="rank-score">${row.total_score}점</span>
      </div>`).join('');
  }

  wrap.querySelectorAll('#rank-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => loadTab(btn.dataset.tab));
  });

  loadTab('school');
}

init();
