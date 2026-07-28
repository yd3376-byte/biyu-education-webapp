// 사료 숨기기/찾기 — 좌표 변환, 존 판정, 단서 검증. 순수 함수만 둔다.
// (toRatio/toPixel/expandSmallZones만 imgEl의 getBoundingClientRect()를 읽는다.
//  DOM을 변경하거나 전역 상태를 쓰지는 않는다.)

import { BANNED_WORDS } from './metaphor.js';

// "같다" 종결형("~ 같다")도 인식한다 — js/metaphor.js에서 이미 확인된, 학생들이
// 흔히 쓰는 자연스러운 표현이라 빠뜨리면 안 된다.
const SIMILE_RE = /같(은|이|아|아서|다)|처럼|듯이?|마냥/;
const METAPHOR_RE = /(는|은)\s*\S+(이다|다)[.!]?$/;

/**
 * 클릭/터치 클라이언트 좌표를 이미지 요소 기준 0~1 비율로 변환한다.
 * offsetX/offsetY는 자식 요소(핀, 존 표시) 위를 클릭하면 기준점이 바뀌어 값이 튀므로 쓰지 않는다.
 */
export function toRatio(clientX, clientY, imgEl) {
  const r = imgEl.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (clientY - r.top) / r.height))
  };
}

/** 0~1 비율 좌표를 이미지 요소 기준 픽셀 좌표로 변환한다 (핀 배치용). */
export function toPixel(ratio, imgEl) {
  const r = imgEl.getBoundingClientRect();
  return { x: ratio.x * r.width, y: ratio.y * r.height };
}

/**
 * 비율 좌표(point)가 어느 존(zone) 사각형 안에 있는지 판정한다.
 * zones: [{id, x, y, w, h, ...}] — x,y는 왼쪽 위 모서리, w,h는 폭/높이, 전부 0~1 비율.
 * @returns {string|null} zoneId 또는 없으면 null
 */
export function hitTest(point, zones) {
  for (const zone of zones) {
    if (
      point.x >= zone.x && point.x <= zone.x + zone.w &&
      point.y >= zone.y && point.y <= zone.y + zone.h
    ) {
      return zone.id;
    }
  }
  return null;
}

/** 존이 최소 44px 히트박스보다 작으면 판정용으로만 확장한다 (표시 크기는 그대로 둔다). */
export function expandSmallZones(zones, imgEl, minPx = 44) {
  const r = imgEl.getBoundingClientRect();
  if (!r.width || !r.height) return zones;
  return zones.map((zone) => {
    const wPx = zone.w * r.width;
    const hPx = zone.h * r.height;
    if (wPx >= minPx && hPx >= minPx) return zone;
    const newW = Math.max(zone.w, minPx / r.width);
    const newH = Math.max(zone.h, minPx / r.height);
    const cx = zone.x + zone.w / 2;
    const cy = zone.y + zone.h / 2;
    return { ...zone, x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH };
  });
}

/** 비율 좌표와 존 중심 사이의 거리 (0~1 공간 기준). "조금 더 가까이" 힌트에 쓴다. */
export function distanceToZoneCenter(point, zone) {
  const cx = zone.x + zone.w / 2;
  const cy = zone.y + zone.h / 2;
  return Math.hypot(point.x - cx, point.y - cy);
}

function normalize(s) {
  return (s ?? '').replace(/[\s\p{P}]/gu, '');
}

/**
 * 단서 문장을 검증한다. 사물 비유·장소 비유 모두 이 함수 하나를 쓴다.
 * @param {string} text
 * @param {{forbiddenNames?: string[]}} opts - 정답 이름 + 별칭 목록 (그대로 노출 금지). 첫 항목이 안내 메시지에 쓰인다.
 * @returns {{ok: boolean, message: string}}
 */
export function validateClue(text, { forbiddenNames = [] } = {}) {
  const raw = (text ?? '').trim();
  const noSpace = raw.replace(/\s/g, '');

  if (noSpace.length < 10) {
    return { ok: false, message: '조금만 더 자세히 써 볼까?' };
  }

  const hasFigure = SIMILE_RE.test(raw) || METAPHOR_RE.test(raw);
  if (!hasFigure) {
    return { ok: false, message: "'~처럼', '~같이'를 넣거나 '○○는 △△다'처럼 써 보자." };
  }

  if (forbiddenNames.length) {
    const normalized = normalize(raw);
    const revealed = forbiddenNames.some((name) => name && normalized.includes(normalize(name)));
    if (revealed) {
      return { ok: false, message: `'${forbiddenNames[0]}'이라고 직접 쓰면 바로 들켜! 빗대어 말해 보자.` };
    }
  }

  if (BANNED_WORDS.some((w) => raw.includes(w))) {
    return { ok: false, message: '이런 말은 쓸 수 없어.' };
  }

  return { ok: true, message: '' };
}

/* ---------------- 밥길(사료 코스) 공유 링크 인코딩 ---------------- */
// Supabase 없이 URL 하나로 공유하기 위해 trail 객체를 URL-safe base64로 압축한다.

export function encodeTrail(trail) {
  const json = JSON.stringify(trail);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeTrail(encoded) {
  try {
    let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}
