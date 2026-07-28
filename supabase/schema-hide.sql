-- 버튼3 「사료 숨기기 / 사료 찾기」 — 같은 학교 코드 친구들끼리 사료 길 공유
-- Supabase 프로젝트의 SQL Editor에 그대로 붙여넣어 실행하세요.
-- (기존 rooms/notes/room_plays 테이블은 이전 설계의 흔적으로 이 기능에서 더 이상 쓰지 않습니다.)

create table public.hide_trails (
  id           uuid primary key default gen_random_uuid(),
  school_code  text not null check (char_length(school_code) between 4 and 8),
  creator      text not null,
  title        text not null check (char_length(title) between 1 and 30),
  route_count  int  not null check (route_count between 2 and 5),
  stops        jsonb not null,
  created_at   timestamptz not null default now()
);
create index hide_trails_school_idx on public.hide_trails (school_code, created_at desc);

alter table public.hide_trails enable row level security;

create policy "read all"   on public.hide_trails for select using (true);
create policy "insert all" on public.hide_trails for insert with check (true);

-- 주의: update/delete 정책은 만들지 않습니다(학생이 남의 길을 지울 수 없게).

grant usage on schema public to anon, authenticated;
grant select, insert on public.hide_trails to anon, authenticated;
