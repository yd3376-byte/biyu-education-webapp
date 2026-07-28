// 사료 숨기기(문제내기). js/db.js/Supabase는 전혀 참조하지 않는다 (MVP).

import { ensureIdentity, loadJson, showToast, escapeHtml } from './common.js';
import { toRatio, validateClue, encodeTrail } from './hide-core.js';

const DRAFT_KEY = 'draftTrail';
const MY_TRAILS_KEY = 'myTrails';

let placesIndex = null;

async function loadPlacesIndex() {
  if (!placesIndex) placesIndex = await loadJson('data/places/index.json');
  return placesIndex;
}

async function loadZones(placeId) {
  try {
    return await loadJson(`data/places/${placeId}.json`);
  } catch {
    return [];
  }
}

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveDraft(draft) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}
function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
}

function randomTrailId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function placeById(places, id) {
  return places.find((p) => p.id === id) || { id, name: id, image: '', aspect: 1.5, miss: '' };
}

function renderStageImage(stage, place) {
  stage.innerHTML = '';
  if (!place.image) {
    const ph = document.createElement('div');
    ph.className = 'stage-placeholder';
    ph.textContent = place.name;
    stage.appendChild(ph);
    return;
  }
  const img = document.createElement('img');
  img.src = place.image;
  img.alt = place.name;
  img.draggable = false;
  img.onerror = () => {
    stage.innerHTML = '';
    const ph = document.createElement('div');
    ph.className = 'stage-placeholder';
    ph.textContent = place.name;
    stage.appendChild(ph);
  };
  stage.appendChild(img);
}

/* ---------------- 진입 / 이어하기 ---------------- */

export async function initCreate(root, opts = {}) {
  const identity = opts.identity || await ensureIdentity();
  const onExit = opts.onExit || (() => {});
  const places = await loadPlacesIndex();

  const draft = loadDraft();
  if (draft && draft.route && draft.route.length) {
    renderResumeOffer(root, places, identity, onExit, draft);
  } else {
    renderModeSelect(root, places, identity, onExit);
  }
}

function renderResumeOffer(root, places, identity, onExit, draft) {
  root.innerHTML = `
    <div class="card" style="text-align:center;">
      <p>만들던 사료 길이 있어. (${draft.stops.length}/${draft.route.length}곳 완료)</p>
      <div class="row-btns" style="display:flex; gap:10px; justify-content:center; margin-top:10px;">
        <button class="btn" id="resume-btn">이어서 만들기</button>
        <button class="btn btn-ghost" id="restart-btn">처음부터</button>
      </div>
    </div>
  `;
  root.querySelector('#resume-btn').addEventListener('click', () => {
    continueBuilding(root, places, identity, onExit, draft);
  });
  root.querySelector('#restart-btn').addEventListener('click', () => {
    clearDraft();
    renderModeSelect(root, places, identity, onExit);
  });
}

/* ---------------- 길이 선택 ---------------- */

function renderModeSelect(root, places, identity, onExit) {
  root.innerHTML = `
    <div class="card">
      <p>방학이 시작됐어. 학교 고양이가 굶지 않게 사료를 나눠 숨기고, 어디 있는지 쪽지에 남겨 줘.<br>단, 다른 사람이 함부로 가져가지 못하게 빗대어 써야 해.</p>
      <div class="field-label" style="font-family:var(--font-title); margin:14px 0 8px;">몇 곳을 이을까?</div>
      <div class="row-btns" id="mode-btns" style="display:flex; gap:10px;">
        <button class="btn btn-ghost" data-count="2">짧게 (2곳)</button>
        <button class="btn" data-count="3">기본 (3곳)</button>
        <button class="btn btn-ghost" data-count="5">길게 (5곳)</button>
      </div>
    </div>
  `;
  root.querySelectorAll('#mode-btns button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const count = Number(btn.dataset.count);
      const draft = { route: [], routeCount: count, stops: [] };
      saveDraft(draft);
      renderRoutePicker(root, places, identity, onExit, draft);
    });
  });
}

/* ---------------- 길 짜기 (장소 순서 선택) ---------------- */

function renderRoutePicker(root, places, identity, onExit, draft) {
  root.innerHTML = `
    <div class="card">
      <p>사료를 숨길 장소를 순서대로 ${draft.routeCount}곳 골라줘.</p>
      <div class="route-summary" id="route-summary"></div>
    </div>
    <div class="place-grid" id="route-grid"></div>
  `;
  const grid = root.querySelector('#route-grid');
  const summary = root.querySelector('#route-summary');

  function renderSummary() {
    summary.innerHTML = draft.route
      .map((id, i) => `<span class="step">${i + 1}. ${escapeHtml(placeById(places, id).name)}</span>`)
      .join(' → ');
  }
  renderSummary();

  places.forEach((place) => {
    const btn = document.createElement('button');
    btn.className = 'card place-pick';
    if (place.image) btn.style.backgroundImage = `url("${place.image}")`;
    btn.innerHTML = `<span class="place-pick-name">${escapeHtml(place.name)}</span>`;
    grid.appendChild(btn);

    btn.addEventListener('click', () => {
      if (draft.route.includes(place.id)) return;
      draft.route.push(place.id);
      const order = document.createElement('div');
      order.className = 'place-pick-order';
      order.textContent = String(draft.route.length);
      btn.appendChild(order);
      btn.classList.add('selected');
      saveDraft(draft);
      renderSummary();

      if (draft.route.length >= draft.routeCount) {
        setTimeout(() => continueBuilding(root, places, identity, onExit, draft), 400);
      }
    });
  });
}

/* ---------------- 방마다: 존 고르기 + 단서 쓰기 ---------------- */

async function continueBuilding(root, places, identity, onExit, draft) {
  const stopIdx = draft.stops.length;
  if (stopIdx >= draft.route.length) {
    renderTitleStep(root, identity, onExit, draft);
    return;
  }
  const placeId = draft.route[stopIdx];
  const place = placeById(places, placeId);
  const zones = await loadZones(placeId);
  const isLast = stopIdx === draft.route.length - 1;

  root.innerHTML = `
    <div class="card">
      <p>${stopIdx + 1} / ${draft.route.length}번째 방: <strong>${escapeHtml(place.name)}</strong></p>
      <p class="hide-sub" style="margin:4px 0 0;">사료를 숨길 곳을 눌러줘.</p>
    </div>
    <div class="stage-wrap">
      <div class="stage" id="create-stage" style="aspect-ratio:${place.aspect || 1.5};"></div>
    </div>
    <button class="btn btn-ghost" id="exit-btn" style="display:block; margin:14px auto 0;">그만두기</button>
  `;
  root.querySelector('#exit-btn').addEventListener('click', onExit);

  const stage = root.querySelector('#create-stage');
  renderStageImage(stage, place);

  zones.forEach((zone) => {
    const el = document.createElement('div');
    el.className = 'zone';
    el.dataset.zoneId = zone.id;
    el.style.left = `${zone.x * 100}%`;
    el.style.top = `${zone.y * 100}%`;
    el.style.width = `${zone.w * 100}%`;
    el.style.height = `${zone.h * 100}%`;
    el.addEventListener('click', () => {
      renderClueForm(root, places, identity, onExit, draft, placeId, place, zone, isLast);
    });
    stage.appendChild(el);
  });
}

function renderClueForm(root, places, identity, onExit, draft, placeId, place, zone, isLast) {
  let objectClue = '';

  function wireSubmit(handler) {
    root.querySelector('#clue-submit').addEventListener('click', handler);
  }
  function showFeedback(msg) {
    const el = root.querySelector('#clue-feedback');
    el.textContent = msg;
    el.className = 'clue-feedback';
  }

  function renderObjectPhase() {
    root.innerHTML = `
      <div class="card">
        <p><strong>${escapeHtml(zone.name)}</strong>에 사료를 숨겼어. 이 물건을 비유로 설명해줘.</p>
        <div class="clue-input-box">
          <textarea id="clue-input" maxlength="80" placeholder="예: 하루 종일 아이들의 팔꿈치를 받아주는 네모난 섬"></textarea>
        </div>
        <div class="clue-feedback" id="clue-feedback"></div>
        <button class="btn" id="clue-submit" style="width:100%;">다음</button>
      </div>
    `;
    wireSubmit(() => {
      const val = root.querySelector('#clue-input').value;
      const result = validateClue(val, { forbiddenNames: [zone.name, ...(zone.aliases || [])] });
      if (!result.ok) {
        showFeedback(result.message);
        return;
      }
      objectClue = val.trim();
      if (isLast) renderLastWordPhase();
      else renderNextPhase();
    });
  }

  function renderNextPhase() {
    const nextPlaceId = draft.route[draft.stops.length + 1];
    const nextPlace = placeById(places, nextPlaceId);
    root.innerHTML = `
      <div class="card">
        <p>다음은 <strong>${escapeHtml(nextPlace.name)}</strong>이야. 이 장소를 비유로 설명해줘.</p>
        <div class="clue-input-box">
          <textarea id="clue-input" maxlength="80" placeholder="예: 소리가 두 번 들리는 커다란 동굴"></textarea>
        </div>
        <div class="clue-feedback" id="clue-feedback"></div>
        <button class="btn" id="clue-submit" style="width:100%;">이 방 완성!</button>
      </div>
    `;
    wireSubmit(() => {
      const val = root.querySelector('#clue-input').value;
      const result = validateClue(val, { forbiddenNames: [nextPlace.name] });
      if (!result.ok) {
        showFeedback(result.message);
        return;
      }
      draft.stops.push({
        order: draft.stops.length + 1,
        placeId,
        zoneId: zone.id,
        objectClue,
        nextClue: val.trim(),
        nextPlaceId
      });
      saveDraft(draft);
      showToast('한 방을 완성했어!', 'success');
      continueBuilding(root, places, identity, onExit, draft);
    });
  }

  function renderLastWordPhase() {
    root.innerHTML = `
      <div class="card">
        <p>마지막 방이야. 고양이에게 남기는 마지막 한마디를 써줘.</p>
        <div class="clue-input-box">
          <textarea id="clue-input" maxlength="100" placeholder="예: 방학 동안 잘 지내. 개학하면 내가 제일 먼저 올게."></textarea>
        </div>
        <div class="clue-feedback" id="clue-feedback"></div>
        <button class="btn" id="clue-submit" style="width:100%;">완성!</button>
      </div>
    `;
    wireSubmit(() => {
      const val = root.querySelector('#clue-input').value.trim();
      if (val.length < 1) {
        showFeedback('한마디를 남겨줘.');
        return;
      }
      draft.stops.push({
        order: draft.stops.length + 1,
        placeId,
        zoneId: zone.id,
        objectClue,
        lastWord: val
      });
      saveDraft(draft);
      continueBuilding(root, places, identity, onExit, draft);
    });
  }

  renderObjectPhase();
}

/* ---------------- 이름 짓기 + 완성 ---------------- */

function renderTitleStep(root, identity, onExit, draft) {
  root.innerHTML = `
    <div class="card">
      <h2 class="title">거의 다 됐어!</h2>
      <p>이 사료 길에 이름을 붙여줘.</p>
      <div class="field">
        <input id="title-input" maxlength="30" placeholder="예: 우리 반 고양이를 위한 사료 찾기" />
      </div>
      <button class="btn" id="title-submit" style="width:100%;">완성하기</button>
    </div>
  `;
  root.querySelector('#title-submit').addEventListener('click', () => {
    const title = root.querySelector('#title-input').value.trim() || '우리 반 고양이를 위한 사료 찾기';
    finishTrail(root, identity, onExit, draft, title);
  });
}

function finishTrail(root, identity, onExit, draft, title) {
  const trail = {
    trailId: randomTrailId(),
    title,
    creator: identity?.nickname || '누군가',
    createdAt: new Date().toISOString(),
    stops: draft.stops
  };

  let myTrails = [];
  try {
    myTrails = JSON.parse(localStorage.getItem(MY_TRAILS_KEY)) || [];
  } catch {
    myTrails = [];
  }
  myTrails.push(trail);
  localStorage.setItem(MY_TRAILS_KEY, JSON.stringify(myTrails));
  clearDraft();

  const encoded = encodeTrail(trail);
  const url = `${location.origin}${location.pathname}#trail=${encoded}`;

  root.innerHTML = `
    <div class="card trail-done-card">
      <h2 class="title">🎉 완성했어!</h2>
      <p>이 링크를 친구에게 보내주면 바로 사료를 찾을 수 있어.</p>
      <div class="share-link-row">
        <input id="share-link" readonly value="${escapeHtml(url)}" />
        <button class="btn" id="copy-btn">복사</button>
      </div>
      <div class="row-btns" style="display:flex; flex-direction:column; gap:10px; margin-top:16px;">
        <button class="btn btn-ghost" id="test-btn">지금 바로 풀어보기</button>
        <button class="btn btn-ghost" id="exit-btn">메인으로</button>
      </div>
    </div>
  `;
  root.querySelector('#copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('링크를 복사했어!', 'success');
    } catch {
      showToast('복사에 실패했어. 직접 선택해서 복사해줘.', 'error');
    }
  });
  root.querySelector('#exit-btn').addEventListener('click', onExit);
  root.querySelector('#test-btn').addEventListener('click', async () => {
    const { initPlay } = await import('./hide-play.js');
    initPlay(root, { trail, onExit });
  });
}

/* ---------------- ?edit=1 좌표 도구 (개발용, 학생 화면에 노출되지 않음) ---------------- */

export async function initEditTool(root) {
  const places = await loadPlacesIndex();
  root.innerHTML = `
    <div class="card">
      <p style="font-family:var(--font-title);">🛠 좌표 도구 (개발용)</p>
      <p class="hide-sub">보정할 장소를 골라줘.</p>
      <div class="place-grid" id="edit-grid"></div>
    </div>
  `;
  const grid = root.querySelector('#edit-grid');
  places.forEach((place) => {
    const btn = document.createElement('button');
    btn.className = 'card place-pick';
    if (place.image) btn.style.backgroundImage = `url("${place.image}")`;
    btn.innerHTML = `<span class="place-pick-name">${escapeHtml(place.name)}</span>`;
    btn.addEventListener('click', () => renderEditStage(root, place));
    grid.appendChild(btn);
  });
}

function renderEditStage(root, place) {
  root.innerHTML = `
    <div class="edit-toolbar" id="edit-output">드래그해서 사각형을 그려봐. 아래에 x,y,w,h가 뜨면 복사해서 JSON에 붙여넣으면 돼.</div>
    <div class="stage-wrap">
      <div class="stage" id="edit-stage" style="aspect-ratio:${place.aspect || 1.5};"></div>
    </div>
    <button class="btn btn-ghost" id="edit-back" style="display:block; margin:14px auto 0;">다른 장소 고르기</button>
  `;
  root.querySelector('#edit-back').addEventListener('click', () => initEditTool(root));

  const stage = root.querySelector('#edit-stage');
  renderStageImage(stage, place);
  const imgEl = stage.querySelector('img, .stage-placeholder');
  const output = root.querySelector('#edit-output');

  let dragStart = null;
  let rectEl = null;

  stage.addEventListener('pointerdown', (e) => {
    dragStart = toRatio(e.clientX, e.clientY, imgEl);
    rectEl = document.createElement('div');
    rectEl.className = 'edit-drag-rect';
    stage.appendChild(rectEl);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragStart || !rectEl) return;
    const cur = toRatio(e.clientX, e.clientY, imgEl);
    const x = Math.min(dragStart.x, cur.x);
    const y = Math.min(dragStart.y, cur.y);
    const w = Math.abs(cur.x - dragStart.x);
    const h = Math.abs(cur.y - dragStart.y);
    rectEl.style.left = `${x * 100}%`;
    rectEl.style.top = `${y * 100}%`;
    rectEl.style.width = `${w * 100}%`;
    rectEl.style.height = `${h * 100}%`;
    output.textContent = `{ "id": "?", "name": "?", "aliases": [], "x": ${x.toFixed(3)}, "y": ${y.toFixed(3)}, "w": ${w.toFixed(3)}, "h": ${h.toFixed(3)} }`;
  });
  window.addEventListener('pointerup', () => {
    dragStart = null;
  });
}
