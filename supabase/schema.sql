-- 비유 표현 교육용 웹앱 — Supabase 스키마
-- Supabase 프로젝트의 SQL Editor에 그대로 붙여넣어 실행하세요.

-- ============ 1. 비유 연습 랭킹 ============
create table public.rankings (
  id            uuid primary key default gen_random_uuid(),
  nickname      text not null check (char_length(nickname) between 2 and 10),
  school_code   text not null check (char_length(school_code) between 4 and 8),
  score         int  not null check (score >= 0 and score <= 5000),
  correct_count int  not null default 0,
  total_count   int  not null default 10,
  created_at    timestamptz not null default now()
);
create index rankings_school_score_idx on public.rankings (school_code, score desc);
create index rankings_score_idx on public.rankings (score desc);

-- ============ 2. 고양이 이름 짓기 (버튼1 산출물) ============
create table public.cat_names (
  id          uuid primary key default gen_random_uuid(),
  nickname    text not null,
  school_code text not null,
  vehicle     text not null check (char_length(vehicle) between 2 and 60), -- "해가 지기 직전의 구름"
  name        text not null check (char_length(name) between 1 and 8),     -- "노을"
  created_at  timestamptz not null default now()
);
create index cat_names_school_idx on public.cat_names (school_code, created_at desc);

-- ============ 3. 쪽지 방 ============
create table public.rooms (
  id               uuid primary key default gen_random_uuid(),
  room_code        text not null unique check (char_length(room_code) = 6),
  school_code      text not null,
  creator_nickname text not null,
  background       text not null,  -- classroom | gym | library | playground | ground
  note_count       int  not null check (note_count between 3 and 5),
  created_at       timestamptz not null default now()
);
create index rooms_school_idx on public.rooms (school_code, created_at desc);

-- ============ 4. 숨긴 쪽지 ============
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  order_index int  not null check (order_index between 1 and 5),
  x           numeric not null check (x >= 0 and x <= 1),
  y           numeric not null check (y >= 0 and y <= 1),
  hint        text not null check (char_length(hint) between 8 and 120),
  message     text not null check (char_length(message) between 1 and 60)
);
create index notes_room_idx on public.notes (room_id, order_index);

-- ============ 5. 방 클리어 기록 ============
create table public.room_plays (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.rooms(id) on delete cascade,
  nickname        text not null,
  elapsed_seconds int not null check (elapsed_seconds >= 0),
  attempts        int not null default 0,
  created_at      timestamptz not null default now()
);
create index room_plays_room_idx on public.room_plays (room_id, elapsed_seconds asc);

-- ============ RLS: 읽기·쓰기만 허용, 수정·삭제 불가 ============
alter table public.rankings   enable row level security;
alter table public.cat_names  enable row level security;
alter table public.rooms      enable row level security;
alter table public.notes      enable row level security;
alter table public.room_plays enable row level security;

create policy "read all"   on public.rankings   for select using (true);
create policy "insert all" on public.rankings   for insert with check (true);
create policy "read all"   on public.cat_names  for select using (true);
create policy "insert all" on public.cat_names  for insert with check (true);
create policy "read all"   on public.rooms      for select using (true);
create policy "insert all" on public.rooms      for insert with check (true);
create policy "read all"   on public.notes      for select using (true);
create policy "insert all" on public.notes      for insert with check (true);
create policy "read all"   on public.room_plays for select using (true);
create policy "insert all" on public.room_plays for insert with check (true);

-- 주의: update/delete 정책은 만들지 않습니다(학생이 남의 기록을 지울 수 없게).
-- 교사는 Supabase 대시보드에서 직접 관리합니다.

-- ============ 권한 부여 (RLS만으로는 부족, 테이블 단위 GRANT가 먼저 필요) ============
grant usage on schema public to anon, authenticated;
grant select, insert on public.rankings, public.cat_names, public.rooms, public.notes, public.room_plays
  to anon, authenticated;
