-- 「비유 표현 도전하기」 교사 검토 페이지용 추가 컬럼.
-- schema-practice.sql을 먼저 실행한 프로젝트에서, 이 파일을 추가로 SQL Editor에서 실행하세요.
--
-- public_ranking: 학생이 "랭킹에 등록하기"를 눌러 공개 랭킹에 올리는 데 동의했는지 여부.
-- 모든 시도(5/10/20문제, 등록 여부 상관없이)는 항상 저장되어 교사가 검토할 수 있지만,
-- 공개 랭킹(getPracticeRankings)에는 public_ranking = true인 20문제 기록만 노출된다.

alter table public.practice_sessions
  add column if not exists public_ranking boolean not null default false;

create index if not exists practice_public_ranking_idx
  on public.practice_sessions (school_code, public_ranking, total_score desc);
