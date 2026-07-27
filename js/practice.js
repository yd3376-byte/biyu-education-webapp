import { checkMetaphor } from './metaphor.js';
import { ensureIdentity, mountNickHeader, showToast, loadJson, escapeHtml } from './common.js';
import { saveRanking, getRankings } from './db.js';

const TIME_LIMIT = 20;
const TYPE_LABELS = {
  type_kind: '직유/은유 구분',
  type_tenor: '원관념 찾기',
  type_fill: '빈칸 채우기',
  type_make: '표현 만들기'
};
const TYPE_COUNTS = { type_kind: 2, type_tenor: 3, type_fill: 3, type_make: 2 };

let identity = null;
let bank = [];
let session = null;
let timerId = null;

const root = document.getElementById('practice-root');

async function init() {
  identity = await ensureIdentity();
  mountNickHeader(document.getElementById('nick-header'));
  bank = await loadJson('data/questions.json');
  renderStart();
}
init();

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickQuestions() {
  const byType = {};
  bank.forEach((q) => {
    (byType[q.type] ||= []).push(q);
  });
  let picked = [];
  Object.entries(TYPE_COUNTS).forEach(([type, count]) => {
    picked = picked.concat(shuffle(byType[type] || []).slice(0, count));
  });
  return shuffle(picked);
}

function clearTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

/* ---------------- 시작 화면 ---------------- */

function renderStart() {
  root.innerHTML = `
    <h1 class="title practice-title">✏️ 비유 표현 연습하기</h1>
    <p class="practice-sub">${escapeHtml(identity.nickname)} / ${escapeHtml(identity.schoolCode)}</p>
    <div class="card">
      <ul class="practice-rules">
        <li>총 10문제, 문제당 제한시간 20초</li>
        <li>객관식은 정답 시 100점 + 남은 시간 보너스(최대 100점)</li>
        <li>표현 만들기(주관식)는 통과 시 150점</li>
        <li>3문제 연속 정답부터 콤보 배수가 붙어요 (최대 ×2.0)</li>
        <li>틀려도 감점은 없어요. 편하게 풀어보세요!</li>
      </ul>
      <button class="btn" id="start-btn" style="width:100%">시작하기</button>
    </div>
  `;
  root.querySelector('#start-btn').addEventListener('click', () => {
    session = {
      questions: pickQuestions(),
      index: 0,
      comboStreak: 0,
      answers: []
    };
    renderQuiz();
  });
}

/* ---------------- 퀴즈 진행 ---------------- */

function renderQuiz() {
  clearTimer();
  const q = session.questions[session.index];
  const total = session.questions.length;

  root.innerHTML = `
    <div class="q-progress">
      <span>문항 ${session.index + 1} / ${total}</span>
      <span>${TYPE_LABELS[q.type]}${session.comboStreak >= 3 ? `<span class="combo-badge">COMBO ×${comboMultiplier(session.comboStreak).toFixed(1)}</span>` : ''}</span>
    </div>
    <div class="q-timer-bar"><div class="q-timer-fill" id="timer-fill" style="width:100%"></div></div>
    <div class="card">
      <p>${escapeHtml(q.prompt)}</p>
      <div class="q-sentence" id="q-sentence"></div>
      <div id="q-body"></div>
      <div class="q-feedback" id="q-feedback"></div>
    </div>
  `;

  const sentenceEl = root.querySelector('#q-sentence');
  if (q.type === 'type_make') {
    sentenceEl.textContent = `대상: ${q.target}`;
  } else {
    sentenceEl.innerHTML = q.sentence; // 개발자가 작성한 신뢰된 콘텐츠 (밑줄 태그 포함)
  }

  if (q.type === 'type_make') {
    renderMakeBody(q);
  } else {
    renderChoiceBody(q);
  }

  startTimer(q);
}

function comboMultiplier(streak) {
  return streak >= 3 ? Math.min(2.0, 1 + (streak - 2) * 0.2) : 1;
}

function startTimer(q) {
  let remaining = TIME_LIMIT;
  const fill = root.querySelector('#timer-fill');
  updateTimerUI(fill, remaining);

  timerId = setInterval(() => {
    remaining -= 1;
    updateTimerUI(fill, remaining);
    if (remaining <= 0) {
      clearTimer();
      handleTimeout(q);
    }
  }, 1000);
}

function updateTimerUI(fill, remaining) {
  const pct = Math.max(0, (remaining / TIME_LIMIT) * 100);
  fill.style.width = `${pct}%`;
  fill.classList.toggle('low', remaining <= 5);
}

function getRemainingSeconds() {
  const fill = root.querySelector('#timer-fill');
  if (!fill) return 0;
  return Math.round((parseFloat(fill.style.width) / 100) * TIME_LIMIT);
}

/* ---- 객관식 ---- */

function renderChoiceBody(q) {
  const body = root.querySelector('#q-body');
  const wrap = document.createElement('div');
  wrap.className = 'q-choices';
  q.choices.forEach((choice, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = choice;
    btn.addEventListener('click', () => onChoiceSelected(q, i, wrap));
    wrap.appendChild(btn);
  });
  body.appendChild(wrap);
}

function onChoiceSelected(q, chosenIndex, wrap) {
  clearTimer();
  const buttons = [...wrap.querySelectorAll('button')];
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === q.answer) b.classList.add('correct');
    if (i === chosenIndex && chosenIndex !== q.answer) b.classList.add('wrong');
  });

  const isCorrect = chosenIndex === q.answer;
  const remaining = getRemainingSeconds();
  const feedback = root.querySelector('#q-feedback');

  if (isCorrect) {
    const base = 100 + Math.min(remaining * 5, 100);
    recordAnswer(q, true, base, { chosenIndex });
    feedback.textContent = `정답이야! ${q.explain}`;
    feedback.className = 'q-feedback success';
  } else {
    recordAnswer(q, false, 0, { chosenIndex });
    feedback.textContent = q.explain;
    feedback.className = 'q-feedback error';
  }

  setTimeout(nextQuestion, 1100);
}

/* ---- 주관식(표현 만들기) ---- */

function renderMakeBody(q) {
  const body = root.querySelector('#q-body');
  body.innerHTML = `
    <div class="q-make">
      <textarea id="make-input" maxlength="80" placeholder="예: ${escapeHtml(q.target)}은(는) ... 같다"></textarea>
      <button class="btn" id="make-submit" style="width:100%;margin-top:10px;">제출하기</button>
    </div>
  `;
  body.querySelector('#make-submit').addEventListener('click', () => {
    const input = body.querySelector('#make-input');
    const result = checkMetaphor(input.value);
    const feedback = root.querySelector('#q-feedback');

    if (result.ok) {
      clearTimer();
      input.disabled = true;
      body.querySelector('#make-submit').disabled = true;
      recordAnswer(q, true, 150, { myText: input.value.trim() });
      feedback.textContent = '좋은 표현이야!';
      feedback.className = 'q-feedback success';
      setTimeout(nextQuestion, 1100);
    } else {
      feedback.textContent = result.message;
      feedback.className = 'q-feedback error';
    }
  });
}

function handleTimeout(q) {
  const feedback = root.querySelector('#q-feedback');
  const body = root.querySelector('#q-body');

  if (q.type === 'type_make') {
    const input = body.querySelector('#make-input');
    if (input) input.disabled = true;
    const submitBtn = body.querySelector('#make-submit');
    if (submitBtn) submitBtn.disabled = true;
    recordAnswer(q, false, 0, { myText: input ? input.value.trim() : '' });
    feedback.textContent = `시간 종료! 예시: "${q.sample}"`;
  } else {
    const buttons = [...body.querySelectorAll('button')];
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (i === q.answer) b.classList.add('correct');
    });
    recordAnswer(q, false, 0, { chosenIndex: null });
    feedback.textContent = `시간 종료! ${q.explain}`;
  }
  feedback.className = 'q-feedback error';

  setTimeout(nextQuestion, 1300);
}

function recordAnswer(q, isCorrect, baseScore, extra) {
  if (isCorrect) {
    session.comboStreak += 1;
  } else {
    session.comboStreak = 0;
  }
  const multiplier = isCorrect ? comboMultiplier(session.comboStreak) : 1;
  const scoreAwarded = isCorrect ? Math.round(baseScore * multiplier) : 0;

  session.answers.push({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    sentence: q.type === 'type_make' ? `대상: ${q.target}` : q.sentence,
    explain: q.type === 'type_make' ? `예시: ${q.sample}` : q.explain,
    correct: isCorrect,
    scoreAwarded,
    ...extra
  });
}

function nextQuestion() {
  session.index += 1;
  if (session.index >= session.questions.length) {
    renderResult();
  } else {
    renderQuiz();
  }
}

/* ---------------- 결과 화면 ---------------- */

function renderResult() {
  clearTimer();
  const totalScore = session.answers.reduce((sum, a) => sum + a.scoreAwarded, 0);
  const correctCount = session.answers.filter((a) => a.correct).length;
  const total = session.answers.length;

  const byType = {};
  session.answers.forEach((a) => {
    (byType[a.type] ||= []).push(a);
  });

  const barsHtml = Object.keys(TYPE_LABELS).map((type) => {
    const list = byType[type] || [];
    const correct = list.filter((a) => a.correct).length;
    const pct = list.length ? Math.round((correct / list.length) * 100) : 0;
    return `
      <div class="type-bar-row">
        <div class="label"><span>${TYPE_LABELS[type]}</span><span>${correct}/${list.length}</span></div>
        <div class="type-bar-track"><div class="type-bar-fill" style="width:${pct}%"></div></div>
      </div>
    `;
  }).join('');

  const wrongItems = session.answers.filter((a) => !a.correct);
  const reviewHtml = wrongItems.length
    ? wrongItems.map((a) => `
        <div class="review-item">
          <div class="q-sentence">${a.sentence}</div>
          <div class="explain">${escapeHtml(a.explain)}</div>
        </div>
      `).join('')
    : '<p class="hint">틀린 문제가 없어! 완벽해.</p>';

  const makeAnswers = session.answers.filter((a) => a.type === 'type_make' && a.myText);
  const makeHtml = makeAnswers.length
    ? makeAnswers.map((a) => `<div class="make-line">"${escapeHtml(a.myText)}"</div>`).join('')
    : '<p class="hint">작성한 문장이 없어.</p>';

  root.innerHTML = `
    <h1 class="title practice-title">결과</h1>
    <div class="result-score">
      <div class="big">${totalScore}점</div>
      <div>${correctCount} / ${total} 문제 정답</div>
    </div>

    <div class="card" style="margin-bottom:14px;">
      <h3>유형별 정답률</h3>
      ${barsHtml}
    </div>

    <div class="card" style="margin-bottom:14px;">
      <h3>오답 다시 보기</h3>
      ${reviewHtml}
    </div>

    <div class="card" style="margin-bottom:14px;">
      <h3>내가 만든 표현 모아보기</h3>
      ${makeHtml}
    </div>

    <button class="btn" id="register-btn" style="width:100%;margin-bottom:10px;">랭킹에 등록하기</button>
    <button class="btn btn-ghost" id="retry-btn" style="width:100%;margin-bottom:10px;">다시 도전</button>
    <a class="btn btn-ghost" style="display:block;text-align:center;" href="index.html">메인으로</a>
  `;

  root.querySelector('#register-btn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const { error } = await saveRanking({
      nickname: identity.nickname,
      school_code: identity.schoolCode,
      score: totalScore,
      correct_count: correctCount,
      total_count: total
    });
    if (error) {
      showToast('랭킹 등록에 실패했어. 결과는 유지돼.', 'error');
      e.target.disabled = false;
    } else {
      showToast('랭킹에 등록했어!', 'success');
      renderRanking('school');
    }
  });

  root.querySelector('#retry-btn').addEventListener('click', () => {
    session = { questions: pickQuestions(), index: 0, comboStreak: 0, answers: [] };
    renderQuiz();
  });
}

/* ---------------- 랭킹 화면 ---------------- */

async function renderRanking(scope) {
  root.innerHTML = `
    <h1 class="title practice-title">🏆 랭킹</h1>
    <div class="rank-tabs">
      <button id="tab-school" class="${scope === 'school' ? 'active' : ''}">우리 학교</button>
      <button id="tab-all" class="${scope === 'all' ? 'active' : ''}">전체</button>
    </div>
    <div id="rank-list"><p class="hint">불러오는 중...</p></div>
    <button class="btn btn-ghost" id="retry-btn2" style="width:100%;margin-top:14px;margin-bottom:10px;">다시 도전</button>
    <a class="btn btn-ghost" style="display:block;text-align:center;" href="index.html">메인으로</a>
  `;

  root.querySelector('#tab-school').addEventListener('click', () => renderRanking('school'));
  root.querySelector('#tab-all').addEventListener('click', () => renderRanking('all'));
  root.querySelector('#retry-btn2').addEventListener('click', () => {
    session = { questions: pickQuestions(), index: 0, comboStreak: 0, answers: [] };
    renderQuiz();
  });

  const school_code = scope === 'school' ? identity.schoolCode : null;
  const { data, error } = await getRankings({ school_code, limit: 500 });
  const listEl = root.querySelector('#rank-list');

  if (error) {
    listEl.innerHTML = '<p class="hint">랭킹을 불러올 수 없어. 잠시 후 다시 시도해줘.</p>';
    return;
  }
  if (!data || data.length === 0) {
    listEl.innerHTML = '<p class="hint">아직 등록된 기록이 없어.</p>';
    return;
  }

  const myIndex = data.findIndex((r) => r.nickname === identity.nickname);
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const myScore = myIndex >= 0 ? data[myIndex].score : null;
  const top20 = data.slice(0, 20);

  const rowsHtml = top20.map((r, i) => `
    <div class="rank-row ${r.nickname === identity.nickname ? 'me' : ''}">
      <div class="rank-no">${i + 1}</div>
      <div class="rank-nick">${escapeHtml(r.nickname)}</div>
      <div class="rank-score">${r.score}점</div>
    </div>
  `).join('');

  const myRankNote = myRank && myRank > 20
    ? `<p class="hint" style="margin-top:8px;">내 순위: ${myRank}위 (${myScore}점)</p>`
    : '';

  listEl.innerHTML = rowsHtml + myRankNote;
}
