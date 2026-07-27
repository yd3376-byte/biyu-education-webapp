import { loadPlaceBg, loadJson, showToast, escapeHtml } from './common.js';
import { getRoomsBySchool, getRoomByCode, savePlay, getRoomLeaderboard } from './db.js';

const HIT_RADIUS_RATIO = 0.08;
const GLOW_RADIUS_RATIO = 0.20;
const REVEAL_AFTER_MISSES = 5;

export async function initPlay(container, { identity, roomCode, onExit }) {
  const places = await loadJson('data/places.json');
  function placeById(id) {
    return places.find((p) => p.id === id);
  }

  if (roomCode) {
    await enterRoom(roomCode.toUpperCase());
  } else {
    renderSchoolEntry();
  }

  function renderSchoolEntry() {
    container.innerHTML = `
      <button class="btn btn-ghost" id="back-btn" style="margin-bottom:12px;">← 뒤로</button>
      <h2 class="title">어느 학교 방을 찾아볼까?</h2>
      <div class="field">
        <label>학교 코드</label>
        <input id="school-input" maxlength="8" value="${escapeHtml(identity.schoolCode)}" />
      </div>
      <button class="btn" id="list-btn" style="width:100%;">방 목록 보기</button>
    `;
    container.querySelector('#back-btn').addEventListener('click', onExit);
    container.querySelector('#list-btn').addEventListener('click', () => {
      const code = container.querySelector('#school-input').value.trim().toUpperCase();
      if (!code) return;
      renderRoomList(code);
    });
  }

  async function renderRoomList(schoolCode) {
    container.innerHTML = `
      <button class="btn btn-ghost" id="back-btn" style="margin-bottom:12px;">← 뒤로</button>
      <h2 class="title">${escapeHtml(schoolCode)} 방 목록</h2>
      <div id="room-list"><p class="hint">불러오는 중...</p></div>
    `;
    container.querySelector('#back-btn').addEventListener('click', renderSchoolEntry);

    const { data, error } = await getRoomsBySchool(schoolCode);
    const listEl = container.querySelector('#room-list');

    if (error) {
      listEl.innerHTML = '<p class="hint">방 목록을 불러올 수 없어. 잠시 후 다시 시도해줘.</p>';
      return;
    }
    if (!data || data.length === 0) {
      listEl.innerHTML = '<p class="hint">아직 만들어진 방이 없어.</p>';
      return;
    }

    const cards = await Promise.all(data.map(async (room) => {
      const { data: plays } = await getRoomLeaderboard(room.id, 100);
      const clearCount = plays ? plays.length : 0;
      const place = placeById(room.background);
      const date = new Date(room.created_at).toLocaleDateString('ko-KR');
      return `
        <button class="card room-card" data-code="${escapeHtml(room.room_code)}" style="width:100%;text-align:left;">
          <div>${place ? escapeHtml(place.emoji) : ''} ${escapeHtml(room.creator_nickname)}의 방</div>
          <div class="room-meta">${place ? escapeHtml(place.name) : ''} · 쪽지 ${room.note_count}개 · ${date} · 클리어 ${clearCount}명</div>
        </button>
      `;
    }));

    listEl.innerHTML = cards.join('');
    listEl.querySelectorAll('.room-card').forEach((btn) => {
      btn.addEventListener('click', () => enterRoom(btn.dataset.code));
    });
  }

  async function enterRoom(code) {
    container.innerHTML = '<p class="hint">방에 입장하는 중...</p>';
    const { data: room, error } = await getRoomByCode(code);

    if (error || !room) {
      showToast('방을 찾을 수 없어. 코드를 다시 확인해줘.', 'error');
      renderSchoolEntry();
      return;
    }

    const playState = {
      room,
      notes: [...room.notes].sort((a, b) => a.order_index - b.order_index),
      currentIndex: 0,
      attempts: 0,
      missesForCurrent: 0,
      revealed: false,
      startTime: Date.now(),
      foundNotes: []
    };

    renderHintScreen(playState);
  }

  function renderHintScreen(playState) {
    const note = playState.notes[playState.currentIndex];
    const place = placeById(playState.room.background);

    container.innerHTML = `
      <h2 class="title">${escapeHtml(playState.room.creator_nickname)}의 방 — ${playState.currentIndex + 1}/${playState.notes.length}번째 쪽지</h2>
      <div class="play-hint-box card">"${escapeHtml(note.hint)}"</div>
      <div class="pin-board card" id="play-board" style="cursor:pointer;"></div>
      <p class="hint" id="play-feedback" style="text-align:center;margin-top:10px;min-height:1.4em;"></p>
    `;

    const board = container.querySelector('#play-board');
    loadPlaceBg(board, place);
    playState.missesForCurrent = 0;

    board.addEventListener('click', (e) => onBoardClick(e, board, playState));
  }

  function onBoardClick(e, board, playState) {
    const note = playState.notes[playState.currentIndex];
    const rect = board.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const targetX = note.x * rect.width;
    const targetY = note.y * rect.height;
    const dist = Math.hypot(clickX - targetX, clickY - targetY);
    const threshold = HIT_RADIUS_RATIO * Math.min(rect.width, rect.height);

    playState.attempts += 1;

    if (dist <= threshold) {
      onHit(board, playState, note, targetX, targetY);
    } else {
      onMiss(board, playState, clickX, clickY, targetX, targetY, rect);
    }
  }

  function onMiss(board, playState, clickX, clickY, targetX, targetY, rect) {
    const ripple = document.createElement('div');
    ripple.className = 'ripple-wrong';
    ripple.style.left = `${clickX}px`;
    ripple.style.top = `${clickY}px`;
    board.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());

    playState.missesForCurrent += 1;
    const feedback = container.querySelector('#play-feedback');
    feedback.textContent = '여긴 아니야';

    if (playState.missesForCurrent >= REVEAL_AFTER_MISSES && !board.querySelector('.glow-hint-circle')) {
      const diameter = 2 * GLOW_RADIUS_RATIO * Math.min(rect.width, rect.height);
      const glow = document.createElement('div');
      glow.className = 'glow-hint-circle';
      glow.style.width = `${diameter}px`;
      glow.style.height = `${diameter}px`;
      glow.style.left = `${targetX - diameter / 2}px`;
      glow.style.top = `${targetY - diameter / 2}px`;
      board.appendChild(glow);
      feedback.textContent = '이 근처를 잘 찾아봐 ✨';
    }
  }

  function onHit(board, playState, note, targetX, targetY) {
    board.replaceWith(board.cloneNode(true)); // 클릭 리스너 제거(중복 판정 방지)

    playState.foundNotes.push(note);

    container.querySelector('#play-feedback').textContent = '';
    const reveal = document.createElement('div');
    reveal.className = 'card';
    reveal.style.marginTop = '12px';
    reveal.innerHTML = `
      <div class="trace-title" style="font-family:var(--font-title);color:var(--sunset);margin-bottom:6px;">쪽지를 찾았어!</div>
      <div>${escapeHtml(note.message)}</div>
      <button class="btn" id="next-hint-btn" style="width:100%;margin-top:14px;">다음</button>
    `;
    container.appendChild(reveal);

    reveal.querySelector('#next-hint-btn').addEventListener('click', () => {
      playState.currentIndex += 1;
      if (playState.currentIndex >= playState.notes.length) {
        finishPlay(playState);
      } else {
        renderHintScreen(playState);
      }
    });
  }

  async function finishPlay(playState) {
    const elapsedSeconds = Math.round((Date.now() - playState.startTime) / 1000);

    container.innerHTML = '<p class="hint">기록을 저장하는 중...</p>';

    const { error } = await savePlay({
      room_id: playState.room.id,
      nickname: identity.nickname,
      elapsed_seconds: elapsedSeconds,
      attempts: playState.attempts
    });
    if (error) {
      showToast('클리어 기록 저장에 실패했어. 결과는 볼 수 있어.', 'error');
    }

    const { data: leaderboard } = await getRoomLeaderboard(playState.room.id, 10);

    const foundHtml = playState.foundNotes.map((n, i) => `
      <div class="card pin-list-item">
        <div class="pin-no">${i + 1}</div>
        <div class="pin-text">${escapeHtml(n.message)}</div>
      </div>
    `).join('');

    const boardHtml = (leaderboard && leaderboard.length)
      ? leaderboard.map((p, i) => `
          <div class="rank-row ${p.nickname === identity.nickname ? 'me' : ''}">
            <div class="rank-no">${i + 1}</div>
            <div class="rank-nick">${escapeHtml(p.nickname)}</div>
            <div class="rank-score">${p.elapsed_seconds}초</div>
          </div>
        `).join('')
      : '<p class="hint">아직 기록이 없어.</p>';

    container.innerHTML = `
      <h2 class="title">🎉 클리어!</h2>
      <div class="card" style="text-align:center;margin-bottom:14px;">
        <div>걸린 시간: <strong>${elapsedSeconds}초</strong></div>
        <div>시도 횟수: <strong>${playState.attempts}회</strong></div>
      </div>
      <h3>찾은 쪽지 다시 보기</h3>
      ${foundHtml}
      <h3 style="margin-top:16px;">이 방 기록판 (빠른 순 10명)</h3>
      ${boardHtml}
      <button class="btn" id="other-room-btn" style="width:100%;margin-top:16px;">다른 방 가기</button>
    `;

    container.querySelector('#other-room-btn').addEventListener('click', () => renderSchoolEntry());
  }
}
