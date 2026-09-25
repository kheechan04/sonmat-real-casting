# 외부 에셋 출처·라이선스

DESIGN.md §4.1: 공개·배포 전에 모든 사진의 출처와 라이선스를 이 표에 기록한다. CC0 / CC-BY 또는 직접 촬영한 것만 쓴다.

| 파일 | 내용 | 출처 | 작가 | 라이선스 | 받은 날 |
|---|---|---|---|---|---|
| `public/env/bell_park_pier.jpg` | 배경 360° 사진 (8192×4096, 톤매핑 JPG) | [Poly Haven — Bell Park Pier](https://polyhaven.com/a/bell_park_pier) | Greg Zaal | CC0 (출처 표기 의무 없음, 화면 아래에 표기함) | 2026-09-25 |
| `public/env/bell_park_pier_1k.hdr` | 같은 장소 HDR (1k) — 3D 물체 조명용 | 위와 같음 | Greg Zaal | CC0 | 2026-09-25 |
| `public/tex/waternormals.jpg` | 물결 노멀맵 (움직이는 물 표면) | [three.js 저장소 r186 examples/textures](https://github.com/mrdoob/three.js/tree/r186/examples/textures) | three.js authors | MIT | 2026-09-25 |
| `public/tex/weathered_planks_*_1k.jpg` | 데크 나무판 (색·노멀·거칠기) | [Poly Haven — Weathered Planks](https://polyhaven.com/a/weathered_planks) | Dimitrios Savva, Dario Barresi | CC0 | 2026-09-25 |
| `public/models/folding_wooden_stool/` | 접이식 나무 의자 (glTF 1k) | [Poly Haven — Folding Wooden Stool](https://polyhaven.com/a/folding_wooden_stool) | Ulan Cabanilla | CC0 | 2026-09-25 |
| `public/models/wooden_bucket_01/` | 나무 양동이 (glTF 1k) | [Poly Haven — Wooden Bucket 01](https://polyhaven.com/a/wooden_bucket_01) | James Ray Cock | CC0 | 2026-09-25 |
| `public/models/grass_medium_02/` | 물가 풀 (glTF 1k) | [Poly Haven — Grass Medium 02](https://polyhaven.com/a/grass_medium_02) | Rico Cilliers | CC0 | 2026-09-25 |

배경 사진의 물 부분(물가선 아래, 2036/4096행)은 코드에서 물가선 위 풍경을 뒤집어 채운다 (`scene.ts` `mirroredBackdrop`) — 3D 물이 사진 속 밝은 물을 비춰 수평선 아래에 띠가 생겼기 때문.

같은 장소의 새벽 버전 [Bell Park Dawn](https://polyhaven.com/a/bell_park_dawn)(CC0)이 있어서 시간대 변화(M5)에 쓸 수 있다.

## 물고기 사진 (M2, 사용자가 준비 중)

| 어종 | 파일 | 출처 | 라이선스 |
|---|---|---|---|
| 붕어 | | | |
| 잉어 | | | |

## 코드로 만든 것 (외부 파일 아님)

- 물고기 임시 모델(몸통 곡선·지느러미·비늘 무늬), 찌, 낚싯대, 물결 무늬 — `src/app/scene.ts`에서 코드로 생성
- 효과음·환경음(물결·바람·새) — `src/app/sfx.ts`에서 Web Audio로 합성 (음원 파일 없음)
- 글꼴 — Pretendard (`pretendard` npm 패키지, SIL OFL 1.1)
