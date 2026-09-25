# 외부 에셋 출처·라이선스

DESIGN.md §4.1: 공개·배포 전에 모든 사진의 출처와 라이선스를 이 표에 기록한다. CC0 / CC-BY 또는 직접 촬영한 것만 쓴다.

| 파일 | 내용 | 출처 | 작가 | 라이선스 | 받은 날 |
|---|---|---|---|---|---|
| `public/env/bell_park_pier.jpg` | 배경 360° 사진 (8192×4096, 톤매핑 JPG) | [Poly Haven — Bell Park Pier](https://polyhaven.com/a/bell_park_pier) | Greg Zaal | CC0 (출처 표기 의무 없음, 화면 아래에 표기함) | 2026-09-25 |
| `public/env/bell_park_pier_1k.hdr` | 같은 장소 HDR (1k) — 3D 물체 조명용 | 위와 같음 | Greg Zaal | CC0 | 2026-09-25 |

같은 장소의 새벽 버전 [Bell Park Dawn](https://polyhaven.com/a/bell_park_dawn)(CC0)이 있어서 시간대 변화(M5)에 쓸 수 있다.

## 물고기 사진 (M2, 사용자가 준비 중)

| 어종 | 파일 | 출처 | 라이선스 |
|---|---|---|---|
| 붕어 | | | |
| 잉어 | | | |

## 코드로 만든 것 (외부 파일 아님)

- 물고기 임시 모델(몸통 곡선·지느러미·비늘 무늬), 찌, 낚싯대, 물결 무늬 — `src/app/scene.ts`에서 코드로 생성
- 효과음 — `src/app/sfx.ts`에서 Web Audio로 합성 (음원 파일 없음)
- 글꼴 — Pretendard (`pretendard` npm 패키지, SIL OFL 1.1)
