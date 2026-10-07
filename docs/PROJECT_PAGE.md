# 프로젝트 페이지 개발과 공개

저장소: `cvlab-kaist/Tetris3D` · 공개 주소: `https://cvlab-kaist.github.io/Tetris3D/`

## 브랜치 구성

- `main`: 논문 소개용 `README.md`만 유지합니다.
- `page-source`: Vite 소스, 문서, 검사와 배포 워크플로를 보관합니다. 페이지 수정은 이 브랜치에서 진행합니다.
- `gh-pages`: 공개용 빌드 파일과 `.nojekyll`만 보관합니다. `page-source`의 변경을 빌드·검사한 뒤 자동으로 갱신합니다.

## 현재 공개할 내용

T2Mo와 같은 중앙 정렬 README에 Tetris3D 제목, 기존 저자 링크, KAIST AI, `arXiv 2026`을 표시합니다. 프로젝트 페이지에는 Tetris3D 로고, T 블록 favicon과 Qualitative Comparisons 24개 장면을 공개합니다. 입력 이미지·GT·baseline·Initial state·비교용 시뮬레이션을 모두 포함합니다.

대표 영상과 실사 비교는 작업 중이므로 연결하지 않습니다. `methodFigure`, `video.src`, `video.poster`, 논문 링크는 `null`이며 Demo 목록은 비어 있습니다. `preview-assets.json`에 Qualitative Comparisons 24개를 저장하고, `content.json`에서 로고와 비교용 simulation 경로를 지정합니다. 원본 geometry는 보존하고 경량 mesh 파일에도 gzip 무손실 압축을 적용해 전체 공개 자산을 약 918 MB로 유지합니다.

## 로컬 실행

```sh
git switch page-source
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

페이지를 수정할 때는 실제 자산이 연결된 개발본과 이 저장소의 `project-page/`에 같은 UI 코드·표시 설정을 적용하고, 두 미리보기를 검증한 뒤 GitHub에도 반영합니다. 공개 자산은 로고와 Qualitative Comparisons로 한정하며, 작업 중인 대표 영상·실사 비교와 Demo는 요청을 받은 뒤 추가합니다.

Qualitative Comparisons의 표시 순서와 이름은 `public/content.json`의 `qualitativeOrder`에서 scene ID별로 관리합니다. 지정되지 않은 장면은 원래 순서로 뒤에 표시됩니다. 같은 이름의 객체는 별도 ID로 구분합니다.

## 커밋과 푸시

작성자는 실제 GitHub 계정에 연결된 이름과 이메일을 사용합니다. 커밋 메시지에는 공동 작성자 표기를 추가하지 않습니다. 페이지 변경은 `page-source`에, 논문 README 변경은 `main`에 올립니다. 강제 푸시는 필요하지 않습니다.

```sh
git config --local user.name 'Jaeyeong Kim'
git config --local user.email '96808351+kjae0@users.noreply.github.com'
git switch page-source
git add .
git diff --cached --stat
git commit -m "Update project page"
git push -u origin page-source
```

## GitHub Pages 활성화

1. 저장소 관리자 또는 Pages 설정 권한이 있는 계정으로 **Settings → Pages → Build and deployment → Source: Deploy from a branch**를 선택합니다.
2. **Branch: gh-pages**, **Folder: / (root)**를 선택하고 저장합니다. 준비된 페이지가 `https://cvlab-kaist.github.io/Tetris3D/`에 공개됩니다.
3. 이후 `project-page/` 또는 배포 워크플로를 수정해 `page-source`에 푸시합니다. **Publish project page**가 빌드·브라우저 검사 후 결과를 `gh-pages`로 보내고 Pages 빌드를 요청합니다. 실패한 작업은 Actions에서 재실행할 수 있습니다.

Pages를 아직 활성화하지 않았다면 자동화는 `gh-pages` 갱신까지 완료하고 활성화 안내를 남깁니다. 일반 push 권한만으로는 Pages 최초 설정을 변경할 수 없습니다. 자동화의 `GITHUB_TOKEN`으로 만든 커밋은 Pages 빌드를 자동 시작하지 않으므로, 워크플로에서 Pages 빌드 API도 명시적으로 호출합니다.

배포 대상은 `project-page/dist/`이며, 로컬 `review/`, 원본 연구 파일과 Git 기록은 포함하지 않습니다. 공개 예정 영역은 실제 자산을 지정하기 전까지 유지됩니다. Vite의 `base: './'`로 `/Tetris3D/` 하위 경로를 지원합니다.

자산을 추가하는 방법은 [ASSETS.md](ASSETS.md)를 참고하세요. Pages 최초 활성화에 필요한 권한은 [GitHub 공식 문서](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site)에 설명되어 있습니다.
