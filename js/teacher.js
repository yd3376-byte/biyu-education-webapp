// 「비유 표현 도전하기」 교사 검토 페이지.
// 학생 화면(js/practice.js)과 별개로, 학교 코드의 모든 시도 기록을 모아 보여준다.
// 접근 제한은 이 학급 도구의 위협 모델에 맞춘 간단한 클라이언트 암호 확인이다
// (RLS는 다른 화면들과 마찬가지로 읽기 공개 정책이라 실제 비밀은 아니다).

import { loadJson, escapeHtml, validateSchoolCode, getSchoolCode } from './common.js';
import { getTeacherPracticeSessions } from './db.js';

const AUTH_KEY = 'ba_teacher_auth';
const TEACHER_PASSWORD = '고양이선생님2024';

const METRICS = [
  ['fit', '🎯 적합성'],
  ['expression', '🎨 표현력'],
  ['creativity', '💡 창의성'],
  ['wit', '⚡ 기발함'],
  ['vivid', '✨ 생생함']
];

const root = document.getElementById('teacher-root');
let sentences = [];
let sentenceById = new Map();

async function loadSentences() {
  if (sentences.length) return;
  try {
    sentences = await loadJson('data/sentences.json');
    sentenceById = new Map(sentences.map((s) => [s.id, s]));
  } catch {
    sentences = [];
  }
}

function starsSummary(stars) {
  return METRICS.map(([key, label]) => `${label.slice(0, 2)}${stars?.[key] || 0}`).join(' ');
}

/* ---------------- 암호 화면 ---------------- */

function renderAuthGate() {
  root.innerHTML = `
    <div class="card" style="max-width:360px; margin:40px auto;">
      <h2 class="title" style="margin-bottom:4px;">🔒 교사 확인</h2>
      <p class="field-hint" style="color:var(--cat); margin-bottom:14px;">학생 화면과는 별개의 페이지예요. 암호를 입력해주세요.</p>
      <div class="field">
        <input id="pw-input" type="password" placeholder="암호" />
        <div class="error" id="pw-err"></div>
      </div>
      <button class="btn" id="pw-submit" style="width:100%;">확인</button>
    </div>
  `;
  const input = root.querySelector('#pw-input');
  const err = root.querySelector('#pw-err');
  const submit = () => {
    if (input.value === TEACHER_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, '1');
      renderSchoolInput();
    } else {
      err.textContent = '암호가 맞지 않아.';
    }
  };
  root.querySelector('#pw-submit').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  input.focus();
}

/* ---------------- 학교 코드 입력 ---------------- */

function renderSchoolInput() {
  root.innerHTML = `
    <div class="card" style="max-width:420px; margin:40px auto;">
      <h2 class="title" style="margin-bottom:4px;">📋 학생 기록 검토</h2>
      <p class="field-hint" style="color:var(--cat); margin-bottom:14px;">조회할 학교 코드를 입력해줘.</p>
      <div class="field">
        <input id="school-input" maxlength="8" placeholder="예: SUNNY01" value="${escapeHtml(getSchoolCode())}" />
        <div class="error" id="school-err"></div>
      </div>
      <button class="btn" id="school-submit" style="width:100%;">조회하기</button>
    </div>
  `;
  const input = root.querySelector('#school-input');
  const submit = () => {
    const result = validateSchoolCode(input.value);
    if (!result.ok) {
      root.querySelector('#school-err').textContent = result.message;
      return;
    }
    renderSessionList(input.value.trim().toUpperCase());
  };
  root.querySelector('#school-submit').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  input.focus();
}

/* ---------------- 기록 목록 (닉네임별로 묶어서) ---------------- */

async function renderSessionList(schoolCode) {
  root.innerHTML = `<div class="card" style="text-align:center;">${escapeHtml(schoolCode)} 기록을 불러오는 중...</div>`;
  await loadSentences();
  const { data, error } = await getTeacherPracticeSessions(schoolCode);

  if (error) {
    root.innerHTML = `
      <div class="card" style="max-width:480px; margin:40px auto; text-align:center;">
        <p>불러오는 데 실패했어.</p>
        <button class="btn btn-ghost" id="retry-btn">다시 시도</button>
      </div>
    `;
    root.querySelector('#retry-btn').addEventListener('click', () => renderSessionList(schoolCode));
    return;
  }

  const sessions = data || [];
  if (!sessions.length) {
    root.innerHTML = `
      <div class="card" style="max-width:480px; margin:40px auto; text-align:center;">
        <p>"${escapeHtml(schoolCode)}" 학교 코드로 저장된 기록이 아직 없어.</p>
        <button class="btn btn-ghost" id="back-btn">다른 학교 코드 조회</button>
      </div>
    `;
    root.querySelector('#back-btn').addEventListener('click', renderSchoolInput);
    return;
  }

  const byNick = new Map();
  sessions.forEach((s) => {
    if (!byNick.has(s.nickname)) byNick.set(s.nickname, []);
    byNick.get(s.nickname).push(s);
  });
  const nicknames = [...byNick.keys()].sort((a, b) => a.localeCompare(b, 'ko'));

  const summaryHtml = `
    <div class="card" style="margin-bottom:14px;">
      <p>"${escapeHtml(schoolCode)}" — 학생 ${nicknames.length}명, 총 ${sessions.length}회 시도</p>
    </div>
  `;

  const studentsHtml = nicknames.map((nick) => {
    const nickSessions = byNick.get(nick).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const best = Math.max(...nickSessions.map((s) => s.total_score));
    return `
      <div class="card teacher-student-card">
        <button class="teacher-student-header" data-nick="${escapeHtml(nick)}">
          <span class="teacher-student-name">${escapeHtml(nick)}</span>
          <span class="teacher-student-meta">${nickSessions.length}회 · 최고 ${best}점</span>
          <span class="teacher-toggle-arrow">▾</span>
        </button>
        <div class="teacher-sessions" id="sessions-${cssId(nick)}" hidden>
          ${nickSessions.map((s) => sessionHtml(s)).join('')}
        </div>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    ${summaryHtml}
    ${studentsHtml}
    <button class="btn btn-ghost" id="back-btn" style="display:block; margin:16px auto 0;">다른 학교 코드 조회</button>
  `;

  root.querySelector('#back-btn').addEventListener('click', renderSchoolInput);
  root.querySelectorAll('.teacher-student-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = root.querySelector(`#sessions-${cssId(btn.dataset.nick)}`);
      panel.hidden = !panel.hidden;
      btn.classList.toggle('open', !panel.hidden);
    });
  });
}

function cssId(nick) {
  return encodeURIComponent(nick).replace(/[^a-zA-Z0-9]/g, '');
}

function sessionHtml(session) {
  const date = new Date(session.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const answers = (session.practice_answers || []).slice()
    .sort((a, b) => String(a.question_id).localeCompare(String(b.question_id)));
  const rankBadge = session.public_ranking ? '<span class="teacher-rank-badge">🏆 랭킹 등록</span>' : '';
  const answersHtml = answers.map((a) => {
    const q = sentenceById.get(a.question_id);
    return `
      <div class="teacher-answer-card">
        ${q ? `<div class="teacher-answer-source">원문: ${escapeHtml(q.source)}</div>` : ''}
        <div class="teacher-answer-text">${escapeHtml(a.answer)}</div>
        <div class="teacher-answer-stars">${starsSummary(a.stars)} · ${a.score} / 25</div>
      </div>
    `;
  }).join('');

  return `
    <div class="teacher-session-block">
      <div class="teacher-session-head">
        <span>${date} · ${session.mode}문제 모드 · 총점 ${session.total_score} / ${session.max_score}</span>
        ${rankBadge}
      </div>
      <div class="teacher-answers-grid">${answersHtml}</div>
    </div>
  `;
}

(function init() {
  if (sessionStorage.getItem(AUTH_KEY) === '1') {
    renderSchoolInput();
  } else {
    renderAuthGate();
  }
})();
