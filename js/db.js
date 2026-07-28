// Supabase 접점. 화면 스크립트는 이 파일을 통해서만 DB에 접근한다.
// 모든 함수는 {data, error} 형태로 반환하며, 실패해도 예외를 던지지 않는다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function wrap(promise) {
  return promise
    .then(({ data, error }) => ({ data, error: error ? error.message : null }))
    .catch((err) => ({ data: null, error: err?.message || String(err) }));
}

/* ---------------- 랭킹 ---------------- */

export function saveRanking({ nickname, school_code, score, correct_count, total_count }) {
  return wrap(
    supabase.from('rankings').insert({
      nickname, school_code, score, correct_count, total_count
    }).select().single()
  );
}

export async function getRankings({ school_code = null, limit = 20 } = {}) {
  let query = supabase
    .from('rankings')
    .select('*')
    .order('score', { ascending: false })
    .limit(500); // 닉네임당 최고점만 남기기 전 넉넉히 가져온다

  if (school_code) query = query.eq('school_code', school_code);

  const { data, error } = await wrap(query);
  if (error) return { data: null, error };

  // 같은 닉네임은 최고점 1건만
  const best = new Map();
  for (const row of data) {
    const key = row.nickname;
    if (!best.has(key) || best.get(key).score < row.score) best.set(key, row);
  }
  const ranked = [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { data: ranked, error: null };
}

/* ---------------- 고양이 이름 짓기 ---------------- */

export function saveCatName({ nickname, school_code, vehicle, name }) {
  return wrap(
    supabase.from('cat_names').insert({ nickname, school_code, vehicle, name }).select().single()
  );
}

export function getCatNames(school_code) {
  return wrap(
    supabase
      .from('cat_names')
      .select('*')
      .eq('school_code', school_code)
      .order('created_at', { ascending: false })
  );
}

/* ---------------- 쪽지 방 ---------------- */

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동되는 0/O, 1/I 제외
  let code = '';
  for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createRoom({ school_code, creator_nickname, background, notes }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const room_code = generateRoomCode();
    const { data: room, error: roomError } = await wrap(
      supabase.from('rooms').insert({
        room_code,
        school_code,
        creator_nickname,
        background,
        note_count: notes.length
      }).select().single()
    );

    if (roomError) {
      if (roomError.includes('duplicate') || roomError.includes('unique')) continue; // 코드 충돌 시 재시도
      return { data: null, error: roomError };
    }

    const notesPayload = notes.map((n, i) => ({
      room_id: room.id,
      order_index: i + 1,
      x: n.x,
      y: n.y,
      hint: n.hint,
      message: n.message
    }));

    const { error: notesError } = await wrap(supabase.from('notes').insert(notesPayload));
    if (notesError) return { data: null, error: notesError };

    return { data: room, error: null };
  }
  return { data: null, error: '방 코드 생성에 반복 실패했습니다. 다시 시도해주세요.' };
}

export function getRoomsBySchool(school_code) {
  return wrap(
    supabase
      .from('rooms')
      .select('*')
      .eq('school_code', school_code)
      .order('created_at', { ascending: false })
  );
}

export async function getRoomByCode(room_code) {
  const { data: room, error: roomError } = await wrap(
    supabase.from('rooms').select('*').eq('room_code', room_code.toUpperCase()).single()
  );
  if (roomError) return { data: null, error: roomError };

  const { data: notes, error: notesError } = await wrap(
    supabase.from('notes').select('*').eq('room_id', room.id).order('order_index', { ascending: true })
  );
  if (notesError) return { data: null, error: notesError };

  return { data: { ...room, notes }, error: null };
}

/* ---------------- 방 클리어 기록 ---------------- */

export function savePlay({ room_id, nickname, elapsed_seconds, attempts }) {
  return wrap(
    supabase.from('room_plays').insert({ room_id, nickname, elapsed_seconds, attempts }).select().single()
  );
}

export function getRoomLeaderboard(room_id, limit = 10) {
  return wrap(
    supabase
      .from('room_plays')
      .select('*')
      .eq('room_id', room_id)
      .order('elapsed_seconds', { ascending: true })
      .limit(limit)
  );
}

/* ---------------- 비유 표현 연습하기 (practice 2.0) ---------------- */

export async function savePracticeSession({ nickname, school_code, mode, total_score, max_score, best_answer, answers, public_ranking = false }) {
  const { data: session, error: sessionError } = await wrap(
    supabase.from('practice_sessions').insert({
      nickname, school_code, mode, total_score, max_score, best_answer, public_ranking
    }).select().single()
  );
  if (sessionError) return { data: null, error: sessionError };

  if (Array.isArray(answers) && answers.length) {
    const answersPayload = answers.map(a => ({
      session_id: session.id,
      question_id: a.question_id,
      answer: a.answer,
      stars: a.stars,
      score: a.score
    }));
    const { error: answersError } = await wrap(supabase.from('practice_answers').insert(answersPayload));
    if (answersError) return { data: session, error: answersError };
  }

  return { data: session, error: null };
}

/* ---------------- 비유 표현 도전하기 — 교사 검토 ---------------- */

export function getTeacherPracticeSessions(school_code) {
  return wrap(
    supabase
      .from('practice_sessions')
      .select('*, practice_answers(*)')
      .eq('school_code', school_code)
      .order('created_at', { ascending: false })
      .limit(500)
  );
}

/* ---------------- 사료 숨기기 / 사료 찾기 (버튼3, 학교코드 공유) ---------------- */

export function saveHideTrail({ school_code, creator, title, route_count, stops }) {
  return wrap(
    supabase.from('hide_trails').insert({
      school_code, creator, title, route_count, stops
    }).select().single()
  );
}

export function getHideTrailsBySchool(school_code) {
  return wrap(
    supabase
      .from('hide_trails')
      .select('*')
      .eq('school_code', school_code)
      .order('created_at', { ascending: false })
      .limit(100)
  );
}

export async function getPracticeRankings({ school_code = null, limit = 20 } = {}) {
  let query = supabase
    .from('practice_sessions')
    .select('*')
    .eq('mode', 20)
    .eq('public_ranking', true)
    .order('total_score', { ascending: false })
    .limit(500);

  if (school_code) query = query.eq('school_code', school_code);

  const { data, error } = await wrap(query);
  if (error) return { data: null, error };

  const best = new Map();
  for (const row of data) {
    const key = row.nickname;
    if (!best.has(key) || best.get(key).total_score < row.total_score) best.set(key, row);
  }
  const ranked = [...best.values()]
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, limit);

  return { data: ranked, error: null };
}
