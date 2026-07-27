-- 비유 표현 연습하기 2.0 전용 신규 테이블. 기존 schema.sql의 테이블/정책은 건드리지 않는다.
-- Supabase SQL Editor에서 이 파일 전체를 실행한다.

create table public.practice_sessions (
  id           uuid primary key default gen_random_uuid(),
  nickname     text not null check (char_length(nickname) between 2 and 10),
  school_code  text not null check (char_length(school_code) between 4 and 8),
  mode         int  not null check (mode in (5, 10, 20)),
  total_score  int  not null check (total_score >= 0 and total_score <= 500),
  max_score    int  not null,
  best_answer  text,
  created_at   timestamptz not null default now()
);
create index practice_school_idx on public.practice_sessions (school_code, total_score desc);
create index practice_score_idx  on public.practice_sessions (total_score desc);

create table public.practice_answers (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.practice_sessions(id) on delete cascade,
  question_id text not null,
  answer      text not null check (char_length(answer) between 1 and 300),
  stars       jsonb not null,
  score       int  not null check (score >= 0 and score <= 25),
  created_at  timestamptz not null default now()
);
create index practice_answers_session_idx on public.practice_answers (session_id);

alter table public.practice_sessions enable row level security;
alter table public.practice_answers  enable row level security;
create policy "read all"   on public.practice_sessions for select using (true);
create policy "insert all" on public.practice_sessions for insert with check (true);
create policy "read all"   on public.practice_answers  for select using (true);
create policy "insert all" on public.practice_answers  for insert with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert on public.practice_sessions, public.practice_answers to anon, authenticated;
