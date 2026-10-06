# 프로젝트 페이지 개발과 공개

저장소: `cvlab-kaist/Tetris3D` · 공개 주소: `https://cvlab-kaist.github.io/Tetris3D/`

## 현재 공개할 내용

T2Mo와 같은 중앙 정렬 README에 Tetris3D 제목, 기존 저자 링크, KAIST AI, `arXiv 2026`을 표시합니다. 프로젝트 페이지는 현재 디자인과 뷰어 코드를 유지한 준비 페이지입니다. 영상, 포스터, 로고 이미지, 논문 PDF, Method 그림, 갤러리 결과는 연결하거나 포함하지 않습니다. 텍스트 제목과 T 블록 favicon, 공개 예정 안내만 표시합니다.

`project-page/public/content.json`의 `logo`, `methodFigure`, `video.src`, `video.poster`, 논문 링크는 `null`입니다. `preview-assets.json`과 `finalExamples`의 장면 목록도 비어 있습니다. 이전 자산 사본은 Git에서 제외되는 로컬 `project-page/review/disconnected-assets/`에 보관합니다.

## 로컬 실행

```sh
nvm use
cd project-page
npm ci
npm run dev
```

개발 서버는 `http://127.0.0.1:4174/`에서 실행됩니다. 빌드 결과를 확인하려면 개발 서버를 종료한 뒤 실행합니다.

```sh
npm run build
npm run preview
```

브라우저 검사는 자체 임시 서버에서 저장소 하위 경로, 데스크톱·모바일, 누락 파일과 불필요한 미디어 요청을 확인합니다.

```sh
npx playwright install chrome
npm run test:browser
# 이미 설치된 Chrome을 사용할 때:
CHROMIUM_PATH=/path/to/chrome npm run test:browser
```

## 개발본과 공개본 동기화

페이지를 수정할 때는 실제 자산이 연결된 개발본과 이 저장소의 `project-page/`에 같은 UI 코드·표시 설정을 적용하고, 두 미리보기를 검증한 뒤 GitHub에도 반영합니다. 공개본의 영상·자산 미연결 설정은 유지합니다.

Qualitative Comparisons의 표시 순서와 이름은 `public/content.json`의 `qualitativeOrder`에서 scene ID별로 관리합니다. 준비 페이지에 장면을 연결하면 이 순서가 적용되며, 지정되지 않은 장면은 원래 순서로 뒤에 표시됩니다. 같은 이름의 객체는 별도 ID로 구분합니다.

## 커밋과 푸시

작성자는 실제 GitHub 계정에 연결된 이름과 이메일을 사용합니다. 커밋 메시지에는 공동 작성자 표기를 추가하지 않습니다. 기존 원격 `main`의 초기 커밋 위에 변경을 올리며 강제 푸시는 필요하지 않습니다.

```sh
git config --local user.name 'Jaeyeong Kim'
git config --local user.email '96808351+kjae0@users.noreply.github.com'
git add .
git diff --cached --stat
git commit -m "Set up Tetris3D README and project page"
git push -u origin main
```

## GitHub Pages 활성화

1. 저장소 관리자 또는 Pages 설정 권한이 있는 계정으로 **Settings → Pages → Build and deployment → Source: GitHub Actions**를 한 번 선택합니다.
2. 준비한 변경을 `main`에 푸시합니다. **Deploy project page**가 빌드·브라우저 검사 후 준비 페이지를 공개합니다.
3. 이후 `project-page/` 또는 배포 워크플로를 수정해 `main`에 푸시하면 페이지가 갱신됩니다. **Actions → Deploy project page → Run workflow**로 재실행할 수도 있습니다.

배포 대상은 `project-page/dist/`이며, 로컬 `review/`, 원본 연구 파일과 Git 기록은 포함하지 않습니다. 공개 예정 영역은 실제 자산을 지정하기 전까지 유지됩니다. Vite의 `base: './'`로 `/Tetris3D/` 하위 경로를 지원합니다.

자산을 추가하는 방법은 [ASSETS.md](ASSETS.md)를 참고하세요. Pages 최초 활성화에 필요한 권한은 [GitHub 공식 문서](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site)에 설명되어 있습니다.
