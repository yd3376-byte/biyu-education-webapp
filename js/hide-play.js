// 사료 찾기 (밥길 따라가기). js/db.js/Supabase는 전혀 참조하지 않는다 (MVP).

import { loadJson, escapeHtml } from './common.js';
import { toRatio, hitTest, expandSmallZones, distanceToZoneCenter } from './hide-core.js';

const MAP_IMAGE = 'assets/img/map.png';
const MAP_ASPECT = 1.25;

let placesIndex = null;
let mapHotspots = null;

async function loadPlacesIndex() {
  if (!placesIndex) placesIndex = await loadJson('data/places/index.json');
  return placesIndex;
}

async function loadMapHotspots() {
  if (!mapHotspots) mapHotspots = await loadJson('data/places/map-hotspots.json');
  return mapHotspots;
}

async function loadZones(placeId) {
  try {
    return await loadJson(`data/places/${placeId}.json`);
  } catch {
    return [];
  }
}

export async function initPlay(root, { trail, onExit }) {
  const places = await loadPlacesIndex();
  const state = {
    trail,
    stopIndex: 0,
    attemptsThisStop: 0,
    totalAttempts: 0,
    startTime: Date.now()
  };

  await renderClueScreen(root, places, state, onExit);
}

function placeById(places, id) {
  return places.find((p) => p.id === id) || { id, name: id, image: '', aspect: 1.5, miss: '여긴 아니다.' };
}

async function renderClueScreen(root, places, state, onExit) {
  const stop = state.trail.stops[state.stopIndex];
  const place = placeById(places, stop.placeId);
  const zones = await loadZones(stop.placeId);
  state.attemptsThisStop = 0;

  root.innerHTML = `
    <div class="card clue-card">
      <div class="clue-label">${state.stopIndex + 1} / ${state.trail.stops.length}번째 사료</div>
      <div class="clue-text">"${escapeHtml(stop.objectClue)}"</div>
    </div>
    <div class="stage-wrap">
      <div class="stage" id="play-stage" style="aspect-ratio:${place.aspect || 1.5};"></div>
    </div>
    <div class="play-hint-box" id="play-hint"></div>
    <button class="btn btn-ghost" id="exit-btn" style="display:block; margin:14px auto 0;">그만두기</button>
  `;
  root.querySelector('#exit-btn').addEventListener('click', onExit);

  const stage = root.querySelector('#play-stage');
  renderStageImage(stage, place);
  renderZoneOutlines(stage, zones);

  const hintBox = root.querySelector('#play-hint');
  const imgEl = stage.querySelector('img, .stage-placeholder');

  stage.addEventListener('pointerdown', async (e) => {
    if (e.target.closest('.zone') === null && e.target !== imgEl && !stage.contains(e.target)) return;
    const point = toRatio(e.clientX, e.clientY, imgEl);
    const effectiveZones = expandSmallZones(zones, imgEl);
    const zoneId = hitTest(point, effectiveZones);

    if (zoneId === stop.zoneId) {
      onFound(root, places, state, onExit);
      return;
    }

    state.attemptsThisStop += 1;
    state.totalAttempts += 1;
    showRipple(stage, e.clientX, e.clientY);

    const correctZone = zones.find((z) => z.id === stop.zoneId);
    if (state.attemptsThisStop === 1) {
      hintBox.textContent = '';
    } else if (state.attemptsThisStop === 2 && correctZone) {
      const d = distanceToZoneCenter(point, correctZone);
      hintBox.textContent = d < 0.15 ? '아주 가까워!' : d < 0.35 ? '조금 더 가까이' : '다른 곳을 찾아볼까?';
    } else if (state.attemptsThisStop >= 3) {
      hintBox.textContent = '반짝이는 곳을 눌러봐.';
      const zoneEl = stage.querySelector(`.zone[data-zone-id="${stop.zoneId}"]`);
      zoneEl?.classList.add('reveal-hint');
    }
  });
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

function renderZoneOutlines(stage, zones) {
  zones.forEach((zone) => {
    const el = document.createElement('div');
    el.className = 'zone';
    el.dataset.zoneId = zone.id;
    el.style.left = `${zone.x * 100}%`;
    el.style.top = `${zone.y * 100}%`;
    el.style.width = `${zone.w * 100}%`;
    el.style.height = `${zone.h * 100}%`;
    stage.appendChild(el);
  });
}

function showRipple(stage, clientX, clientY) {
  const r = stage.getBoundingClientRect();
  const ripple = document.createElement('div');
  ripple.className = 'ripple-wrong';
  ripple.style.left = `${clientX - r.left}px`;
  ripple.style.top = `${clientY - r.top}px`;
  stage.appendChild(ripple);
  setTimeout(() => ripple.remove(), 650);
}

function onFound(root, places, state, onExit) {
  const stop = state.trail.stops[state.stopIndex];
  const isLast = state.stopIndex + 1 >= state.trail.stops.length;

  root.innerHTML = `
    <div class="card" style="text-align:center;">
      <div class="found-sprite" style="font-size:4.5rem;">🥣</div>
      <h2 class="title" style="margin-top:8px;">사료를 찾았다!</h2>
      <button class="btn" id="open-btn">열어보기</button>
    </div>
  `;

  root.querySelector('#open-btn').addEventListener('click', () => {
    if (isLast) {
      renderCompletion(root, state, stop, onExit);
    } else {
      renderPlacePicker(root, places, state, stop, onExit);
    }
  });
}

async function renderPlacePicker(root, places, state, stop, onExit) {
  const hotspots = await loadMapHotspots();
  root.innerHTML = `
    <div class="card clue-card">
      <div class="clue-label">쪽지</div>
      <div class="clue-text">잘 찾았어! 다음은 — "${escapeHtml(stop.nextClue)}"</div>
    </div>
    <div class="stage-wrap">
      <div class="stage" id="map-stage" style="aspect-ratio:${MAP_ASPECT};"></div>
    </div>
    <div class="clue-feedback" id="place-feedback"></div>
    <button class="btn btn-ghost" id="exit-btn" style="display:block; margin:14px auto 0;">그만두기</button>
  `;
  root.querySelector('#exit-btn').addEventListener('click', onExit);

  const stage = root.querySelector('#map-stage');
  renderStageImage(stage, { image: MAP_IMAGE, name: '학교 지도' });
  const feedback = root.querySelector('#place-feedback');

  hotspots.forEach((h) => {
    const el = document.createElement('div');
    el.className = 'zone';
    el.dataset.hotspotId = h.id;
    el.style.left = `${h.x * 100}%`;
    el.style.top = `${h.y * 100}%`;
    el.style.width = `${h.w * 100}%`;
    el.style.height = `${h.h * 100}%`;
    el.innerHTML = `<span class="zone-label">${escapeHtml(h.name)}</span>`;
    el.addEventListener('click', () => {
      if (h.id === stop.nextPlaceId) {
        state.stopIndex += 1;
        renderClueScreen(root, places, state, onExit);
      } else {
        const place = placeById(places, h.id);
        feedback.textContent = place.miss || '여긴 아니다.';
      }
    });
    stage.appendChild(el);
  });
}

function renderCompletion(root, state, lastStop, onExit) {
  const elapsedSec = Math.round((Date.now() - state.startTime) / 1000);
  const min = Math.floor(elapsedSec / 60);
  const sec = elapsedSec % 60;

  root.innerHTML = `
    <div class="card trail-done-card">
      <h2 class="title">🐈 완주했다!</h2>
      <div class="trail-stat-row">
        <span>⏱ ${min}분 ${sec}초</span>
        <span>🎯 시도 ${state.totalAttempts + state.trail.stops.length}회</span>
      </div>
      <div class="lastword">"${escapeHtml(lastStop.lastWord || '')}"</div>
      <p style="margin-top:14px; color:var(--cat); font-size:.9rem;">${escapeHtml(state.trail.creator || '누군가')}가 만든 사료 길이었어.</p>
      <div class="row-btns" style="display:flex; flex-direction:column; gap:10px; margin-top:16px;">
        <button class="btn" id="create-btn">🐈 나도 사료 숨기기</button>
        <button class="btn btn-ghost" id="exit-btn2">메인으로</button>
      </div>
    </div>
  `;
  root.querySelector('#exit-btn2').addEventListener('click', onExit);
  root.querySelector('#create-btn').addEventListener('click', async () => {
    const { initCreate } = await import('./hide-create.js');
    initCreate(root, { onExit });
  });
}
