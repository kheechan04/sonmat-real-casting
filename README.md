# 손맛: 리얼 캐스팅

웹캠 앞에서 **몸으로 던지고, 채고, 감는** 낚시 게임이에요. 설치 없이 브라우저에서 바로 할 수 있어요.

- **던지기** — 대 든 손을 머리 뒤로 젖혔다가 앞으로 휙
- **챔질** — 찌가 움직이면 손을 빠르게 위로 "툭"
- **감기** — 반대 손으로 릴을 돌리듯 작은 원을 계속. 물고기가 차고 나가면 잠깐 멈춰요

저수지·바다·심해·아프리카 강에서 30종을 낚아 도감을 채워요. 백상아리, 귀상어, 청새치, 심해아귀, 귀신고기, 산갈치,
골리앗 타이거피시, 나일퍼치, 황쏘가리… 그리고 아주 가끔 수달·범고래·악어·하마가 끼어들어요.

## 준비물

- 웹캠이 달린 PC, 크롬 또는 엣지
- **배꼽 위 상반신**이 화면에 들어오게 서기 (1.5m쯤). 빈손으로 해요
- 밝은 방이 좋아요 (어두우면 웹캠이 느려져요)

## 개인정보

카메라 영상은 **이 브라우저 안에서만** 처리되고 어디에도 전송되지 않아요. 포즈 인식(MediaPipe)도 브라우저 안에서 돌아요.
기록(도감·최고 기록)은 이 브라우저에만 저장돼요.

## 직접 실행하기

```
npm install
npm run dev        # http://localhost:5173
npm test           # 인식·게임 규칙 테스트 (카메라 불필요)
npm run build      # dist/ 에 배포용 파일
```

`/observe.html` 관절 좌표 관찰 도구, `/models.html` 어종 모델 갤러리, 주소 뒤 `?dev` 설정값 패널(⚙).

## 만든 것들 · 출처

- 포즈 인식: [MediaPipe Pose Landmarker](https://developers.google.com/mediapipe) (Apache 2.0) · 3D: [three.js](https://threejs.org) (MIT)
- 배경 360° 사진·HDR, 나무판·바위 텍스처, 의자·양동이·풀 모델: [Poly Haven](https://polyhaven.com) (**CC0**) — 파일별 작가는 `docs/ASSETS.md`
- 물결 텍스처: three.js 예제 (MIT) · 글꼴: [Pretendard](https://github.com/orioncactus/pretendard) (OFL)
- 물고기·동물 모델, 효과음은 모두 코드로 만들었어요

설계서 `DESIGN.md`, 결정 기록 `docs/DECISIONS.md`, 인식 검증 `docs/VERIFICATION.md`.
