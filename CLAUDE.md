# 손맛: 리얼 캐스팅 — Claude Code 작업 규칙

웹캠 포즈 인식으로 하는 힐링 낚시 게임 (브라우저, three.js + MediaPipe Pose Landmarker).
전작 Shadow Mitts(`../shadow-mitts`, 웹캠 복싱)의 포즈 파이프라인을 복사해서 시작했다.

## ★ 세션을 시작하면 (2026-09-27부터 — 사용자는 물고기 3D 추가할 때만 Claude Code를 켠다)
**M0~M5 모두 사용자 OK. 남은 일은 사진→3D 물고기 추가뿐.** 사용자가 켜면 먼저 이렇게 알려 준다(한국어):
1. 3D 변환 주소: **https://huggingface.co/spaces/microsoft/TRELLIS.2** (로그인한 브라우저에서. Generate → 미리보기 확인 → Extract GLB → 다운로드)
2. 오늘 할 차례 — 아래 "사진→3D 남은 목록"의 맨 앞부터 4~5마리. 영어 파일 이름으로: 올릴 사진 `assets-src/models/ai-src/<id>.jpg`, 받은 파일 저장 `assets-src/models/raw/<id>.glb`
3. 무료 한도는 GPU가 실제로 일한 시간(하루 몇 분) — 미리보기가 크게 이상하지 않으면 다시 Generate하지 말 것, 설정은 기본값
GLB가 들어오면 "한 마리 처리" 순서대로 끝까지 하고 배포한다(이 작업은 매번 배포까지 해 왔다 — 새 모델이 사이트에 안 보이면 사용자가 헷갈림).

## 현재 상태 (2026-09-27 기준)
- **M0 완료. M1 기본 루프 → 첫 피드백 반영해 M1.5(디자인·UI 고급화, 3D 물·데크+먼 풍경 사진, 릴링 속도 방식, 차고 나가기 밀당, 새 미끼, 효과음) 구현, 가까이 선 자세 확인 완료(F1~F4), 효과 과장 반영 → 사용자 OK.
  M2(장소 4곳·어종 30종(2026-09-26 46종으로)·훼방 이벤트·도감·코드 생성 3D 모델) → 사용자 OK. 이어서 대기 단축·전설 상향·어종별 행동·동물 품질·배포 준비 → 피드백으로 릴링 길이 재조정(전설 약 50초)·심해 캐스팅 거리 수정 → 릴링을 줄 길이(m)로·버벅임 수정·**실사 물고기 18종**(ffish.asia 스캔 등, 나머지 11종은 사진→3D 생성 대기).
  **M3는 사용자 결정으로 "몸으로 하는 낚시"(포인트 공략 + 로드워크·버티기; 펌핑은 해 보고 사용자 결정으로 제거)로 변경(2026-09-26, DECISIONS.md) → 펌핑·바닥에 붙기 제거, 규칙은 "빨간 ✋ 감지 마요!면 멈춤, 옆으로 가면 버티기" → **M3 사용자 OK(2026-09-26).** M4는 사용자 결정으로 "낚을 수 있는 인면어"(얼굴 등록 시 입질 5%)로 변경, 체크리스트 확인 후 구현, 얼굴 촬영·붙이기 다듬기 → **M4 사용자 OK(2026-09-26).** M5(시간대·전자찌·소리·결과 카드·기념사진·PWA) → **M5 사용자 OK(2026-09-27). 설계서 마일스톤 전부 완료.** 이후 어종 46종·첫 화면 정지 사진·빌드 경고 정리. Vercel 배포 중(main push = 자동 배포).** 모델 갤러리: `/models.html`.**
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
- **인면어 얼굴 사진은 IndexedDB(`src/app/face.ts`)에만** — localStorage·URL·네트워크 금지. 소스에 네트워크 API를 쓰지 않는다(`tests/privacy.test.ts`), 게임 페이지 CSP의 허용 호스트를 늘릴 땐 이유를 docs/PRIVACY.md에 적는다.
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

## 사진→3D 남은 목록 (사용자와 정한 순서 — 자주 보이는데 어색한 것부터, 만들기 어려운 모양은 뒤로)
완료: tilapia(2026-09-25), bichir·alfonsino(2026-09-27), elephantfish·vundu(2026-09-28), blobfish(2026-09-29), electric_catfish(2026-09-30), tigerfish·sunfish(2026-10-03), dumbo·vampire_squid(2026-10-04 — 텍스처가 잘게 쪼개져 줄이면 찢어짐 → build-fish.mjs TORN으로 꼭짓점 색에 구움. 원래 CC-BY 모델은 `raw/_backup/*_sketchfab_built.glb`), marlin(2026-10-05).
시도 후 유지: gulper(2026-09-30 — 사진이 죽은 표본이라 아래턱이 몸에서 떨어져 늘어지고 꼬리가 몸 밑으로 말려 생성됨 → CC-BY 모델 유지, 결과는 `raw/_backup/gulper_trellis.glb`. 입 다문 살아 있는 사진이 생기면 재시도).
남은 4종, 이 순서대로:
| 순서 | id (파일 이름) | 어종 | 지금 모델 | 원본 사진 라이선스 |
|---|---|---|---|---|
| 8 | goblin_shark | 귀신고기 | 코드 | CC BY 3.0 AU Dianne Bray / Museum Victoria → 크레딧 필요 |
| 9 | barreleye | 투명머리 물고기 | 코드 | CC BY 4.0 Hlidberg·Hjørne → 크레딧 필요 (투명한 머리 — 결과 확인) |
| 10 | oarfish | 산갈치 | 코드 | CC BY 3.0 Sandstein → 크레딧 필요 (긴 리본 — 어려움) |
| 11 | giant_squid | 대왕오징어 | CC-BY 모델(mvick13497) | CC BY 4.0 Museums Victoria → 크레딧 필요 (촉수 — 어려움) |
결과가 지금 모델보다 못하면 지금 모델을 유지하고 사용자에게 말한다(특히 CC-BY 모델이 있는 giant_squid).
줄인 모델에 얼룩(검정·은색 반점)이나 각진 덩어리가 보이면 원본(raw)부터 확인 — 원본이 멀쩡하면 build-fish.mjs의 TORN에 id를 넣는다.

### 한 마리 처리 (GLB가 raw 폴더에 들어오면)
1. `node scripts/build-fish.mjs <id>` (게임용으로 줄이기)
2. 방향: `getBounds`로 긴 축 확인 → `src/app/fishAssets.ts` MODELS에 rot 추가. TRELLIS.2 출력은 보통 머리 ±z(tilapia·alfonsino)나 ±x(bichir) — 머리가 +x(오른쪽)이어야 한다.
   갤러리 `/models.html?only=<id>,tilapia` 헤드리스 캡처로 확인(개발 서버, gal.mjs 방식). 비슷한 색이 필요하면 tint.
3. `docs/ASSETS.md` 해당 어종 행을 "TRELLIS.2 ← 사진(ai-sources.json의 title·page·artist·lic)"으로 교체.
   CC-BY 사진이면 index.html 도움말 크레딧에 추가, 교체된 CC-BY Sketchfab 모델의 크레딧은 뺀다(index.html·README·포트폴리오 자료 출처).
4. 이 표에서 완료로 옮기고, `npx vitest run` → 커밋 → push(= 배포) → 실제 주소에서 `models.html?only=<id>` 확인.
5. 여러 마리 끝나면 포트폴리오(../kheechan04.github.io/sonmat-real-casting)의 "사진 기반 3D N종" 숫자·남은 일 갱신 후 push.
- 한도가 차면 남은 건 다음 세션으로. `scripts/trellis.py`(스크립트 호출)는 계정 한도가 적용되지 않아 쓰지 않는다 — 브라우저에서 사용자가 생성.

## 배포
- 배포: https://sonmat-real-casting.vercel.app — 사용자가 Vercel에 GitHub 저장소(https://github.com/kheechan04/sonmat-real-casting)를 연결해 둠(2026-09-26), `main` push → 자동 배포. push는 사용자가 요청할 때만.
- PWA: `public/manifest.webmanifest`, `public/icons/`, `public/sw.js`(빌드판에서만 등록). 캐시 이름 `sonmat-v1` — 워커 동작을 바꾸면 버전을 올린다. 워커 규칙은 `tests/privacy.test.ts`가 검사.
- 링크 미리보기 이미지 `public/og.jpg`를 바꾸면 index.html og:image의 `?v=` 숫자를 올린다(지금 v=2) — 메신저가 같은 주소의 미리보기를 며칠씩 저장해 둠. 카카오톡은 카카오 공유 디버거에서 캐시 초기화.
- 배포판에선 ⚙ 패널·키보드 입력·`window.__game`이 꺼진다 (`?dev`, `?keys`로 켬).
- 배경 원본 8K JPG는 `assets-src/env/`(배포 안 함), 게임은 `public/env/*_top.webp`.

## 헤드리스 확인 (Windows, 전작과 동일)
- 크롬 `C:/Program Files/Google/Chrome/Application/chrome.exe`, `npm i --no-save puppeteer-core`.
- `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`. 먼저 `getUserMedia`를 한 번 열었다 닫고, 버튼은 `element.click()`.
- 빌드판에서 자동화 브라우저(navigator.webdriver, 퍼페티어 포함)는 3D를 켜지 않는다(Vercel 스크린샷용) — 빌드판 3D 확인은 주소에 `?3d`.
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
