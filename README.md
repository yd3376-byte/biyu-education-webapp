# 내일을 찾아서 — 비유 표현 교육용 웹앱

초등 5학년 국어 '비유하는 표현' 단원을 위한 정적 웹앱입니다. 로그인 없이 닉네임과 학교 코드만으로
세 가지 활동(스토리 방탈출 / 비유 표현 연습 / 쪽지 숨기기)을 진행할 수 있습니다.

## 1. 로컬에서 실행해보기

빌드 도구가 필요 없는 순수 HTML/CSS/JS 프로젝트지만, ES 모듈과 `fetch()`로 JSON을 불러오기 때문에
`file://`로 직접 열면 동작하지 않습니다. 아무 정적 서버로 열어야 합니다.

```bash
# 프로젝트 폴더에서
python -m http.server 8080
# 이후 브라우저에서 http://localhost:8080 접속
```

또는 VSCode의 "Live Server" 확장을 사용해도 됩니다.

## 2. Supabase 설정

랭킹, 고양이 이름, 쪽지 방 기능은 Supabase(PostgreSQL)를 사용합니다. 아래 순서대로 설정하세요.

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다.
2. 프로젝트의 **SQL Editor**를 열고 `supabase/schema.sql` 파일 전체 내용을 붙여넣어 실행합니다.
   (테이블 5개 생성 + RLS 정책까지 한 번에 적용됩니다.)
3. 프로젝트 설정의 **API** 메뉴에서 `Project URL`과 `anon public` 키를 복사합니다.
4. `js/config.js` 파일을 열어 아래 두 값을 교체합니다.

   ```js
   export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
   export const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
   ```

`anon` 키는 공개되어도 안전하지만, 반드시 `schema.sql`의 RLS(Row Level Security) 정책이
켜진 상태로 배포해야 합니다. update/delete 정책은 의도적으로 만들지 않았습니다(학생이 서로의
기록을 지울 수 없도록). 잘못 등록된 데이터는 교사가 Supabase 대시보드에서 직접 삭제합니다.

`config.js`를 아직 채우지 않아도 앱 자체는 정상 동작합니다. 랭킹/이름/방 저장·조회만
실패하고, 그때마다 화면 하단에 안내(토스트)가 뜨며 게임은 계속 진행됩니다.

## 3. GitHub Pages 배포

1. 이 폴더 전체를 GitHub 저장소에 커밋·푸시합니다(빌드 과정이 없으므로 파일 그대로 올리면 됩니다).
2. 저장소 **Settings > Pages**에서 배포 브랜치와 루트(`/`)를 지정합니다.
3. 배포된 주소(`https://<계정>.github.io/<저장소>/`)를 학생들에게 공유합니다.
4. 교사용 화면(`names.html`)이나 쪽지 방 공유 링크(`hide.html?room=코드`)도 같은 도메인 아래에서
   그대로 동작합니다.

## 4. 교사가 콘텐츠를 수정하려면

모든 대사·문제·안내 문구는 `data/*.json`에 있습니다. 코드를 건드리지 않고 아래 파일만
수정하면 됩니다.

| 파일 | 내용 |
|---|---|
| `data/story.json` | 「내일을 찾아서」의 대사, 5라운드 문제/정답, 오답 반응, 결말, 이름짓기 문구 |
| `data/questions.json` | 「비유 표현 연습하기」의 40문항 문제은행 |
| `data/places.json` | 장소별 이름/색상/이모지 (배경 이미지가 없을 때 대체 화면에 사용) |

## 5. 배경 이미지 추가하기

`assets/bg/` 폴더에 아래 파일명으로 이미지를 넣으면 코드 수정 없이 자동으로 적용됩니다.
이미지가 없는 장소는 `data/places.json`의 색상 + 이모지로 만든 그라디언트 화면이 대신 보입니다.

```
assets/bg/classroom.png
assets/bg/gym.png
assets/bg/library.png
assets/bg/playground.png
assets/bg/ground.png
assets/bg/cafeteria.png
assets/bg/garden.png
```

## 6. 이번 버전에서 제외된 기능

- AI 자동 채점 (정적 사이트에서 API 키가 노출되므로 제외. 필요 시 Supabase Edge Function으로 분리 검토)
- 교사용 관리자 페이지 / 방 삭제 기능 (Supabase 대시보드에서 직접 관리)
- 사운드 파일(매미 소리·발소리) — 텍스트와 시각 연출로 대체
- 학급별 진도 통계 대시보드
