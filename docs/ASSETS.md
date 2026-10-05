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

| `public/poster.jpg` | 첫 화면 정지 사진 (게임 렌더, 낮 저수지) | 게임 렌더 캡처 — 배경은 Bell Park Pier(CC0) | 이 프로젝트 | 직접 제작 | 2026-09-26 |
| `public/og.jpg` | 링크 미리보기 이미지 (게임 화면 노을 저수지 + 제목) | 게임 렌더 캡처 — 배경은 위 Bell Park Pier(CC0) | 이 프로젝트 | 직접 제작 | 2026-09-26 |
| `public/icons/*.png` | 앱 아이콘(찌·물결·달) | 코드로 직접 그림(헤드리스 크롬 캔버스, 2026-09-26) | 이 프로젝트 | 직접 제작 | 2026-09-26 |

배경 원본 JPG는 `assets-src/env/`(배포 안 함). `node scripts/make-backdrops.mjs`가 물가선 위만 잘라 WebP로 만든다(22MB → 2.4MB).
배경 사진의 물 부분(물가선 아래, 2036/4096행)은 코드에서 물가선 위 풍경을 뒤집어 채운다 (`scene.ts` `mirroredBackdrop`) — 3D 물이 사진 속 밝은 물을 비춰 수평선 아래에 띠가 생겼기 때문.

시간대(M5)는 새 사진 없이 같은 사진을 셰이더에서 보정한다(노을·밤, 별) — 장소마다 8K 사진을 더 받으면 용량·메모리가 크게 늘어서. 달·전자찌 빛도 코드로 그림.

## 물고기 3D 모델 (실사, 사용자: "진짜 실제 물고기처럼")

`public/models/fish/<id>.glb` — 없는 어종은 코드로 만든 모델(`fishModels.ts`)을 그대로 쓴다.
두 가지 경로:
1. **실물 스캔** — Sketchfab의 CC0/CC-BY 모델(주로 ffish.asia 사진측량 스캔, CC0). 후보·고른 이유는 `assets-src/models/sources.json`, 받기는 `scripts/fetch-models.mjs`(Sketchfab 로그인 토큰 필요 — 토큰은 프로젝트 밖 `%USERPROFILE%\.sketchfab-token`).
   CC-BY 모델(백상아리·나일퍼치)은 게임 도움말(?)에도 저작자를 표시한다. 뼈대 애니메이션이 있는 모델은 기본 자세만 쓴다.
2. **사진 → 3D 생성** — 무료 모델이 없는 어종. 라이선스 확인된 사진(퍼블릭 도메인/CC0/CC-BY, Wikimedia Commons)을
   [Microsoft TRELLIS.2](https://github.com/microsoft/TRELLIS.2)(MIT, 공식 Hugging Face 무료 데모)로 3D로 만든다. 원본 사진은 `assets-src/models/ai-src/`.
   CC-BY 사진에서 만든 모델은 그 사진의 저작자 표시를 따른다.

원본(`assets-src/models/raw/`, git 제외) → `node scripts/build-fish.mjs` → 약 2만 삼각형·1024px WebP·meshopt 압축(한 마리 약 0.5MB).

| 어종 | 파일 | 만든 방법 · 원본 | 원본 저작자 | 라이선스 | 받은 날 |
|---|---|---|---|---|---|
| 붕어 | `public/models/fish/crucian.glb` | Sketchfab [CC0 ギンブナ 🐟 Crucian Carp, C. auratus langsdorfii](https://sketchfab.com/3d-models/da1829c8fc1d4ed3b06f311ad23788ae) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 잉어 | `public/models/fish/carp.glb` | Sketchfab [CC0 コイ 🐟 Carp, Cyprinus carpio](https://sketchfab.com/3d-models/6b404d20bab34fa99fba848060c42ca7) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 배스 | `public/models/fish/bass.glb` | Sketchfab [CC0 オオクチバス類 🐟 ♂, Micropterus sp.](https://sketchfab.com/3d-models/62e182cf1f2d4d5692dde7348e648f76) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 메기 | `public/models/fish/catfish.glb` | Sketchfab [CC0 ナマズ 🐟 Amur Catfish, Silurus asotus](https://sketchfab.com/3d-models/0b28048d20ea4883990b0a8de2166c6f) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 가물치 | `public/models/fish/snakehead.glb` | Sketchfab [CC0 カムルチー 🐟 Spotted Snakehead, Channa argus](https://sketchfab.com/3d-models/f00d3f9e6f59431e9a438f5d7571645d) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 쏘가리 (황쏘가리는 같은 모델을 금빛으로) | `public/models/fish/mandarin.glb` | Sketchfab [CC0 オヤニラミ 🐟 ♂ Japanese Aucha Perch](https://sketchfab.com/3d-models/448a3538ffc74687ac0c5daf946fcfca) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 우럭 (クロメバル — 같은 볼락속) | `public/models/fish/rockfish.glb` | Sketchfab [CC0 クロメバル 🐟 Blueback Seaperch, S. ventricosus](https://sketchfab.com/3d-models/97a5468e21994160b93c10b643c1f777) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 참돔 | `public/models/fish/red_seabream.glb` | Sketchfab [CC0 マダイ 🐟 Red Seabream, Pagrus major](https://sketchfab.com/3d-models/7b27c8bfd19449eb83d35b497f02bf2d) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 광어 (ガンゾウビラメ — 가까운 넙치류) | `public/models/fish/flounder.glb` | Sketchfab [CC0 ガンゾウビラメ 🐟 Cinnamon Flounder, P. cinnamoneus](https://sketchfab.com/3d-models/8abb6d1daa1744e293a005560c5f4107) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 농어 | `public/models/fish/seabass.glb` | Sketchfab [CC0 スズキ 🐟 Japanese Seabass, L. japonicus](https://sketchfab.com/3d-models/7460e749039547a783a85f612cca3ceb) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 방어 | `public/models/fish/yellowtail.glb` | Sketchfab [CC0 ブリ 🐟 Five-ray Yellowtail, S. quinqueradiata](https://sketchfab.com/3d-models/e27d30bd4d7347238e428a8e36d9fde4) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 참다랑어 | `public/models/fish/tuna.glb` | Sketchfab [CC0 クロマグロ 🐟 Pacific Bluefin Tuna, T. orientalis](https://sketchfab.com/3d-models/88d6e843abfb44d086341323e99b83ac) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 귀상어 | `public/models/fish/hammerhead.glb` | Sketchfab [CC0 アカシュモクザメ 🦈 ♀ Scalloped Hammerhead Shark](https://sketchfab.com/3d-models/b68fdc989ba74bec9495ac907995739e) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 대왕구족 | `public/models/fish/isopod.glb` | Sketchfab [CC0 オオグソクムシ Giant Isopod, B. doederleinii](https://sketchfab.com/3d-models/3979c291d1f9454c90851efe291eab60) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 심해아귀 (キアンコウ 스캔 + 코드로 단 발광 미끼) | `public/models/fish/anglerfish.glb` | Sketchfab [CC0 キアンコウ 🐟 Yellow Goosefish, Lophius litulon](https://sketchfab.com/3d-models/6538a4e7b31949c2a01449b83b196796) | ffishAsia-and-floraZia | CC0 | 2026-09-25 |
| 백상아리 | `public/models/fish/great_white.glb` | Sketchfab [White Pointer](https://sketchfab.com/3d-models/8e429052939a4677861d0d550a0e27cd) | 3dartstevenz | CC-BY 4.0 (저작자 표시) | 2026-09-25 |
| 나일퍼치 (바라문디 — 같은 Lates속) | `public/models/fish/nile_perch.glb` | Sketchfab [Barramundi fish](https://sketchfab.com/3d-models/699ae7b41ed14962a4d1afa008a8ba2a) | ryan_saputra | CC-BY 4.0 (저작자 표시) | 2026-09-25 |
| 틸라피아 | `public/models/fish/tilapia.glb` | TRELLIS.2 ← [Tilapia oreochromis niloticus fish.jpg](https://commons.wikimedia.org/wiki/File:Tilapia_oreochromis_niloticus_fish.jpg) | (Wikimedia Commons, 퍼블릭 도메인) | 퍼블릭 도메인 사진 → 생성 모델 | 2026-09-25 |
| 자라 (중국자라 P. sinensis) | `public/models/fish/softshell.glb` | Sketchfab [CC0 スッポン 🐢 ♀ Soft-shelled Turtle, P. sinensis](https://sketchfab.com/3d-models/3f9a4a4922b94540973035c8f01a7a01) | ffishAsia-and-floraZia | CC0 | 2026-09-26 |
| 뱀장어 | `public/models/fish/eel.glb` | Sketchfab [CC0 ニホンウナギ 🐟 Japanese Eel, Anguilla japonica](https://sketchfab.com/3d-models/4e32ce898e4b4fad96860c45d9ac04af) | ffishAsia-and-floraZia | CC0 | 2026-09-26 |
| 문어 (참문어) | `public/models/fish/octopus.glb` | Sketchfab [CC0 マダコ 🐙 Common Octopus, Octopus vulgaris](https://sketchfab.com/3d-models/7860bbb4a7044522a308e5b527121a62) | ffishAsia-and-floraZia | CC0 | 2026-09-26 |
| 복어 (복섬 — クサフグ) | `public/models/fish/puffer.glb` | Sketchfab [CC0 クサフグ 🐡 Grass Puffer, Takifugu niphobles](https://sketchfab.com/3d-models/586210558f404005bf25d8a19720de41) | ffishAsia-and-floraZia | CC0 | 2026-09-26 |
| 가시복 (가시복과 Long-spine Porcupinefish) | `public/models/fish/porcupinefish.glb` | Sketchfab [Long-spine Porcupinefish](https://sketchfab.com/3d-models/79b46383e9a14fd6ab83cbbc31a2ab16) | RISDNaturelab | CC-BY 4.0 (저작자 표시) | 2026-09-26 |
| 쏠배감펭 (ミノカサゴ — 쏠배감펭속) | `public/models/fish/lionfish.glb` | Sketchfab [CC0 ミノカサゴ 🐟 Luna Lionfish, Pterois lunulata](https://sketchfab.com/3d-models/701f33ba0db84058900232bf7ee91fec) | ffishAsia-and-floraZia | CC0 | 2026-09-26 |
| 곰치 (ウツボ — 곰치과) | `public/models/fish/moray.glb` | Sketchfab [CC0 ウツボ 🐟 Brutal Moray, Gymnothorax kidako](https://sketchfab.com/3d-models/f7b2e7e06e454392bf7d7ab739658d57) | ffishAsia-and-floraZia | CC0 | 2026-09-26 |
| 무늬오징어 | `public/models/fish/bigfin_squid.glb` | Sketchfab [CC0 アオリイカ Bigfin Reef Squid, S. lessoniana](https://sketchfab.com/3d-models/8457fc5fb9bc4db8a00fdec43a3f4456) | ffishAsia-and-floraZia | CC0 | 2026-09-26 |
| 노랑가오리 | `public/models/fish/stingray.glb` | Sketchfab [CC0 アカエイ 🦈 ♀ Red Stingray, Hemitrygon akajei](https://sketchfab.com/3d-models/f309cd53efd544f4b22b33f0ebd2e07b) | ffishAsia-and-floraZia | CC0 | 2026-09-26 |
| 대왕오징어 (색은 코드로 입힘) | `public/models/fish/giant_squid.glb` | Sketchfab [Sculptjanuary 2019, day 1: Giant Squid](https://sketchfab.com/3d-models/1f97e07935bf42e3a9cf1aa02f925d7e) | mvick13497 | CC-BY 4.0 (저작자 표시) | 2026-09-26 |
| 실러캔스 | `public/models/fish/coelacanth.glb` | Sketchfab [Coelacanth](https://sketchfab.com/3d-models/2400195832b64f698096ed0fdac85d51) | TimFallas | CC-BY 4.0 (저작자 표시) | 2026-09-26 |
| 풍선장어 | `public/models/fish/gulper.glb` | Sketchfab [Gulper Eel (Eurypharynx pelecanoides)](https://sketchfab.com/3d-models/fbae0106acab48f4869141df9d8c37da) | SpaceGolby | CC-BY 4.0 (저작자 표시) | 2026-09-26 |
| 아프리카 폐어 (P. annectens) | `public/models/fish/lungfish.glb` | Sketchfab [African Lungfish - Protopterus annectens](https://sketchfab.com/3d-models/3c0e32d2b3784c1080ce79d495f844d5) | MTSUichthyology | CC-BY 4.0 (저작자 표시) | 2026-09-26 |
| 비키르 (알비노 사진 → 게임에서 올리브색으로 칠함) | `public/models/fish/bichir.glb` | TRELLIS.2 ← [Polypterus senegalus - Senegal-Flösselhecht - Albino.jpg](https://commons.wikimedia.org/wiki/File:Polypterus_senegalus_-_Senegal-Fl%C3%B6sselhecht_-_Albino.jpg) | 5snake5 | CC0 사진 → 생성 모델 | 2026-09-27 |
| 금눈돔 | `public/models/fish/alfonsino.glb` | TRELLIS.2 ← [Splendid alfonsino ( Beryx splendens ).jpg](https://commons.wikimedia.org/wiki/File:Splendid_alfonsino_(_Beryx_splendens_).jpg) | NOAA's Fisheries Collection , SEFSC Pascagoula Laboratory; C | Public domain 사진 → 생성 모델 | 2026-09-27 |
| 코끼리주둥이고기 | `public/models/fish/elephantfish.glb` | TRELLIS.2 ← [Gnathonemus petersii.jpg](https://commons.wikimedia.org/wiki/File:Gnathonemus_petersii.jpg) | billycorgan84 | Public domain 사진 → 생성 모델 | 2026-09-28 |
| 분두 메기 | `public/models/fish/vundu.glb` | TRELLIS.2 ← [Heterobranchus longifilis (cropped).jpg](https://commons.wikimedia.org/wiki/File:Heterobranchus_longifilis_(cropped).jpg) | Cuvier & Valenciennes | Public domain 사진 → 생성 모델 | 2026-09-28 |
| 블롭피시 | `public/models/fish/blobfish.glb` | TRELLIS.2 ← [Psychrolutes phrictus.jpg](https://commons.wikimedia.org/wiki/File:Psychrolutes_phrictus.jpg) | (Commons에 작가 표기 없음) | Public domain 사진 → 생성 모델 | 2026-09-29 |
| 전기메기 | `public/models/fish/electric_catfish.glb` | TRELLIS.2 ← [FMIB 47150 Malapterurus electricus.jpeg](https://commons.wikimedia.org/wiki/File:FMIB_47150_Malapterurus_electricus.jpeg) | Albert Günther | Public domain 사진 → 생성 모델 | 2026-09-30 |
| 골리앗 타이거피시 | `public/models/fish/tigerfish.glb` | TRELLIS.2 ← [Hydrocynus vittatus The fishes of the Nile (Pl. XVII) (6961607491).jpg](https://commons.wikimedia.org/wiki/File:Hydrocynus_vittatus_The_fishes_of_the_Nile_(Pl._XVII)_(6961607491).jpg) | Boulenger, George Albert; Loat, L. | Public domain 사진 → 생성 모델 | 2026-10-03 |
| 개복치 | `public/models/fish/sunfish.glb` | TRELLIS.2 ← [Mola mola stuffed museum La Rochelle.jpg](https://commons.wikimedia.org/wiki/File:Mola_mola_stuffed_museum_La_Rochelle.jpg) | Jebulon | CC0 사진 → 생성 모델 | 2026-10-03 |
| 덤보문어 | `public/models/fish/dumbo.glb` | TRELLIS.2 ← [Dumbo-hires (cropped).jpg](https://commons.wikimedia.org/wiki/File:Dumbo-hires_(cropped).jpg) | NOAA Okeanos Explorer | Public domain 사진 → 생성 모델 (텍스처를 꼭짓점 색으로) | 2026-10-04 |
| 흡혈오징어 | `public/models/fish/vampire_squid.glb` | TRELLIS.2 ← [Vampyroteuthis infernalis.jpg](https://commons.wikimedia.org/wiki/File:Vampyroteuthis_infernalis.jpg) | Carl Chun | Public domain 사진 → 생성 모델 (텍스처를 꼭짓점 색으로) | 2026-10-04 |
| 청새치 | `public/models/fish/marlin.glb` | TRELLIS.2 ← [Blue marlin (Duane Raver).png](https://commons.wikimedia.org/wiki/File:Blue_marlin_(Duane_Raver).png) | Raver Duane, U.S. Fish and Wildlife Service | Public domain 사진 → 생성 모델 | 2026-10-05 |

## 코드로 만든 것 (외부 파일 아님)

- 어종 모델(실사 모델이 아직 없는 어종, 그리고 실사 모델을 불러오는 동안의 대체) — `src/app/fishModels.ts`
- 훼방 동물(수달·범고래·나일악어·하마) — `src/app/animals.ts`
- 찌, 낚싯대, 배(난간·집어등), 바위 모양, 물결 무늬 — `src/app/scene.ts`
- 효과음·환경음(물결·바람·새) — `src/app/sfx.ts`에서 Web Audio로 합성 (음원 파일 없음)
- 글꼴 — Pretendard (`pretendard` npm 패키지, SIL OFL 1.1)
