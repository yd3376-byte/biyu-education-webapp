import { checkMetaphor } from './metaphor.js';
import { ensureIdentity, mountNickHeader, typeText, showToast, loadJson, escapeHtml } from './common.js';
import { saveCatName } from './db.js';

const PROGRESS_KEY = 'ba_story_progress';
const CLOCK_TIMES = ['오전 8:20', '오전 8:40', '오전 9:05', '오전 9:30', '오전 10:00', '오전 10:20'];

let storyData = null;
let identity = null;

const progress = loadProgress();

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore malformed progress and start over
  }
  return {
    phase: 'intro',
    searchIndex: 0,
    codaIndex: 0,
    notebook: [],
    exprFailCount: 0,
    classroomSentence: null,
    catName: null,
    endingSentence: null,
    endingFailCount: 0
  };
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
const bgmDark = document.getElementById('bgm-dark');
const bgmReunion = document.getElementById('bgm-reunion');
bgmDark.loop = true;
bgmReunion.loop = true;
const sfxBell = document.getElementById('sfx-bell');
const bgmToggleBtn = document.getElementById('bgm-toggle');

const BGM_KEY = 'ba_bgm_muted';
const BGM_VOLUME = 0.35;
let bgmMuted = localStorage.getItem(BGM_KEY) === '1';
let activeTrack = 'dark'; // 'dark' | 'reunion'

document.getElementById('notebook-open').addEventListener('click', openNotebook);
document.getElementById('notebook-close').addEventListener('click', closeNotebook);
document.getElementById('story-reset-btn').addEventListener('click', () => {
  if (confirm('지금까지 진행 상황을 지우고 처음부터 다시 시작할까요?')) {
    localStorage.removeItem(PROGRESS_KEY);
    location.reload();
  }
});

updateBgmToggleUI();
bgmToggleBtn.addEventListener('click', () => {
  bgmMuted = !bgmMuted;
  localStorage.setItem(BGM_KEY, bgmMuted ? '1' : '0');
  updateBgmToggleUI();
  if (bgmMuted) {
    bgmDark.pause();
    bgmReunion.pause();
  } else if (activeTrack === 'reunion') {
    bgmReunion.volume = BGM_VOLUME;
    bgmReunion.play().catch(() => {});
  } else {
    tryPlayBgm();
  }
});

function updateBgmToggleUI() {
  bgmToggleBtn.textContent = bgmMuted ? '🔇' : '🔊';
}

function tryPlayBgm() {
  if (bgmMuted) return;
  bgmDark.volume = BGM_VOLUME;
  bgmDark.play().catch(() => {
    document.addEventListener('click', () => tryPlayBgm(), { once: true });
  });
}

// 자동재생 정책, 네트워크 버퍼링 등으로 재생 중 예기치 않게 멈추면 즉시 재시도한다.
bgmReunion.addEventListener('pause', () => {
  if (!bgmMuted && activeTrack === 'reunion' && !bgmReunion.ended) {
    bgmReunion.play().catch(() => {});
  }
});

function crossfadeToReunion() {
  activeTrack = 'reunion';
  fadeAudio(bgmDark, 0, 2000);
  if (bgmMuted) return;
  bgmReunion.volume = 0;
  bgmReunion.play().catch(() => {
    document.addEventListener('click', () => bgmReunion.play().catch(() => {}), { once: true });
  });
  fadeAudio(bgmReunion, BGM_VOLUME, 2000);
}

function playBellOnce() {
  if (bgmMuted) return;
  sfxBell.currentTime = 0;
  sfxBell.volume = 0.7;
  sfxBell.play().catch(() => {});
}

function fadeAudio(audio, toVolume, durationMs) {
  const steps = 20;
  const stepTime = durationMs / steps;
  const startVolume = audio.volume;
  const diff = toVolume - startVolume;
  let i = 0;
  const timer = setInterval(() => {
    i += 1;
    audio.volume = Math.min(1, Math.max(0, startVolume + diff * (i / steps)));
    if (i >= steps) {
      clearInterval(timer);
      if (toVolume <= 0) audio.pause();
    }
  }, stepTime);
}

async function init() {
  identity = await ensureIdentity();
  mountNickHeader(document.getElementById('nick-header'));

  storyData = await loadJson('data/story.json');

  const isReplay = new URLSearchParams(location.search).get('replay') === '1';
  if (isReplay) {
    startReplay();
    return;
  }

  updateClock();
  updateNotebookBadge();
  render();
}
init();

function updateClock() {
  const idx = Math.min(progress.searchIndex, CLOCK_TIMES.length - 1);
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

function makeStage() {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  stage.appendChild(dialogue);
  wrap.appendChild(stage);
  root.appendChild(wrap);
  return { wrap, dialogue };
}

async function playLines(dialogue, lines) {
  for (const line of lines) {
    await typeText(dialogue, line);
    await waitForClick(dialogue);
  }
}

/**
 * 이미지 + 대사 줄을 순서대로 보여주는 공통 장면 렌더러.
 * 검은/어두운 상태를 유지한 채 story-scene-bg에 이미지를 표시한다.
 */
function renderTraceScene(image, lines, onDone) {
  root.innerHTML = '';
  const wrap = document.createElement('div');

  const sceneImg = document.createElement('div');
  sceneImg.className = 'story-scene-bg place-bg';
  sceneImg.style.backgroundImage = `url("${image}")`;
  wrap.appendChild(sceneImg);

  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  stage.appendChild(dialogue);
  wrap.appendChild(stage);

  root.appendChild(wrap);

  playLines(dialogue, lines).then(() => {
    if (onDone) onDone();
  });
}

/* ---------------- 렌더 디스패처 ---------------- */

function render() {
  root.innerHTML = '';

  if (progress.phase === 'coda' || progress.phase === 'ending' || progress.phase === 'done') {
    // bgm-dark는 정문 크로스페이드 때 이미 페이드아웃되어 멈춰 있다.
    // bgm-reunion은 여기서 끊지 않고 엔딩까지 계속 이어서 재생한다.
    document.body.classList.add('story-bright');
  } else {
    tryPlayBgm();
  }

  switch (progress.phase) {
    case 'intro': renderIntro(); break;
    case 'opening': renderOpening(); break;
    case 'search': renderSearch(); break;
    case 'classroom': renderClassroom(); break;
    case 'gate': renderGate(); break;
    case 'coda': renderCoda(); break;
    case 'ending': renderEnding(); break;
    case 'done': renderDone(); break;
    default: renderIntro();
  }
}

/* ---------------- 인트로: "나는 '내일'이다" ---------------- */

function renderIntro() {
  const wrap = document.createElement('div');

  const sceneImg = document.createElement('div');
  sceneImg.className = 'story-scene-bg place-bg';
  sceneImg.style.backgroundImage = `url("${storyData.intro.image}")`;
  wrap.appendChild(sceneImg);

  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  stage.appendChild(dialogue);
  wrap.appendChild(stage);

  root.appendChild(wrap);
  playIntro(dialogue);
}

async function playIntro(dialogue) {
  await playLines(dialogue, storyData.intro.lines);
  progress.phase = 'opening';
  saveProgress();
  render();
}

/* ---------------- 여는 장면 ---------------- */

function renderOpening() {
  const wrap = document.createElement('div');

  const sceneImg = document.createElement('div');
  sceneImg.className = 'story-scene-bg place-bg';
  sceneImg.hidden = true;
  wrap.appendChild(sceneImg);

  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  stage.appendChild(dialogue);
  wrap.appendChild(stage);
  root.appendChild(wrap);

  cicadaEl.classList.remove('silent');
  playOpening(dialogue, sceneImg);
}

async function playOpening(dialogue, sceneImg) {
  const { lines, cicadaStopBeforeLine, image, finalImage, finalLines } = storyData.opening;

  for (let i = 0; i < lines.length; i += 1) {
    if (i === 0) {
      sceneImg.hidden = false;
      sceneImg.style.backgroundImage = `url("${image}")`;
      tryPlayBgm();
      playBellOnce();
    } else if (i === 1) {
      sceneImg.hidden = true;
    }
    if (i >= cicadaStopBeforeLine) cicadaEl.classList.add('silent');
    await typeText(dialogue, lines[i]);
    await waitForClick(dialogue);
  }

  sceneImg.hidden = false;
  sceneImg.style.backgroundImage = `url("${finalImage}")`;
  await playLines(dialogue, finalLines);

  progress.phase = 'search';
  progress.searchIndex = 0;
  saveProgress();
  updateClock();
  render();
}

/* ---------------- 지도에서 장소 찾기 ---------------- */

function renderMap(correctPlaceId, onCorrect) {
  root.innerHTML = '';
  const wrap = document.createElement('div');

  const mapWrap = document.createElement('div');
  mapWrap.className = 'map-wrap';
  const img = document.createElement('img');
  img.src = storyData.map.image;
  img.className = 'map-image';
  img.alt = '학교 지도';
  mapWrap.appendChild(img);

  const feedback = document.createElement('div');

  storyData.map.hotspots.forEach((h) => {
    const btn = document.createElement('button');
    btn.className = 'map-hotspot';
    btn.style.left = `${(h.x - h.w / 2) * 100}%`;
    btn.style.top = `${(h.y - h.h / 2) * 100}%`;
    btn.style.width = `${h.w * 100}%`;
    btn.style.height = `${h.h * 100}%`;
    btn.innerHTML = `<span>${escapeHtml(h.name)}</span>`;
    btn.addEventListener('click', () => {
      if (h.id === correctPlaceId) {
        onCorrect();
      } else {
        feedback.textContent = storyData.wrongMessage;
      }
    });
    mapWrap.appendChild(btn);
  });
  wrap.appendChild(mapWrap);

  feedback.className = 'map-feedback';
  wrap.appendChild(feedback);

  root.appendChild(wrap);
}

function renderSearch() {
  const round = storyData.searchRounds[progress.searchIndex];
  const { dialogue } = makeStage();
  playSearchIntro(dialogue, round);
}

async function playSearchIntro(dialogue, round) {
  await playLines(dialogue, round.intro);
  renderMap(round.correctPlace, () => onSearchCorrect(round));
}

function onSearchCorrect(round) {
  renderTraceScene(round.traceImage, round.traceLines, () => {
    if (!progress.notebook.some((e) => e.roundId === round.id)) {
      const place = storyData.map.hotspots.find((h) => h.id === round.correctPlace);
      progress.notebook.push({
        roundId: round.id,
        title: `${place ? place.name : round.correctPlace}에서 찾은 흔적`,
        text: round.traceLines.join(' ')
      });
      updateNotebookBadge();
    }
    advanceSearch();
  });
}

function advanceSearch() {
  if (progress.searchIndex + 1 >= storyData.searchRounds.length) {
    progress.phase = 'classroom';
  } else {
    progress.searchIndex += 1;
  }
  saveProgress();
  updateClock();
  render();
}

/* ---------------- 교실: 비유 표현 + 가방 찾기 ---------------- */

function renderClassroom() {
  const { dialogue } = makeStage();
  playClassroomTransition(dialogue);
}

async function playClassroomTransition(dialogue) {
  await typeText(dialogue, storyData.classroomScene.transitionLine);
  await waitForClick(dialogue);
  renderClassroomExpr();
}

function renderClassroomExpr() {
  const scene = storyData.classroomScene;
  root.innerHTML = '';
  const wrap = document.createElement('div');

  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  dialogue.textContent = `"${scene.prompt}"`;
  stage.appendChild(dialogue);
  wrap.appendChild(stage);

  const box = document.createElement('div');
  box.className = 'expr-box card';
  box.innerHTML = `
    <p>${escapeHtml(scene.target)}을(를) 비유로 표현해보자.</p>
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
      progress.classroomSentence = input.value.trim();
      progress.exprFailCount = 0;
      saveProgress();
      afterClassroomExpr(progress.classroomSentence);
      return;
    }

    progress.exprFailCount = (progress.exprFailCount || 0) + 1;
    feedback.textContent = result.message;
    feedback.className = 'expr-feedback error';
    if (progress.exprFailCount >= 3) {
      exampleBox.hidden = false;
      exampleBox.textContent = `예시: "${scene.exampleSentence}"`;
    }
    saveProgress();
  });
}

async function afterClassroomExpr(sentence) {
  const scene = storyData.classroomScene;
  const { dialogue } = makeStage();
  const line = scene.afterTransitionTemplate.replace('{sentence}', sentence);
  await typeText(dialogue, line);
  await waitForClick(dialogue);
  renderClassroomBagHotspot();
}

function renderClassroomBagHotspot() {
  const scene = storyData.classroomScene;
  root.innerHTML = '';
  const wrap = document.createElement('div');

  const sceneImg = document.createElement('div');
  sceneImg.className = 'story-scene-bg place-bg';
  sceneImg.style.backgroundImage = `url("${scene.afterImage}")`;
  wrap.appendChild(sceneImg);

  const hotspot = document.createElement('button');
  hotspot.className = 'map-hotspot bag-hotspot';
  const h = scene.bagHotspot;
  hotspot.style.left = `${(h.x - h.w / 2) * 100}%`;
  hotspot.style.top = `${(h.y - h.h / 2) * 100}%`;
  hotspot.style.width = `${h.w * 100}%`;
  hotspot.style.height = `${h.h * 100}%`;
  hotspot.innerHTML = '<span>🎒</span>';
  sceneImg.appendChild(hotspot);

  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  stage.appendChild(dialogue);
  wrap.appendChild(stage);
  root.appendChild(wrap);

  typeText(dialogue, scene.afterLines[0]);

  hotspot.addEventListener('click', () => {
    renderTraceScene(scene.bagImage, scene.bagLines, () => {
      progress.phase = 'gate';
      saveProgress();
      render();
    });
  }, { once: true });
}

/* ---------------- 정문: 아이와의 재회 + 이름 짓기 ---------------- */

function renderGate() {
  renderMap('gate', onGateCorrect);
}

function onGateCorrect() {
  const scene = storyData.gateScene;

  try {
    crossfadeToReunion();
  } catch {
    // 배경음악 전환에 문제가 있어도 이야기는 계속 진행한다.
  }

  renderTraceScene(scene.arriveImage, scene.arriveLines, () => {
    try {
      document.body.classList.add('story-bright');
    } catch {
      // 화면 전환에 문제가 있어도 이야기는 계속 진행한다.
    }

    renderTraceScene(scene.runImage, scene.runLines, () => {
      renderTraceScene(scene.hugImage, scene.hugLines, () => {
        renderNamingStep();
      });
    });
  });
}

function renderNamingStep() {
  const scene = storyData.gateScene;
  root.innerHTML = '';
  const wrap = document.createElement('div');

  const sceneImg = document.createElement('div');
  sceneImg.className = 'story-scene-bg place-bg';
  sceneImg.style.backgroundImage = `url("${scene.namingImage}")`;
  wrap.appendChild(sceneImg);

  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  dialogue.textContent = `"${scene.namingPrompt}"`;
  stage.appendChild(dialogue);
  wrap.appendChild(stage);

  const form = document.createElement('div');
  form.className = 'naming-form';
  form.innerHTML = `
    <div class="field">
      <input id="cat-name-input" maxlength="8" placeholder="이름 (1~8자)" />
    </div>
    <div class="expr-feedback" id="naming-feedback"></div>
    <button class="btn" id="naming-submit" style="width:100%">이름 지어주기</button>
  `;
  wrap.appendChild(form);
  root.appendChild(wrap);

  form.querySelector('#naming-submit').addEventListener('click', async () => {
    const name = form.querySelector('#cat-name-input').value.trim();
    const feedback = form.querySelector('#naming-feedback');

    if (name.length < 1 || name.length > 8) {
      feedback.textContent = '이름은 1~8자로 지어줘.';
      feedback.className = 'expr-feedback error';
      return;
    }

    const submitBtn = form.querySelector('#naming-submit');
    submitBtn.disabled = true;

    const vehicle = (progress.classroomSentence || scene.namingPrompt).slice(0, 60);
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
    saveProgress();

    const afterLine = scene.afterNamingTemplate.replace('{name}', name);
    await afterNaming(afterLine);
  });
}

async function afterNaming(afterLine) {
  const { dialogue } = makeStage();
  await typeText(dialogue, afterLine);
  await waitForClick(dialogue);

  progress.phase = 'coda';
  progress.codaIndex = 0;
  saveProgress();
  render();
}

/* ---------------- 코다: 새로운 일상 ---------------- */

function renderCoda() {
  const scene = storyData.coda[progress.codaIndex];
  root.innerHTML = '';
  const wrap = document.createElement('div');

  const sceneImg = document.createElement('div');
  sceneImg.className = 'story-scene-bg place-bg';
  sceneImg.style.backgroundImage = `url("${scene.image}")`;
  wrap.appendChild(sceneImg);

  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  stage.appendChild(dialogue);
  wrap.appendChild(stage);
  root.appendChild(wrap);

  playCoda(dialogue, scene.lines);
}

async function playCoda(dialogue, lines) {
  await playLines(dialogue, lines);

  if (progress.codaIndex + 1 >= storyData.coda.length) {
    progress.phase = 'ending';
  } else {
    progress.codaIndex += 1;
  }
  saveProgress();
  render();
}

/* ---------------- 마지막 문제: 고양이의 기분을 비유로 표현하기 ---------------- */

function renderEnding() {
  const { dialogue } = makeStage();
  playEndingTransition(dialogue);
}

async function playEndingTransition(dialogue) {
  await typeText(dialogue, storyData.endingScene.transitionLine);
  await waitForClick(dialogue);
  renderEndingExpr();
}

function renderEndingExpr() {
  const scene = storyData.endingScene;
  root.innerHTML = '';
  const wrap = document.createElement('div');

  const sceneImg = document.createElement('div');
  sceneImg.className = 'story-scene-bg place-bg';
  sceneImg.style.backgroundImage = `url("${scene.image}")`;
  wrap.appendChild(sceneImg);

  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const dialogue = document.createElement('div');
  dialogue.className = 'story-dialogue';
  dialogue.textContent = `"${scene.prompt}"`;
  stage.appendChild(dialogue);
  wrap.appendChild(stage);

  const box = document.createElement('div');
  box.className = 'expr-box card';
  box.innerHTML = `
    <p>${escapeHtml(scene.target)}을(를) 비유로 표현해보자.</p>
    <textarea id="ending-expr-input" maxlength="80" placeholder="예: ~같이, ~처럼, 또는 '○○는 △△다'"></textarea>
    <div class="expr-feedback" id="ending-expr-feedback"></div>
    <button class="btn" id="ending-expr-submit" style="width:100%">말해주기</button>
    <div class="expr-example" id="ending-expr-example" hidden></div>
  `;
  wrap.appendChild(box);
  root.appendChild(wrap);

  const input = box.querySelector('#ending-expr-input');
  const feedback = box.querySelector('#ending-expr-feedback');
  const exampleBox = box.querySelector('#ending-expr-example');

  box.querySelector('#ending-expr-submit').addEventListener('click', () => {
    const result = checkMetaphor(input.value);

    if (result.ok) {
      progress.endingSentence = input.value.trim();
      progress.endingFailCount = 0;
      progress.phase = 'done';
      saveProgress();
      render();
      return;
    }

    progress.endingFailCount = (progress.endingFailCount || 0) + 1;
    feedback.textContent = result.message;
    feedback.className = 'expr-feedback error';
    if (progress.endingFailCount >= 3) {
      exampleBox.hidden = false;
      exampleBox.textContent = `예시: "${scene.exampleSentence}"`;
    }
    saveProgress();
  });
}

/* ---------------- 완료 화면 ---------------- */

function renderDone() {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  const { vehicle, name } = progress.catName || {};
  wrap.innerHTML = `
    <div class="nametag-card">
      <div class="cat-name">${escapeHtml(name || '')}</div>
      <div class="cat-vehicle">시현이가 지어준 이름이다.</div>
    </div>
    ${vehicle ? `<p class="hint" style="text-align:center;margin-top:10px;">교실에서 내가 남긴 말: "${escapeHtml(vehicle)}"</p>` : ''}
    ${progress.endingSentence ? `<p class="hint" style="text-align:center;margin-top:6px;">지금 내 기분: "${escapeHtml(progress.endingSentence)}"</p>` : ''}
    <p style="text-align:center;margin-top:16px;">저장 완료! 우리 반 친구들이 지어준 이름도 구경해볼까?</p>
    <a class="btn" style="display:block;text-align:center;margin-top:8px;" href="names.html">우리 반이 지어준 이름들 보기</a>
    <a class="btn btn-ghost" style="display:block;text-align:center;margin-top:8px;" href="story.html?replay=1">이야기 처음부터 다시보기</a>
    <a class="btn btn-ghost" style="display:block;text-align:center;margin-top:8px;" href="index.html">메인으로</a>
  `;
  root.appendChild(wrap);
}

/* ---------------- 다시보기 모드 (완료 후 전체 이야기 훑어보기) ---------------- */

function replayImage(image, lines) {
  return new Promise((resolve) => {
    if (image) {
      renderTraceScene(image, lines, resolve);
    } else {
      const { dialogue } = makeStage();
      playLines(dialogue, lines).then(resolve);
    }
  });
}

async function replayOpening() {
  const { lines, cicadaStopBeforeLine, image, finalImage, finalLines } = storyData.opening;
  const { wrap, dialogue } = makeStage();

  const sceneImg = document.createElement('div');
  sceneImg.className = 'story-scene-bg place-bg';
  sceneImg.hidden = true;
  wrap.insertBefore(sceneImg, wrap.firstChild);

  cicadaEl.classList.remove('silent');
  tryPlayBgm();

  for (let i = 0; i < lines.length; i += 1) {
    if (i === 0) {
      sceneImg.hidden = false;
      sceneImg.style.backgroundImage = `url("${image}")`;
    } else if (i === 1) {
      sceneImg.hidden = true;
    }
    if (i >= cicadaStopBeforeLine) cicadaEl.classList.add('silent');
    await typeText(dialogue, lines[i]);
    await waitForClick(dialogue);
  }

  sceneImg.hidden = false;
  sceneImg.style.backgroundImage = `url("${finalImage}")`;
  await playLines(dialogue, finalLines);
}

async function startReplay() {
  document.getElementById('story-reset-btn').hidden = true;
  document.getElementById('notebook-open').hidden = true;

  await replayImage(storyData.intro.image, storyData.intro.lines);
  await replayOpening();

  for (const round of storyData.searchRounds) {
    await replayImage(null, round.intro);
    await replayImage(round.traceImage, round.traceLines);
  }

  const classroomScene = storyData.classroomScene;
  await replayImage(null, [classroomScene.transitionLine]);
  const sentence = progress.classroomSentence || classroomScene.exampleSentence;
  await replayImage(null, [`"${classroomScene.prompt}"`, `→ "${sentence}"`]);
  const afterLine = classroomScene.afterTransitionTemplate.replace('{sentence}', sentence);
  await replayImage(classroomScene.afterImage, [afterLine, ...classroomScene.afterLines]);
  await replayImage(classroomScene.bagImage, classroomScene.bagLines);

  const gateScene = storyData.gateScene;
  await replayImage(gateScene.arriveImage, gateScene.arriveLines);
  crossfadeToReunion();
  document.body.classList.add('story-bright');
  await replayImage(gateScene.runImage, gateScene.runLines);
  await replayImage(gateScene.hugImage, gateScene.hugLines);
  const name = (progress.catName && progress.catName.name) || '?';
  await replayImage(gateScene.namingImage, [gateScene.namingPrompt, `→ "${name}"`]);
  const afterNamingLine = gateScene.afterNamingTemplate.replace('{name}', name);
  await replayImage(null, [afterNamingLine]);

  for (const scene of storyData.coda) {
    await replayImage(scene.image, scene.lines);
  }

  const endingScene = storyData.endingScene;
  const endingSentence = progress.endingSentence || endingScene.exampleSentence;
  await replayImage(null, [endingScene.transitionLine]);
  await replayImage(endingScene.image, [`"${endingScene.prompt}"`, `→ "${endingSentence}"`]);

  renderDone();
}
