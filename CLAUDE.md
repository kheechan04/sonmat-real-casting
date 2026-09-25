# 손맛: 리얼 캐스팅 — Claude Code 작업 규칙

웹캠 포즈 인식으로 하는 힐링 낚시 게임 (브라우저, three.js + MediaPipe Pose Landmarker).
전작 Shadow Mitts(`../shadow-mitts`, 웹캠 복싱)의 포즈 파이프라인을 복사해서 시작했다.

## 현재 상태 (2026-09-25 기준)
- **M0 완료, 녹화 13개 분석 끝(2026-09-25).** 축·라벨·fps 결과와 M1 판정 방향 제안은 `docs/VERIFICATION.md`. 사용자가 확인하면 M1 시작.
- 설계서는 `DESIGN.md`(사용자가 별도 Claude 대화에서 만듦, 내용을 고치지 않는다). 확인 결과는 `docs/VERIFICATION.md`.

## 사용자
- **항상 한국어로 답한다.** 기술 용어는 풀어서 설명한다. 숫자 해석을 떠넘기지 말고 녹화를 직접 분석해 결론을 말한다.
- 대 드는 손은 **양손 모두 지원**(설정에서 선택, 좌우 반전으로 검사). 플레이는 **빈손**.

## 처음부터 정한 규칙 (사용자 지시)
1. DESIGN.md §0의 미검증 API·축은 추측으로 코딩하지 않는다. 설치된 `.d.ts`나 실제 실행·녹화로 확인하고 `docs/VERIFICATION.md`에 적는다.
2. 마일스톤은 순서대로(M0→M5). 각 마일스톤이 끝나면 **실행 방법과 "무엇을 확인해야 하는지"를 알려 주고, 사용자 확인 없이 다음으로 넘어가지 않는다.**
3. 미끼 확률·대기시간, 어종 난이도, 동작 인식 임계값은 전부 placeholder — M1부터 한 파일(`src/core/params.ts` 예정)에 모으고
   개발자 슬라이더로 조정 가능하게. 플레이테스트로 사용자와 같이 조정한다.
4. 3D 에셋은 사용자가 사진(라이선스 확인된 것)을 준비할 때까지 **플레이스홀더 지오메트리**(구/캡슐 등)로 로직부터.
5. **M4(내 얼굴 배경 물고기) 시작 전에 DESIGN.md §6 개인정보 체크리스트를 사용자와 다시 확인한다.** 확인 없이 M4 코드를 쓰지 않는다.
6. 인식 로직은 카메라 없이 테스트 가능해야 한다(녹화 JSON + 합성 데이터 단위 테스트).

## 개인정보·보안
- **`recordings/*.json`은 커밋하지 않는다**(.gitignore). `PROCESS_LOG.md`는 `.git/info/exclude`로 로컬 전용 — 사용자가 공개하라고 할 때만.
- 영상·얼굴은 브라우저 밖으로 나가지 않는다. 녹화 파일에는 좌표만. 분석 도구(Analytics 등)를 붙이지 않는다.
- 커밋은 저장소 로컬 git 설정(이름 `HC KIM`, noreply 이메일). 원격 push·배포는 사용자가 요청할 때만.

## 명령
| 명령 | 용도 |
|---|---|
| `npm run dev` | 개발 서버 (http://localhost:5173 — M0 관찰 도구) |
| `npm test` | 단위 테스트 (카메라 불필요) |
| `npm run analyze [-- 파일…] [--mirror] [--rod=left]` | 녹화 분석 보고서 (축·라벨·fps·빠른 동작·원 그리기) |
| `npm run build` | 타입 검사 + 빌드 |

## 헤드리스 확인 (Windows, 전작과 동일)
- 크롬 `C:/Program Files/Google/Chrome/Application/chrome.exe`, `npm i --no-save puppeteer-core`.
- `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`. 먼저 `getUserMedia`를 한 번 열었다 닫고, 버튼은 `element.click()`.
- 개발 모드에서만 `window.__obs`(loadRecording, seekTo, state)가 열려 있다.
- 헤드리스의 GPU는 소프트웨어 GL이라 실제 GPU 성능 확인이 아니다.

## 이 환경의 함정 (전작에서 옮김)
- bash `sed`/heredoc에 백틱·정규식 이스케이프가 섞이면 망가진다 → 긴 수정은 Edit/Write 도구로.
- 마크다운에서 `~`가 한 줄에 두 번이면 삭제선 → `\~`.
- PowerShell 5.1: `&&` 없음.

## 코드 구조
- `src/core/` — DOM 없는 순수 로직(Node 테스트 가능): `pose.ts`(관절 번호), `recording.ts`(녹화 형식), `mirror.ts`(좌우 반전),
  `analysis.ts`(M0 분석), `protocol.ts`(녹화 체크리스트), `oneEuro.ts`(M1에서 쓸 필터)
- `src/app/` — 브라우저: `landmarker.ts`·`poseWorker.ts`(전작 그대로), `observer.ts`(M0 화면), `overlay.ts`, `plots.ts`
- 문체: 사용자용 문서는 "\~해요", 개발 문서는 "\~한다".
