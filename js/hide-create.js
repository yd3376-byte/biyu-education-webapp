import { checkMetaphor } from './metaphor.js';
import { loadPlaceBg, loadJson, showToast, escapeHtml } from './common.js';
import { createRoom } from './db.js';

const HIDE_PLACES = ['classroom', 'gym', 'library', 'ground', 'playground'];
const MIN_NOTES = 3;
const MAX_NOTES = 5;
const CREATE_LIMIT_KEY = 'ba_room_creates';
const CREATE_LIMIT_COUNT = 3;
const CREATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function initCreate(container, { identity, onExit }) {
  const places = await loadJson('data/places.json');
  const state = { background: null, pins: [] };

  function placeById(id) {
    return places.find((p) => p.id === id);
  }

  renderPlaceSelect();

  function renderPlaceSelect() {
    container.innerHTML = `
      <button class="btn btn-ghost" id="back-btn" style="margin-bottom:12px;">← 뒤로</button>
      <h2 class="title">어디에 숨길까?</h2>
      <div class="place-grid" id="place-grid"></div>
    `;
    container.querySelector('#back-btn').addEventListener('click', onExit);

    const grid = container.querySelector('#place-grid');
    HIDE_PLACES.forEach((pid) => {
      const div = document.createElement('div');
      div.className = 'place-pick';
      loadPlaceBg(div, placeById(pid));
      div.addEventListener('click', () => {
        state.background = pid;
        state.pins = [];
        renderBoard();
      });
      grid.appendChild(div);
    });
  }

  function renderBoard() {
    container.innerHTML = `
      <button class="btn btn-ghost" id="back-btn" style="margin-bottom:12px;">← 장소 다시 고르기</button>
      <h2 class="title">${escapeHtml(placeById(state.background).name)}에 쪽지를 숨겨보자</h2>
      <p class="hint">그림을 탭해서 쪽지를 숨길 위치를 정해줘. (최소 ${MIN_NOTES}개, 최대 ${MAX_NOTES}개)</p>
      <div class="pin-board card" id="pin-board"></div>
      <div class="pin-list" id="pin-list"></div>
      <button class="btn" id="finish-btn" style="width:100%;margin-top:14px;">완성하기</button>
    `;
    container.querySelector('#back-btn').addEventListener('click', renderPlaceSelect);

    const board = container.querySelector('#pin-board');
    loadPlaceBg(board, placeById(state.background));
    board.addEventListener('click', (e) => {
      if (state.pins.length >= MAX_NOTES) {
        showToast(`쪽지는 최대 ${MAX_NOTES}개까지 숨길 수 있어.`, 'error');
        return;
      }
      const rect = board.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      openPinSheet({ x, y }, null);
    });

    container.querySelector('#finish-btn').addEventListener('click', () => {
      if (state.pins.length < MIN_NOTES || state.pins.length > MAX_NOTES) return;
      renderPreview();
    });

    renderPins();
    updateFinishButton();
  }

  function renderPins() {
    const board = container.querySelector('#pin-board');
    board.querySelectorAll('.pin-marker').forEach((el) => el.remove());
    state.pins.forEach((pin, i) => {
      const marker = document.createElement('div');
      marker.className = 'pin-marker';
      marker.style.left = `${pin.x * 100}%`;
      marker.style.top = `${pin.y * 100}%`;
      marker.innerHTML = `<span>${i + 1}</span>`;
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        openPinSheet(pin, i);
      });
      board.appendChild(marker);
    });

    const list = container.querySelector('#pin-list');
    list.innerHTML = '';
    state.pins.forEach((pin, i) => {
      const item = document.createElement('div');
      item.className = 'card pin-list-item';
      item.innerHTML = `
        <div class="pin-no">${i + 1}</div>
        <div class="pin-text">
          <div class="hint">힌트: ${escapeHtml(pin.hint)}</div>
          <div>쪽지: ${escapeHtml(pin.message)}</div>
        </div>
        <button type="button">삭제</button>
      `;
      item.querySelector('button').addEventListener('click', () => {
        state.pins.splice(i, 1);
        renderPins();
        updateFinishButton();
      });
      list.appendChild(item);
    });
  }

  function updateFinishButton() {
    const btn = container.querySelector('#finish-btn');
    const ok = state.pins.length >= MIN_NOTES && state.pins.length <= MAX_NOTES;
    btn.disabled = !ok;
    btn.textContent = `완성하기 (${state.pins.length}/${MIN_NOTES}~${MAX_NOTES})`;
  }

  function openPinSheet(base, editIndex) {
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.innerHTML = `
      <div class="sheet">
        <h3>${editIndex !== null ? `${editIndex + 1}번 쪽지 수정` : '새 쪽지 숨기기'}</h3>
        <div class="field">
          <label>힌트 (이 자리를 비유로 설명해줘)</label>
          <textarea id="pin-hint" maxlength="120">${escapeHtml(base.hint || '')}</textarea>
          <div class="error" id="pin-hint-err"></div>
        </div>
        <div class="field">
          <label>쪽지 내용 (1~60자)</label>
          <textarea id="pin-message" maxlength="60">${escapeHtml(base.message || '')}</textarea>
          <div class="error" id="pin-message-err"></div>
        </div>
        <button class="btn" id="pin-save" style="width:100%;">저장</button>
        ${editIndex !== null ? '<button class="btn btn-ghost" id="pin-delete" style="width:100%;margin-top:8px;">이 쪽지 삭제</button>' : ''}
        <button class="btn btn-ghost" id="pin-cancel" style="width:100%;margin-top:8px;">취소</button>
      </div>
    `;
    document.body.appendChild(backdrop);

    backdrop.querySelector('#pin-cancel').addEventListener('click', () => {
      document.body.removeChild(backdrop);
    });

    if (editIndex !== null) {
      backdrop.querySelector('#pin-delete').addEventListener('click', () => {
        state.pins.splice(editIndex, 1);
        document.body.removeChild(backdrop);
        renderPins();
        updateFinishButton();
      });
    }

    backdrop.querySelector('#pin-save').addEventListener('click', () => {
      const hintVal = backdrop.querySelector('#pin-hint').value.trim();
      const msgVal = backdrop.querySelector('#pin-message').value.trim();
      const hintErr = backdrop.querySelector('#pin-hint-err');
      const msgErr = backdrop.querySelector('#pin-message-err');

      const hintResult = checkMetaphor(hintVal);
      hintErr.textContent = hintResult.ok ? '' : hintResult.message;

      let msgOk = true;
      if (msgVal.length < 1 || msgVal.length > 60) {
        msgErr.textContent = '쪽지 내용은 1~60자로 써줘.';
        msgOk = false;
      } else {
        msgErr.textContent = '';
      }

      if (!hintResult.ok || !msgOk) return;

      if (editIndex !== null) {
        state.pins[editIndex] = { ...state.pins[editIndex], hint: hintVal, message: msgVal };
      } else {
        state.pins.push({ x: base.x, y: base.y, hint: hintVal, message: msgVal });
      }

      document.body.removeChild(backdrop);
      renderPins();
      updateFinishButton();
    });
  }

  function renderPreview() {
    container.innerHTML = `
      <button class="btn btn-ghost" id="back-btn" style="margin-bottom:12px;">← 수정하러 가기</button>
      <h2 class="title">미리보기</h2>
      <div class="pin-board card" id="preview-board" style="cursor:default;"></div>
      <div class="pin-list" id="preview-list"></div>
      <button class="btn" id="save-room-btn" style="width:100%;margin-top:14px;">저장하고 방 코드 받기</button>
    `;
    container.querySelector('#back-btn').addEventListener('click', renderBoard);

    const board = container.querySelector('#preview-board');
    loadPlaceBg(board, placeById(state.background));
    state.pins.forEach((pin, i) => {
      const marker = document.createElement('div');
      marker.className = 'pin-marker';
      marker.style.left = `${pin.x * 100}%`;
      marker.style.top = `${pin.y * 100}%`;
      marker.innerHTML = `<span>${i + 1}</span>`;
      board.appendChild(marker);
    });

    container.querySelector('#preview-list').innerHTML = state.pins.map((pin, i) => `
      <div class="card pin-list-item">
        <div class="pin-no">${i + 1}</div>
        <div class="pin-text">
          <div class="hint">힌트: ${escapeHtml(pin.hint)}</div>
          <div>쪽지: ${escapeHtml(pin.message)}</div>
        </div>
      </div>
    `).join('');

    container.querySelector('#save-room-btn').addEventListener('click', saveRoom);
  }

  async function saveRoom() {
    if (!checkCreateLimit()) {
      showToast('방 만들기는 10분에 3개까지 가능해. 잠시 후 다시 시도해줘.', 'error');
      return;
    }

    const btn = container.querySelector('#save-room-btn');
    btn.disabled = true;
    btn.textContent = '저장 중...';

    const { data, error } = await createRoom({
      school_code: identity.schoolCode,
      creator_nickname: identity.nickname,
      background: state.background,
      notes: state.pins
    });

    if (error) {
      showToast('방 저장에 실패했어. 다시 시도해줘.', 'error');
      btn.disabled = false;
      btn.textContent = '저장하고 방 코드 받기';
      return;
    }

    recordCreateTimestamp();
    renderDone(data.room_code);
  }

  function renderDone(roomCode) {
    const basePath = location.pathname.replace(/[^/]*$/, '');
    const shareUrl = `${location.origin}${basePath}hide.html?room=${roomCode}`;

    container.innerHTML = `
      <div class="card room-code-card">
        <div>방 코드가 만들어졌어!</div>
        <div class="code">${escapeHtml(roomCode)}</div>
        <div class="room-link-row">
          <input readonly id="share-url" value="${escapeHtml(shareUrl)}" />
          <button class="btn" id="copy-btn">복사</button>
        </div>
      </div>
      <a class="btn btn-ghost" style="display:block;text-align:center;margin-top:14px;" href="index.html">메인으로</a>
    `;

    container.querySelector('#copy-btn').addEventListener('click', async () => {
      const input = container.querySelector('#share-url');
      input.select();
      try {
        await navigator.clipboard.writeText(input.value);
        showToast('링크를 복사했어!', 'success');
      } catch {
        showToast('복사에 실패했어. 직접 선택해서 복사해줘.', 'error');
      }
    });
  }
}

function getCreateTimestamps() {
  try {
    return JSON.parse(localStorage.getItem(CREATE_LIMIT_KEY) || '[]');
  } catch {
    return [];
  }
}

function checkCreateLimit() {
  const now = Date.now();
  const recent = getCreateTimestamps().filter((t) => now - t < CREATE_LIMIT_WINDOW_MS);
  return recent.length < CREATE_LIMIT_COUNT;
}

function recordCreateTimestamp() {
  const now = Date.now();
  const recent = getCreateTimestamps().filter((t) => now - t < CREATE_LIMIT_WINDOW_MS);
  recent.push(now);
  localStorage.setItem(CREATE_LIMIT_KEY, JSON.stringify(recent));
}
