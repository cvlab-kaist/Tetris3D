# 페이지 자산 관리

## 현재 준비본

현재는 페이지 코드와 T 블록 favicon만 포함합니다. 대표 영상·포스터·로고 이미지·PDF·Method 그림의 경로는 `null`이고, Demo·Qualitative Comparisons 목록은 비어 있습니다. 공개 페이지에서는 해당 영역에 공개 예정 안내를 표시하며 미디어를 요청하지 않습니다.

기존 자산은 Git에서 제외되는 `project-page/review/disconnected-assets/`에 보관합니다. 아래 명령과 설정은 나중에 공개할 자산을 확정한 뒤 사용합니다. 원본 좌표·geometry·장면 순서는 변경하지 않습니다.

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

## 헤더 배경 영상

제목·저자 뒤의 영상은 `public/content.json`의 `headerVideo`로 별도 지정합니다. 현재는 `null`이며 파일 요청이나 빈 영상 영역이 생기지 않습니다. 파일이 준비되면 다음 설정으로 연결합니다.

```json
"headerVideo": {
  "src": "assets/video/header.mp4",
  "poster": "assets/video/header.webp",
  "opacity": 0.18,
  "position": "50% 50%"
}
```

`poster`는 선택 사항입니다. 기본 불투명도는 18%이며 상하단은 흰 배경으로 부드럽게 사라집니다. 음소거·반복·인라인 자동 재생을 사용하고, 헤더가 화면 밖에 있거나 탭이 숨겨지면 일시정지합니다. 동작 줄이기 설정에서는 정지 화면을 표시합니다. 기존 대표 영상과는 별도로 연결합니다.

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
npm run build
```

ID는 쉼표로 여러 개를 지정하거나 `all`로 해당 컬렉션 전체를 선택합니다. 원본 목록의 순서를 유지합니다. 명령을 실행하면 두 갤러리 목록을 이번 선택으로 교체하며, 지정하지 않은 컬렉션은 빈 목록이 됩니다. 기존 파일은 삭제하지 않습니다.

입력·분할·마스크·GT·모든 사용 가능한 baseline·원본/경량 mesh와 해당 simulation을 함께 복사합니다. 외부 디스크를 가리키던 simulation 링크는 실제 파일 사본으로 바꾸며 검증 JSON에는 화면에서 사용하는 완료 여부·장면·방법만 남깁니다. 가져온 파일의 해시는 `scripts/asset-provenance.json`에 기록합니다.

## 큰 자산의 외부 호스팅

전체 개발 자산은 GitHub Pages 용량을 초과합니다. [Pages 사이트 제한은 1 GB](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)이며 Git LFS로 사이트 용량 제한을 해결할 수는 없습니다. 준비본의 검사는 총 공개 자산에 900 MB, 개별 파일에 95 MB의 여유 있는 한도를 사용합니다.

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

재생성은 `project-page/`에서 `node scripts/prepare-input-crops.mjs /path/to/development/project-page /path/to/input-cache`로 실행합니다. 생성기는 PNG와 `manifest.json`을 지정한 디렉터리에 저장하며 원본과 장면 metadata는 수정하지 않습니다. manifest의 `output`을 장면 `image`·`thumbnail`에 적용한 뒤 생성물을 `public/assets/input-cache/`로 복사합니다. 개발본에서 장면을 가져오면 크롭 저장본과 원본 경로도 포함됩니다. 현재 공개 준비본의 빈 갤러리는 유지합니다.

2026-10-06에 지정한 bottle과 두 번째 chess piece(knight)의 RGBA 원본 사본은 `project-page/examples/input-overrides/`에 보관합니다. 이 파일들은 공개 페이지에 연결되지 않습니다. 대응 scene ID와 SHA-256은 `project-page/scripts/input-overrides-provenance.json`에, 24개 크롭 경로·해시는 `project-page/scripts/input-crop-provenance.json`에 기록합니다. 직접 연결할 때는 PNG를 기록된 `assets/input-overrides/` 경로로 복사한 뒤 위 명령으로 표시용 크롭을 생성합니다. 원래 카메라 마스크를 새 이미지에 적용하지 마세요.
