# 외부 에셋 출처·라이선스

DESIGN.md §4.1: 공개·배포 전에 모든 사진의 출처와 라이선스를 이 표에 기록한다. CC0 / CC-BY 또는 직접 촬영한 것만 쓴다.

| 파일 | 내용 | 출처 | 작가 | 라이선스 | 받은 날 |
|---|---|---|---|---|---|
| `assets-src/env/bell_park_pier.jpg` → `public/env/bell_park_pier_top.webp` | 배경 360° 사진 (8192×4096 톤매핑 JPG 원본 → 물가선 위만 WebP) | [Poly Haven — Bell Park Pier](https://polyhaven.com/a/bell_park_pier) | Greg Zaal | CC0 (출처 표기 의무 없음, 화면 아래에 표기함) | 2026-09-25 |
| `public/env/bell_park_pier_1k.hdr` | 같은 장소 HDR (1k) — 3D 물체 조명용 | 위와 같음 | Greg Zaal | CC0 | 2026-09-25 |
| `simons_town_rocks` (`_top.webp`, `_1k.hdr`) | 바다(갯바위) 배경·조명 | [Poly Haven — Simon's Town Rocks](https://polyhaven.com/a/simons_town_rocks) | Greg Zaal, Rico Cilliers | CC0 | 2026-09-25 |
| `the_sky_is_on_fire` (`_top.webp`, `_1k.hdr`) | 심해(노을 선상) 배경·조명 | [Poly Haven — The Sky Is On Fire](https://polyhaven.com/a/the_sky_is_on_fire) | Greg Zaal, Rico Cilliers | CC0 | 2026-09-25 |
| `river_rocks` (`_top.webp`, `_1k.hdr`) | 아프리카 강 배경·조명 | [Poly Haven — River Rocks](https://polyhaven.com/a/river_rocks) | Greg Zaal | CC0 | 2026-09-25 |
| `public/tex/dry_riverbed_rock_*_1k.jpg` | 바다·강 발밑 바위 | [Poly Haven — Dry Riverbed Rock](https://polyhaven.com/a/dry_riverbed_rock) | Amal Kumar | CC0 | 2026-09-25 |
| `public/tex/waternormals.jpg` | 물결 노멀맵 (움직이는 물 표면) | [three.js 저장소 r186 examples/textures](https://github.com/mrdoob/three.js/tree/r186/examples/textures) | three.js authors | MIT | 2026-09-25 |
| `public/tex/weathered_planks_*_1k.jpg` | 데크 나무판 (색·노멀·거칠기) | [Poly Haven — Weathered Planks](https://polyhaven.com/a/weathered_planks) | Dimitrios Savva, Dario Barresi | CC0 | 2026-09-25 |
| `public/models/folding_wooden_stool/` | 접이식 나무 의자 (glTF 1k) | [Poly Haven — Folding Wooden Stool](https://polyhaven.com/a/folding_wooden_stool) | Ulan Cabanilla | CC0 | 2026-09-25 |
| `public/models/wooden_bucket_01/` | 나무 양동이 (glTF 1k) | [Poly Haven — Wooden Bucket 01](https://polyhaven.com/a/wooden_bucket_01) | James Ray Cock | CC0 | 2026-09-25 |
| `public/models/grass_medium_02/` | 물가 풀 (glTF 1k) | [Poly Haven — Grass Medium 02](https://polyhaven.com/a/grass_medium_02) | Rico Cilliers | CC0 | 2026-09-25 |

배경 원본 JPG는 `assets-src/env/`(배포 안 함). `node scripts/make-backdrops.mjs`가 물가선 위만 잘라 WebP로 만든다(22MB → 2.4MB).
배경 사진의 물 부분(물가선 아래, 2036/4096행)은 코드에서 물가선 위 풍경을 뒤집어 채운다 (`scene.ts` `mirroredBackdrop`) — 3D 물이 사진 속 밝은 물을 비춰 수평선 아래에 띠가 생겼기 때문.

같은 장소의 새벽 버전 [Bell Park Dawn](https://polyhaven.com/a/bell_park_dawn)(CC0)이 있어서 시간대 변화(M5)에 쓸 수 있다.

## 물고기 3D 모델 (실사, 사용자: "진짜 실제 물고기처럼")

`public/models/fish/<id>.glb` — 없는 어종은 코드로 만든 모델(`fishModels.ts`)을 그대로 쓴다.
두 가지 경로:
1. **실물 스캔** — Sketchfab의 CC0/CC-BY 모델(주로 ffish.asia 사진측량 스캔, CC0). 후보·고른 이유는 `assets-src/models/sources.json`, 받기는 `scripts/fetch-models.mjs`(Sketchfab 로그인 토큰 필요).
2. **사진 → 3D 생성** — 무료 모델이 없는 어종. 라이선스 확인된 사진(퍼블릭 도메인/CC0/CC-BY, Wikimedia Commons)을
   [Microsoft TRELLIS.2](https://github.com/microsoft/TRELLIS.2)(MIT, 공식 Hugging Face 무료 데모)로 3D로 만든다. 원본 사진은 `assets-src/models/ai-src/`.
   CC-BY 사진에서 만든 모델은 그 사진의 저작자 표시를 따른다.

원본(`assets-src/models/raw/`, git 제외) → `node scripts/build-fish.mjs` → 약 2만 삼각형·1024px WebP·meshopt 압축(한 마리 약 0.5MB).

| 어종 | 파일 | 만든 방법 · 원본 | 원본 저작자 | 라이선스 | 받은 날 |
|---|---|---|---|---|---|
| 틸라피아 | `public/models/fish/tilapia.glb` | TRELLIS.2 ← [Tilapia oreochromis niloticus fish.jpg](https://commons.wikimedia.org/wiki/File:Tilapia_oreochromis_niloticus_fish.jpg) | (Wikimedia Commons, 퍼블릭 도메인) | 퍼블릭 도메인 사진 → 생성 모델 | 2026-09-25 |

## 코드로 만든 것 (외부 파일 아님)

- 어종 모델(실사 모델이 아직 없는 어종, 그리고 실사 모델을 불러오는 동안의 대체) — `src/app/fishModels.ts`
- 훼방 동물(수달·범고래·나일악어·하마) — `src/app/animals.ts`
- 찌, 낚싯대, 배(난간·집어등), 바위 모양, 물결 무늬 — `src/app/scene.ts`
- 효과음·환경음(물결·바람·새) — `src/app/sfx.ts`에서 Web Audio로 합성 (음원 파일 없음)
- 글꼴 — Pretendard (`pretendard` npm 패키지, SIL OFL 1.1)
