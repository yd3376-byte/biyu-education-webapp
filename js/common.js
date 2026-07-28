// 닉네임/학교코드 관리, 토스트, 타이핑 효과, 장소 배경 플레이스홀더 등 공통 유틸

import { BANNED_WORDS } from './metaphor.js';

const NICK_KEY = 'ba_nickname';
const SCHOOL_KEY = 'ba_school_code';
const ROLE_KEY = 'ba_role';

/* ---------------- 닉네임 / 학교 코드 ---------------- */

export function getNickname() {
  return localStorage.getItem(NICK_KEY) || '';
}

export function getSchoolCode() {
  return localStorage.getItem(SCHOOL_KEY) || '';
}

export function hasIdentity() {
  return !!(getNickname() && getSchoolCode());
}

export function getRole() {
  return localStorage.getItem(ROLE_KEY) || '';
}

export function setIdentity(nickname, schoolCode, role = getRole() || 'student') {
  localStorage.setItem(NICK_KEY, nickname);
  localStorage.setItem(SCHOOL_KEY, schoolCode.toUpperCase());
  localStorage.setItem(ROLE_KEY, role);
}

function generateSchoolCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동되는 0/O, 1/I 제외
  let code = '';
  for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function validateNickname(v) {
  const value = (v ?? '').trim();
  if (value.length < 2 || value.length > 10) {
    return { ok: false, message: '닉네임은 2~10자로 입력해줘.' };
  }
  if (/[\s!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(value)) {
    return { ok: false, message: '공백이나 특수문자는 사용할 수 없어.' };
  }
  if (BANNED_WORDS.some(w => value.includes(w))) {
    return { ok: false, message: '사용할 수 없는 닉네임이야.' };
  }
  return { ok: true, message: '' };
}

export function validateSchoolCode(v) {
  const value = (v ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(value)) {
    return { ok: false, message: '학교 코드는 영문/숫자 4~8자로 입력해줘.' };
  }
  return { ok: true, message: '' };
}

/**
 * 화면 어디서든 닉네임/학교코드가 없으면 모달을 띄워 입력받는다.
 * 이미 있으면 즉시 resolve.
 */
export function ensureIdentity() {
  return new Promise((resolve) => {
    if (hasIdentity()) {
      resolve({ nickname: getNickname(), schoolCode: getSchoolCode() });
      return;
    }
    openIdentityModal(resolve);
  });
}

function openIdentityModal(onDone) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  document.body.appendChild(backdrop);

  function finish(nickname, schoolCode, role) {
    setIdentity(nickname, schoolCode, role);
    document.body.removeChild(backdrop);
    onDone({ nickname: getNickname(), schoolCode: getSchoolCode() });
  }

  function renderRoleChoice() {
    backdrop.innerHTML = `
      <div class="modal">
        <h2 class="title">선생님이신가요, 학생인가요?</h2>
        <div class="role-choice-row">
          <button class="btn role-choice-btn" id="role-teacher">🧑‍🏫 선생님</button>
          <button class="btn btn-ghost role-choice-btn" id="role-student">🧑‍🎓 학생</button>
        </div>
      </div>
    `;
    backdrop.querySelector('#role-teacher').addEventListener('click', renderTeacherForm);
    backdrop.querySelector('#role-student').addEventListener('click', renderStudentForm);
  }

  function renderStudentForm() {
    backdrop.innerHTML = `
      <div class="modal">
        <h2 class="title">닉네임과 학교 코드를 알려줘</h2>
        <div class="field">
          <label for="ident-nick">닉네임 (2~10자)</label>
          <input id="ident-nick" type="text" maxlength="10" placeholder="예: 하늘" value="${escapeHtml(getNickname())}" />
          <div class="error" id="ident-nick-err"></div>
        </div>
        <div class="field">
          <label for="ident-school">학교 코드 (선생님이 알려준 코드)</label>
          <input id="ident-school" type="text" maxlength="8" placeholder="예: HANSOL5" value="${escapeHtml(getSchoolCode())}" />
          <div class="error" id="ident-school-err"></div>
        </div>
        <button class="btn" id="ident-submit" style="width:100%">시작하기</button>
        <button class="modal-back-link" id="ident-back">← 다시 선택</button>
      </div>
    `;
    const nickInput = backdrop.querySelector('#ident-nick');
    const schoolInput = backdrop.querySelector('#ident-school');

    backdrop.querySelector('#ident-back').addEventListener('click', renderRoleChoice);
    backdrop.querySelector('#ident-submit').addEventListener('click', () => {
      const nickResult = validateNickname(nickInput.value);
      const schoolResult = validateSchoolCode(schoolInput.value);
      backdrop.querySelector('#ident-nick-err').textContent = nickResult.ok ? '' : nickResult.message;
      backdrop.querySelector('#ident-school-err').textContent = schoolResult.ok ? '' : schoolResult.message;
      if (!nickResult.ok || !schoolResult.ok) return;
      finish(nickInput.value.trim(), schoolInput.value.trim(), 'student');
    });
  }

  function renderTeacherForm() {
    let code = getSchoolCode() || generateSchoolCode();
    backdrop.innerHTML = `
      <div class="modal">
        <h2 class="title">우리 반 코드를 만들었어요</h2>
        <p class="field-hint" style="margin-bottom:10px;">이 코드를 학생들에게 알려주세요. 학생들은 이 코드로 들어와요.</p>
        <div class="teacher-code-display" id="code-display">${escapeHtml(code)}</div>
        <button class="btn btn-ghost" id="regen-btn" style="width:100%; margin:10px 0 16px;">다른 코드 만들기</button>
        <div class="field">
          <label for="ident-teacher-nick">선생님 닉네임 (2~10자)</label>
          <input id="ident-teacher-nick" type="text" maxlength="10" value="${escapeHtml(getNickname() || '선생님')}" />
          <div class="error" id="ident-teacher-nick-err"></div>
        </div>
        <button class="btn" id="ident-teacher-submit" style="width:100%">시작하기</button>
        <button class="modal-back-link" id="ident-teacher-back">← 다시 선택</button>
      </div>
    `;
    backdrop.querySelector('#ident-teacher-back').addEventListener('click', renderRoleChoice);
    backdrop.querySelector('#regen-btn').addEventListener('click', () => {
      code = generateSchoolCode();
      backdrop.querySelector('#code-display').textContent = code;
    });
    backdrop.querySelector('#ident-teacher-submit').addEventListener('click', () => {
      const nickInput = backdrop.querySelector('#ident-teacher-nick');
      const nickResult = validateNickname(nickInput.value);
      backdrop.querySelector('#ident-teacher-nick-err').textContent = nickResult.ok ? '' : nickResult.message;
      if (!nickResult.ok) return;
      finish(nickInput.value.trim(), code, 'teacher');
    });
  }

  const startRole = getRole();
  if (startRole === 'teacher') renderTeacherForm();
  else if (startRole === 'student') renderStudentForm();
  else renderRoleChoice();
}

/**
 * 헤더 우측에 "닉네임: X / CODE [변경]" 을 렌더링한다.
 */
export function mountNickHeader(container) {
  function render() {
    container.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = `${getNickname()} / ${getSchoolCode()}`;
    const btn = document.createElement('button');
    btn.textContent = '변경';
    btn.addEventListener('click', () => {
      openIdentityModal(() => render());
    });
    container.appendChild(span);
    container.appendChild(btn);
  }
  render();
}

/* ---------------- 토스트 ---------------- */

function getToastRoot() {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  return root;
}

export function showToast(message, type = 'info', duration = 3000) {
  const root = getToastRoot();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  root.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ---------------- 타이핑 효과 ---------------- */

/**
 * el 안에 text를 한 글자씩 출력한다. 진행 중 el을 클릭하면 즉시 전체 출력.
 * prefers-reduced-motion이면 바로 전체 출력.
 * @returns {Promise<void>}
 */
export function typeText(el, text, { speed = 32 } = {}) {
  return new Promise((resolve) => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.textContent = '';

    if (reduceMotion) {
      el.textContent = text;
      resolve();
      return;
    }

    let i = 0;
    let done = false;
    let timer = null;

    function finish() {
      if (done) return;
      done = true;
      clearInterval(timer);
      el.textContent = text;
      el.removeEventListener('click', finish);
      resolve();
    }

    el.addEventListener('click', finish);
    timer = setInterval(() => {
      i += 1;
      el.textContent = text.slice(0, i);
      if (i >= text.length) finish();
    }, speed);
  });
}

/* ---------------- 장소 배경 플레이스홀더 ---------------- */

/**
 * assets/bg/{place.id}.png 로드를 시도하고, 실패하면 place.color/emoji/name으로
 * CSS 그라디언트 + SVG 실루엣 플레이스홀더를 렌더링한다.
 * @param {HTMLElement} el - .place-bg 클래스를 가진 컨테이너
 * @param {{id:string, name:string, color:string, emoji:string}} place
 * @param {string} imgBasePath - 예: 'assets/bg' (story.html/hide.html의 상대경로에 맞춰 전달)
 */
export function loadPlaceBg(el, place, imgBasePath = 'assets/bg') {
  el.classList.add('place-bg');
  el.innerHTML = '';
  el.style.background = '';

  const img = new Image();
  img.src = `${imgBasePath}/${place.id}.png`;
  img.onload = () => {
    el.style.backgroundImage = `url("${img.src}")`;
  };
  img.onerror = () => {
    el.style.background = `linear-gradient(160deg, ${place.color}, ${shade(place.color, -20)})`;
    const fallback = document.createElement('div');
    fallback.className = 'place-bg-fallback';
    fallback.innerHTML = `
      <div class="emoji">${place.emoji}</div>
      <div class="place-name">${place.name}</div>
    `;
    el.appendChild(fallback);
  };
}

function shade(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00ff) + percent;
  let b = (num & 0x0000ff) + percent;
  r = Math.max(Math.min(255, r), 0);
  g = Math.max(Math.min(255, g), 0);
  b = Math.max(Math.min(255, b), 0);
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

/* ---------------- 기타 ---------------- */

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export async function loadJson(path) {
  // 교사가 data/*.json을 자주 수정하므로 브라우저 캐시를 거치지 않고 항상 최신본을 가져온다.
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`failed to load ${path}`);
  return res.json();
}
