# 손맛: 리얼 캐스팅 — Claude Code 작업 규칙

웹캠 포즈 인식으로 하는 힐링 낚시 게임 (브라우저, three.js + MediaPipe Pose Landmarker).
전작 Shadow Mitts(`../shadow-mitts`, 웹캠 복싱)의 포즈 파이프라인을 복사해서 시작했다.

## 현재 상태 (2026-09-25 기준)
- **M0 완료. M1 기본 루프 → 첫 피드백 반영해 M1.5(디자인·UI 고급화, 3D 물·데크+먼 풍경 사진, 릴링 속도 방식, 차고 나가기 밀당, 새 미끼, 효과음) 구현, 가까이 선 자세 확인 완료(F1~F4), 효과 과장 반영 → 사용자 OK.
  M2(장소 4곳·어종 30종·훼방 이벤트·도감·코드 생성 3D 모델) → 사용자 OK. 이어서 대기 단축·전설 상향·어종별 행동·동물 품질·배포 준비 → 피드백으로 릴링 길이 재조정(전설 약 50초)·심해 캐스팅 거리 수정 → 릴링을 줄 길이(m)로·버벅임 수정·**실사 물고기 18종**(ffish.asia 스캔 등, 나머지 11종은 사진→3D 생성 대기), 사용자 확인 대기(2026-09-25). 모델 갤러리: `/models.html`.**
  안내 `docs/PLAYTEST.md`, 바뀐 결정 `docs/DECISIONS.md`, 외부 에셋 출처 `docs/ASSETS.md`(새 사진·파일을 쓰면 반드시 기록).
- 설계서는 `DESIGN.md`(사용자가 별도 Claude 대화에서 만듦, 내용을 고치지 않는다). 확인 결과는 `docs/VERIFICATION.md`.

## 사용자
- **항상 한국어로 답한다.** 기술 용어는 풀어서 설명한다. 숫자 해석을 떠넘기지 말고 녹화를 직접 분석해 결론을 말한다.
- 대 드는 손은 **양손 모두 지원**(설정에서 선택, 좌우 반전으로 검사). 플레이는 **빈손**.

## 처음부터 정한 규칙 (사용자 지시)
1. DESIGN.md §0의 미검증 API·축은 추측으로 코딩하지 않는다. 설치된 `.d.ts`나 실제 실행·녹화로 확인하고 `docs/VERIFICATION.md`에 적는다.
2. 마일스톤은 순서대로(M0→M5). 각 마일스톤이 끝나면 **실행 방법과 "무엇을 확인해야 하는지"를 알려 주고, 사용자 확인 없이 다음으로 넘어가지 않는다.**
3. 미끼 확률·대기시간, 어종 난이도, 동작 인식 임계값은 전부 placeholder — 한 파일(`src/core/params.ts`)에 모으고
   개발자 슬라이더로 조정 가능하게. 플레이테스트로 사용자와 같이 조정한다.
4. 3D 에셋은 사용자가 사진(라이선스 확인된 것)을 준비할 때까지 **플레이스홀더 지오메트리**(구/캡슐 등)로 로직부터.
5. **M4(내 얼굴 배경 물고기) 시작 전에 DESIGN.md §6 개인정보 체크리스트를 사용자와 다시 확인한다.** 확인 없이 M4 코드를 쓰지 않는다.
6. 인식 로직은 카메라 없이 테스트 가능해야 한다(녹화 JSON + 합성 데이터 단위 테스트).

## 개인정보·보안
- **`recordings/*.json`은 커밋하지 않는다**(.gitignore). `PROCESS_LOG.md`는 `.git/info/exclude`로 로컬 전용 — 사용자가 공개하라고 할 때만.
- 외부 사진·에셋은 CC0/CC-BY/직접 촬영만, `docs/ASSETS.md`에 출처·라이선스를 적는다 (DESIGN.md §4.1).
- 영상·얼굴은 브라우저 밖으로 나가지 않는다. 녹화 파일에는 좌표만. 분석 도구(Analytics 등)를 붙이지 않는다.
- 커밋은 저장소 로컬 git 설정(이름 `HC KIM`, noreply 이메일). 원격 push·배포는 사용자가 요청할 때만.

## 명령
| 명령 | 용도 |
|---|---|
| `npm run dev` | 개발 서버 (http://localhost:5173 게임, `/observe.html` M0 관찰 도구) |
| `npm test` | 단위 테스트 (카메라 불필요) |
| `npm run analyze [-- 파일…] [--mirror] [--rod=left]` | 녹화 분석 보고서 (축·라벨·fps·빠른 동작·원 그리기) |
| `npm run build` | 타입 검사 + 빌드 |
| `node scripts/fetch-models.mjs` → `node scripts/build-fish.mjs` | 물고기 3D 받기(Sketchfab 토큰 `%USERPROFILE%\.sketchfab-token`) → 게임용으로 줄이기 (docs/ASSETS.md) |
| `python scripts/trellis.py 사진 출력.glb` | 사진 → 3D (TRELLIS.2 무료 데모, 하루 사용량 제한) |
| `node scripts/make-backdrops.mjs` | 배경 원본(`assets-src/env/*.jpg`) → 물가선 위만 WebP(`public/env/*_top.webp`) |

## 실사 물고기 남은 작업 (하루 몇 마리씩)
- 사진→3D 대기 11종: sunfish, marlin, alfonsino, blobfish, oarfish, goblin_shark, barreleye, elephantfish, vundu, electric_catfish, tigerfish.
  원본 사진 `assets-src/models/ai-src/<id>.jpg` (출처 `assets-src/models/ai-sources.json`).
- 한 마리: `python scripts/trellis.py assets-src/models/ai-src/<id>.jpg assets-src/models/raw/<id>.glb` → `node scripts/build-fish.mjs <id>`
  → `src/app/fishAssets.ts` MODELS에 방향(rot) 추가 → 모델 갤러리에서 확인 → docs/ASSETS.md 표에 출처 추가(CC-BY 사진이면 도움말 크레딧에도).
- 무료 GPU 사용량: HF 토큰(`%USERPROFILE%\.hf-token`)이 있으면 하루 5분(4\~5마리), 없으면 2분. 쓴 뒤 24시간 후 다시 채워짐.

## 배포
- 배포 준비 완료: Vercel 정적 사이트(`vercel.json`, `npm run build` → `dist`), `README.md`. GitHub 공개 저장소 https://github.com/kheechan04/sonmat-real-casting (`origin`, 2026-09-25 생성). **Vercel 연결은 아직 — 사용자 요청 시.** push도 사용자가 요청할 때만.
- 배포판에선 ⚙ 패널·키보드 입력·`window.__game`이 꺼진다 (`?dev`, `?keys`로 켬).
- 배경 원본 8K JPG는 `assets-src/env/`(배포 안 함), 게임은 `public/env/*_top.webp`.

## 헤드리스 확인 (Windows, 전작과 동일)
- 크롬 `C:/Program Files/Google/Chrome/Application/chrome.exe`, `npm i --no-save puppeteer-core`.
- `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`. 먼저 `getUserMedia`를 한 번 열었다 닫고, 버튼은 `element.click()`.
- 개발 모드에서만 `window.__obs`(관찰 도구)·`window.__game`(game, params, tracker, start, source)이 열려 있다.
- 게임은 개발 모드나 `?keys`에서 키보드 대체 입력: C 던지기 · H 챔질 · R(누르고 있기) 감기. "카메라 없이 시작" 버튼도 이때만 보인다.
- 헤드리스의 GPU는 소프트웨어 GL이라 실제 GPU 성능 확인이 아니다.
- `npm install`을 하면 `--no-save`로 깐 puppeteer-core가 지워진다 → 다시 설치.

## 이 환경의 함정 (전작에서 옮김)
- bash `sed`/heredoc에 백틱·정규식 이스케이프가 섞이면 망가진다 → 긴 수정은 Edit/Write 도구로.
- 마크다운에서 `~`가 한 줄에 두 번이면 삭제선 → `\~`.
- PowerShell 5.1: `&&` 없음.

## 코드 구조
- `src/core/` — DOM 없는 순수 로직(Node 테스트 가능): `species.ts`(장소·어종·미끼·이벤트 표), `params.ts`(인식 기준·전체 배율), `gestures.ts`(실시간 캐스팅·챔질·릴링 인식),
  `game.ts`(낚시 상태 기계, 릴링은 속도로 채움, 차고 나가기), `pose.ts`, `recording.ts`, `mirror.ts`, `analysis.ts`(M0 분석), `protocol.ts`(녹화 체크리스트)
- `src/app/` — 브라우저: `main.ts`(게임 페이지), `scene.ts`(three.js: 먼 풍경 사진+HDR 조명, 3D 물(Water)·데크·소품, 휘는 대, 찌, 임시 물고기), `sfx.ts`(합성 효과음), `fishModels.ts`(코드로 만든 어종 모델 — 실사 모델이 없을 때), `fishAssets.ts`(실사 glb 불러오기·방향 맞추기·헤엄 셰이더), `animals.ts`(훼방 동물), `gallery.ts`(models.html), `tuning.ts`(⚙ 슬라이더), `poseSource.ts`(카메라+추론, 공용),
  `observer.ts`(M0 관찰 도구), `overlay.ts`, `plots.ts`, `landmarker.ts`·`poseWorker.ts`(전작 그대로)
- 테스트: `tests/game.test.ts`(게임 흐름), `tests/recordings.test.ts`(사용자 녹화로 30/15fps 인식 개수 고정 — 파일 없으면 건너뜀)
- 문체: 사용자용 문서는 "\~해요", 개발 문서는 "\~한다".
