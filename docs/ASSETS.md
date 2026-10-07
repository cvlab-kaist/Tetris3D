# 페이지 자산 관리

## 현재 공개 자산

Tetris3D 로고, T 블록 favicon, Paper PDF, Method 그림과 Qualitative Comparisons 24개 장면을 포함합니다. Paper는 제공받은 `Tetris3D_v1.pdf`를 `assets/paper/tetris3d-paper.pdf`로 그대로 복사하며, 링크의 `v` 값에는 파일 해시를 넣어 이전 PDF 캐시를 피합니다. Method 그림은 개발본의 `assets/paper/method.webp`와 캡션을 그대로 사용합니다. 비교 장면에는 입력 이미지·GT·사용 가능한 baseline mesh·Initial state·시뮬레이션이 들어 있습니다. 대표 영상·포스터·실사 비교 이미지는 연결하지 않으며 Demo 목록은 비어 있습니다.

원본 mesh와 경량 mesh 모두 gzip 무손실 압축으로 저장합니다. 좌표·geometry·장면 순서는 변경하지 않으며, 경량 mesh를 복원한 바이트의 SHA-256은 원본과 일치합니다. 각 파일의 출처와 해시는 `scripts/asset-provenance.json`에 기록합니다.

WorldSculpt도 24개 장면 모두 원본·경량 3D 보기를 제공합니다. `WorldSculpt/toys4k_qualitative24_gt_20261008`의 composite를 공통 표시 좌표계로 회전한 사본이며, 입력 RGB·카메라·target·view와 원본 geometry·GT primitive 일치를 검증했습니다. 검증 기록은 `scripts/worldsculpt-provenance.json`에 있습니다. 시뮬레이션은 동일한 새 추론을 사용한 `toys4k_worldsculpt_qualitative24_gt_videos_20261008` 영상입니다. 3D 출처와 source mesh SHA-256, 공통 비교 camera와 physics를 대조합니다. 미완료 장면에는 이전 영상 대신 대기 상태를 표시합니다.

## 대표 영상·이미지·논문 연결

최종 파일을 `project-page/public/assets/`에 넣고 `public/content.json`에서 필요한 항목만 지정합니다. 지정하지 않은 항목은 `null`로 둡니다.

```json
{
  "logo": "assets/logo.png",
  "video": {
    "src": "assets/video/project-video.mp4",
    "poster": "assets/video/poster.webp"
  },
  "methodFigure": "assets/method.webp",
  "links": {
    "paper": "assets/paper.pdf",
    "arxiv": null,
    "code": null,
    "supplementary": null
  }
}
```

이 예시는 현재 설정에 연결되어 있지 않습니다. 경로를 지정하면 로고·영상·Method 그림이 자동으로 나타나므로 HTML에 자산 경로를 추가할 필요가 없습니다. 영상은 음소거 자동 재생과 `현재 시간 / 전체 길이` 표시를 지원합니다. 자산 해시와 출처는 `scripts/asset-provenance.json`에 기록합니다.

## 실사 이미지 비교

`public/content.json`의 `realWorldComparisons` 네 항목에 장면별 `title`과 비교 결과 `image`를 지정합니다. `thumbnail`과 `alt`는 선택 사항입니다. 예: `{ "title": "Scene 1", "image": "assets/real-world/scene-1.webp" }`. 현재 네 이미지 경로는 `null`입니다.

Qualitative Comparisons 아래에서 네 썸네일 중 선택한 장면만 선명하게 표시하고, 아래 큰 패널에 전체 비교 이미지를 비율대로 보여줍니다. 좌우 화살표 키로 장면을 선택하고, 큰 이미지를 클릭하면 기존 확대 창을 엽니다. 입력·방법별 결과가 함께 담긴 비교 이미지를 장면마다 하나씩 연결하면 됩니다.

## 개발본에서 장면 가져오기

`project-page/`에서 실행합니다. `--from`에는 기존 Vite 프로젝트의 루트를 지정합니다.

```sh
npm run import:scenes -- --from /path/to/current/project-page --list
npm run import:scenes -- --from /path/to/current/project-page \
  --demos music_unique \
  --toys v3_8ec2bf095bdea084040af96d947e69bb5ef8a4d4662fb8383504aa9a0ee12297
# 현재 공개 범위: Qualitative Comparisons 24개, 경량 GLB도 무손실 압축
npm run import:scenes -- --from /path/to/current/project-page --toys all --gzip-meshes
npm run build
```

ID는 쉼표로 여러 개를 지정하거나 `all`로 해당 컬렉션 전체를 선택합니다. 원본 목록의 순서를 유지합니다. 명령을 실행하면 두 갤러리 목록을 이번 선택으로 교체하며, 지정하지 않은 컬렉션은 빈 목록이 됩니다. 기존 파일은 삭제하지 않습니다.

입력·분할·마스크·GT·모든 사용 가능한 baseline·원본/경량 mesh와 해당 simulation을 함께 복사합니다. 외부 디스크를 가리키던 simulation 링크는 실제 파일 사본으로 바꾸며 검증 JSON에는 완료 여부·장면·방법과 새 추론 영상의 검증 해시만 남깁니다. 가져온 파일의 해시는 `scripts/asset-provenance.json`에 기록합니다.

`--gzip-meshes`는 아직 압축되지 않은 `.glb`를 `.glb.gz`로 저장하고 경로와 다운로드 크기를 갱신합니다. 이미 압축된 원본 mesh는 그대로 복사합니다. 압축을 해제하면 바이트까지 동일하며, 별도의 단순화·재정렬·좌표 변환은 하지 않습니다. 외부 호스트 모드와 함께 사용하지 않습니다.

`scripts/hosted-asset-config.json`의 방법은 자동으로 `project-page/hosted-assets/<method>/`에 저장합니다. 현재 WorldSculpt 48개 파일(24개 원본·경량 쌍)을 `page-source`에 함께 커밋하고 GitHub의 raw URL로 제공합니다. `public/`에 중복 복사하지 않아 Pages 빌드 용량을 유지합니다. importer는 해당 mesh만 HTTPS 주소로 바꾸고, 출처·해시·URL은 `asset-provenance.json`의 `hostedAssets`에 기록합니다. `check:assets`는 커밋할 사본과 모든 연결의 해시·용량도 검사합니다. 실제 공개 전에 이 파일을 포함해 `page-source`를 push해야 합니다. 저장소나 브랜치 이름을 바꾸면 설정의 `baseUrl`도 갱신한 뒤 다시 가져오세요.

## 큰 자산의 외부 호스팅

전체 개발 자산은 GitHub Pages 용량을 초과합니다. [Pages 사이트 제한은 1 GB](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)이며 Git LFS로 사이트 용량 제한을 해결할 수는 없습니다. 검사는 총 공개 자산에 950 MB, 개별 파일에 95 MB의 한도를 사용합니다. 현재 Qualitative Comparisons·로고·Method 그림·Paper PDF는 약 939 MB이며, 번들 및 추가 파일을 위한 여유를 남깁니다.

별도 정적 호스트에 `assets/` 디렉터리 구조를 유지해 올렸다면 다음처럼 연결할 수 있습니다. 주소는 실제 업로드가 끝난 호스트로 지정합니다.

```sh
npm run import:scenes -- --from /path/to/current/project-page \
  --demos all --toys all --asset-base https://YOUR_ASSET_HOST/
```

이 모드에서는 장면 자산 경로를 외부 URL로 바꾸고 큰 파일을 저장소에 복사하지 않습니다. 로고·대표 영상·PDF 설정은 별도로 지정하며, 현재의 `null` 값도 유지할 수 있습니다. 외부 호스트는 GLB·JSON·마스크 요청에 CORS를 허용하고, MP4에는 byte-range 응답을 지원해야 합니다. 이 명령은 업로드나 호스팅 생성을 수행하지 않습니다.

## 직접 편집

- `public/content.json`: 제목·TL;DR·저자·Paper/arXiv/Code 링크, 대표 영상, simulation 매핑.
- `public/preview-assets.json`: `demos`와 `toys` 배열. `examples/scene.example.json`에서 한 장면의 형식을 확인할 수 있습니다.
- `public/assets/`: 준비한 이미지·GLB·PDF·MP4. JSON 경로는 `assets/...`로 시작하거나 외부 HTTPS URL을 사용합니다.

`model: null`은 결과 없음으로 표시합니다. Mesh의 객체 이름은 `objects`와 맞추고 원래 좌표를 보존합니다. `modelLight`는 선택 사항입니다. 새로운 baseline이 없으면 임의 결과를 대신 넣지 않습니다.

Qualitative Comparisons의 `Show GT`는 `methods`의 `id: "gt"` mesh를 입력 이미지 자리에서 표시합니다. GT는 버튼을 눌렀을 때만 불러오며 다른 결과와 카메라·객체 선택을 공유합니다. `Show input`으로 돌아가거나 장면을 닫으면 뷰어를 정리합니다. GT mesh가 없는 장면은 버튼을 숨기며 Initial state와 simulation 행은 그대로 유지합니다.

자산을 교체한 뒤 `npm run check:assets`, `npm run build`, `npm run test:browser`로 확인합니다. 외부 자산의 실제 다운로드·3D·simulation 동작은 최종 호스트를 연결한 뒤 직접 확인합니다.

## 입력 이미지 표시와 교체

마스크 또는 PNG alpha가 있는 입력은 피사체 범위를 미리 잘라 긴 변의 3.5% 여백을 남긴 흰 배경 PNG로 저장합니다. `assets/input-cache/`의 콘텐츠 해시 파일을 장면 `image`·`thumbnail`에 지정하고 `imageMasks`는 빈 배열로 둡니다. 썸네일·비교 패널·확대 창에서 저장본을 바로 불러오므로 방문 후 이미지 크기가 바뀌지 않습니다. `imageOriginal`·`imageOriginalMasks`에 원본 경로·마스크를 보존하며 Original 링크는 원본을 엽니다. 불투명한 실사 장면은 그대로 표시합니다.

재생성은 `project-page/`에서 `node scripts/prepare-input-crops.mjs /path/to/development/project-page /path/to/input-cache`로 실행합니다. 생성기는 PNG와 `manifest.json`을 지정한 디렉터리에 저장하며 원본과 장면 metadata는 수정하지 않습니다. manifest의 `output`을 장면 `image`·`thumbnail`에 적용한 뒤 생성물을 `public/assets/input-cache/`로 복사합니다. 개발본에서 장면을 가져오면 크롭 저장본과 원본 경로도 포함됩니다.

2026-10-06에 지정한 bottle과 두 번째 chess piece(knight)의 RGBA 원본 사본은 `project-page/examples/input-overrides/`에 보관하며, 공개 페이지에는 해당 이미지에서 만든 크롭 저장본을 연결합니다. 대응 scene ID와 SHA-256은 `project-page/scripts/input-overrides-provenance.json`에, 24개 크롭 경로·해시는 `project-page/scripts/input-crop-provenance.json`에 기록합니다. 원래 카메라 마스크를 새 이미지에 적용하지 마세요.

## WorldSculpt 시뮬레이션 교체

`project-page/`에서 다음 명령으로 새 MP4·초기 poster·검증 기록만 교체합니다. `VIDEO_PATHS.tsv`의 scene ID로 매핑하므로 웹의 장면 순서는 유지합니다.

```sh
node scripts/import-worldsculpt-simulations.mjs --from /path/to/video-campaign
# 전체 로컬 개발본에도 같은 검증과 매핑을 적용
node scripts/import-worldsculpt-simulations.mjs --from /path/to/video-campaign --page /path/to/development/project-page
```

기본값은 24개 검증 영상이 모두 있어야 반영합니다. 생성 중 `--allow-pending`을 지정하면 완료본을 가져오고 나머지는 대기로 표시합니다. 완료 후 같은 명령을 다시 실행합니다. 원본 결과는 수정하지 않고 웹 사본만 교체하며, URL의 `v`에는 파일 해시를 넣어 이전 영상·poster 캐시를 피합니다. 상태와 입력 mesh·영상·poster 해시는 `scripts/worldsculpt-simulation-provenance.json`에 기록합니다. GT Initial state 및 다른 방법의 영상은 유지합니다.
