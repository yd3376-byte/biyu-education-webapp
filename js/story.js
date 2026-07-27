import { checkMetaphor } from './metaphor.js';
import { ensureIdentity, mountNickHeader, typeText, showToast, loadPlaceBg, loadJson, escapeHtml } from './common.js';
import { saveCatName } from './db.js';

const PROGRESS_KEY = 'ba_story_progress';
const CLOCK_TIMES = ['오전 8:20', '오전 8:40', '오전 9:05', '오전 9:30', '오전 10:00', '오전 10:20'];

let storyData = null;
let places = null;
let identity = null;

const progress = loadProgress();

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore malformed progress and start over
  }
  return { phase: 'opening', roundIndex: 0, notebook: [], exprFailCount: 0, catName: null };
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

const root = document.getElementById('story-root');
const clockEl = document.getElementById('story-clock');
const cicadaEl = document.getElementById('cicada');
const notebookCountEl = document.getElementById('notebook-count');
const notebookPanel = document.getElementById('notebook-panel');
const notebookList = document.getElementById('notebook-list');

document.getElementById('notebook-open').addEventListener('click', openNotebook);
document.getElementById('notebook-close').addEventListener('click', closeNotebook);

async function init() {
  identity = await ensureIdentity();
  mountNickHeader(document.getElementById('nick-header'));

  [storyData, places] = await Promise.all([
    loadJson('data/story.json'),
    loadJson('data/places.json')
  ]);

  updateClock();
  updateNotebookBadge();
  render();
}
init();

function placeById(id) {
  return places.find((p) => p.id === id);
}
function placeName(id) {
  return placeById(id)?.name || id;
}

function updateClock() {
  const idx = Math.min(progress.roundIndex, CLOCK_TIMES.length - 1);
  clockEl.textContent = CLOCK_TIMES[idx];
}
function updateNotebookBadge() {
  notebookCountEl.textContent = progress.notebook.length;
}

function openNotebook() {
  notebookList.innerHTML = '';
  if (progress.notebook.length === 0) {
    notebookList.innerHTML = '<p>아직 찾은 흔적이 없어.</p>';
  }
  progress.notebook.forEach((entry) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="trace-title">${escapeHtml(entry.title)}</div>
      <div class="trace-text">${escapeHtml(entry.text)}</div>
      <div style="margin-top:6px;font-size:.85rem;color:var(--cat);">${escapeHtml(placeName(entry.place))}에서 발견</div>
      ${entry.myLine ? `<div class="my-line">내가 만든 말: "${escapeHtml(entry.myLine)}"</div>` : ''}
    `;
    notebookList.appendChild(card);
  });
  notebookPanel.hidden = false;
}
function closeNotebook() {
  notebookPanel.hidden = true;
}

function waitForClick(el) {
  return new Promise((resolve) => {
    function handler() {
      el.removeEventListener('click', handler);
      resolve();
    }
    el.addEventListener('click', handler);
  });
}

/* ---------------- 렌더 디스패처 ---------------- */

function render() {
  root.innerHTML = '';
  switch (progress.phase) {
    case 'opening': renderOpening(); break;
    case 'round': renderRound(); break;
    case 'trace': renderTrace(); break;
    case 'expression': renderExpression(); break;
    case 'ending': renderEnding(); break;
    case 'naming': renderNaming(); break;
    case 'done': renderDone(); break;
    default: renderOpening();
  }
}

/* ---------------- 여는 장면 ---------------- */

function renderOpening() {
  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  stage.appendChild(dialogue);
  root.appendChild(stage);

  cicadaEl.classList.remove('silent');
  playOpening(dialogue);
}

async function playOpening(dialogue) {
  const { lines, cicadaStopBeforeLine } = storyData.opening;
  for (let i = 0; i < lines.length; i += 1) {
    if (i >= cicadaStopBeforeLine) cicadaEl.classList.add('silent');
    await typeText(dialogue, lines[i]);
    await waitForClick(dialogue);
  }
  progress.phase = 'round';
  progress.roundIndex = 0;
  saveProgress();
  updateClock();
  render();
}

/* ---------------- 라운드: 장소 선택 ---------------- */

function renderRound() {
  const round = storyData.rounds[progress.roundIndex];
  const wrap = document.createElement('div');

  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  stage.appendChild(dialogue);
  wrap.appendChild(stage);

  const placesWrap = document.createElement('div');
  placesWrap.className = 'story-places';
  storyData.places.forEach((pid) => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = placeName(pid);
    btn.addEventListener('click', () => onPlaceChosen(pid, round, dialogue));
    placesWrap.appendChild(btn);
  });
  wrap.appendChild(placesWrap);

  root.appendChild(wrap);
  typeText(dialogue, `"${round.question}"`);
}

function onPlaceChosen(pid, round, dialogue) {
  if (pid === round.place) {
    progress.phase = 'trace';
    saveProgress();
    render();
    return;
  }
  const msg = storyData.wrongReactions[pid] || '여긴 아니다.';
  typeText(dialogue, `"${msg}"`);
}

/* ---------------- 흔적 발견 ---------------- */

function renderTrace() {
  const round = storyData.rounds[progress.roundIndex];
  const wrap = document.createElement('div');

  const bg = document.createElement('div');
  bg.className = 'story-scene-bg';
  loadPlaceBg(bg, placeById(round.place));
  wrap.appendChild(bg);

  const card = document.createElement('div');
  card.className = 'trace-card';
  card.innerHTML = `
    <div class="trace-title">${escapeHtml(round.trace.title)}</div>
    <div class="trace-text">${escapeHtml(round.trace.text)}</div>
  `;
  wrap.appendChild(card);

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.style.width = '100%';
  btn.textContent = round.requiresExpression ? '계속' : '다음';
  btn.addEventListener('click', () => {
    if (!progress.notebook.some((e) => e.roundId === round.id)) {
      progress.notebook.push({
        roundId: round.id,
        place: round.place,
        title: round.trace.title,
        text: round.trace.text,
        myLine: null
      });
      updateNotebookBadge();
    }

    if (round.requiresExpression) {
      progress.phase = 'expression';
      progress.exprFailCount = 0;
      saveProgress();
      render();
    } else {
      advanceRound();
    }
  });
  wrap.appendChild(btn);

  root.appendChild(wrap);
}

function advanceRound() {
  if (progress.roundIndex + 1 >= storyData.rounds.length) {
    progress.phase = 'ending';
  } else {
    progress.roundIndex += 1;
    progress.phase = 'round';
  }
  saveProgress();
  updateClock();
  render();
}

/* ---------------- 4·5라운드: 표현으로 설명하기 ---------------- */

function renderExpression() {
  const round = storyData.rounds[progress.roundIndex];
  const wrap = document.createElement('div');

  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  stage.appendChild(dialogue);
  wrap.appendChild(stage);
  typeText(dialogue, `"${round.expressionPrompt}"`);

  const box = document.createElement('div');
  box.className = 'expr-box card';
  box.innerHTML = `
    <p>${escapeHtml(round.expressionTarget)}을(를) 비유로 표현해보자.</p>
    <textarea id="expr-input" maxlength="80" placeholder="예: ~같이, ~처럼, 또는 '○○는 △△다'"></textarea>
    <div class="expr-feedback" id="expr-feedback"></div>
    <button class="btn" id="expr-submit" style="width:100%">말해주기</button>
    <div class="expr-example" id="expr-example" hidden></div>
  `;
  wrap.appendChild(box);
  root.appendChild(wrap);

  const input = box.querySelector('#expr-input');
  const feedback = box.querySelector('#expr-feedback');
  const exampleBox = box.querySelector('#expr-example');

  box.querySelector('#expr-submit').addEventListener('click', () => {
    const result = checkMetaphor(input.value);

    if (result.ok) {
      feedback.textContent = '좋아, 그 말로 기억할게.';
      feedback.className = 'expr-feedback success';
      const entry = progress.notebook.find((e) => e.roundId === round.id);
      if (entry) entry.myLine = input.value.trim();
      progress.exprFailCount = 0;
      saveProgress();
      setTimeout(() => advanceRound(), 700);
      return;
    }

    progress.exprFailCount = (progress.exprFailCount || 0) + 1;
    feedback.textContent = result.message;
    feedback.className = 'expr-feedback error';
    if (progress.exprFailCount >= 3) {
      exampleBox.hidden = false;
      exampleBox.textContent = `예시: "${round.exampleSentence}"`;
    }
    saveProgress();
  });
}

/* ---------------- 결말 ---------------- */

function renderEnding() {
  const wrap = document.createElement('div');
  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  stage.appendChild(dialogue);
  wrap.appendChild(stage);
  root.appendChild(wrap);

  playEnding(dialogue);
}

async function playEnding(dialogue) {
  for (const line of storyData.ending.lines) {
    await typeText(dialogue, line);
    await waitForClick(dialogue);
  }
  dialogue.textContent = '···';
  await new Promise((r) => setTimeout(r, 1200));
  await typeText(dialogue, storyData.ending.arrivalLine);
  await waitForClick(dialogue);

  progress.phase = 'naming';
  saveProgress();
  render();
}

/* ---------------- 이름 짓기 ---------------- */

function checkVehicle(text) {
  const result = checkMetaphor(text);
  if (result.ok || result.code === 'NO_FIGURE') {
    return { ok: true, message: '' };
  }
  return result;
}

function renderNaming() {
  const wrap = document.createElement('div');

  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  stage.appendChild(dialogue);
  wrap.appendChild(stage);
  typeText(dialogue, `"${storyData.naming.prompt}"`);

  const form = document.createElement('div');
  form.className = 'naming-form';
  form.innerHTML = `
    <div class="naming-sentence">
      ${escapeHtml(storyData.naming.templateBefore)}<input id="naming-vehicle" maxlength="60" placeholder="비유" />${escapeHtml(storyData.naming.templateMiddle)}<input id="naming-name" maxlength="8" placeholder="이름" />${escapeHtml(storyData.naming.templateAfter)}
    </div>
    <p class="hint">${escapeHtml(storyData.naming.example)}</p>
    <div class="expr-feedback" id="naming-feedback"></div>
    <button class="btn" id="naming-submit" style="width:100%">이름 지어주기</button>
  `;
  wrap.appendChild(form);
  root.appendChild(wrap);

  form.querySelector('#naming-submit').addEventListener('click', async () => {
    const vehicle = form.querySelector('#naming-vehicle').value.trim();
    const name = form.querySelector('#naming-name').value.trim();
    const feedback = form.querySelector('#naming-feedback');
    const submitBtn = form.querySelector('#naming-submit');

    const vResult = checkVehicle(vehicle);
    if (!vResult.ok) {
      feedback.textContent = vResult.message;
      feedback.className = 'expr-feedback error';
      return;
    }
    if (name.length < 1 || name.length > 8) {
      feedback.textContent = '이름은 1~8자로 지어줘.';
      feedback.className = 'expr-feedback error';
      return;
    }

    submitBtn.disabled = true;
    const { error } = await saveCatName({
      nickname: identity.nickname,
      school_code: identity.schoolCode,
      vehicle,
      name
    });

    if (error) {
      showToast('저장에 실패했어. 이야기는 계속 진행할게.', 'error');
    } else {
      showToast('이름을 지어줬어! 저장 완료.', 'success');
    }

    progress.catName = { vehicle, name };
    progress.phase = 'done';
    saveProgress();
    render();
  });
}

/* ---------------- 완료 화면 ---------------- */

function renderDone() {
  const wrap = document.createElement('div');
  const { vehicle, name } = progress.catName || {};
  wrap.innerHTML = `
    <div class="nametag-card">
      <div class="cat-vehicle">${escapeHtml(vehicle || '')} 같아서</div>
      <div class="cat-name">${escapeHtml(name || '')}</div>
      <div class="cat-vehicle">라고 부르기로 했다.</div>
    </div>
    <p style="text-align:center;margin-top:16px;">저장 완료! 우리 반 친구들이 지어준 이름도 구경해볼까?</p>
    <a class="btn" style="display:block;text-align:center;margin-top:8px;" href="names.html">우리 반이 지어준 이름들 보기</a>
    <a class="btn btn-ghost" style="display:block;text-align:center;margin-top:8px;" href="index.html">메인으로</a>
  `;
  root.appendChild(wrap);
}
