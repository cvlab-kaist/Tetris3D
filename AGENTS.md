# Repository Guidelines

## Project Structure & Module Organization

`README.md` introduces the Tetris3D research project. `project-page/` contains the Vite, vanilla JavaScript, and Three.js website. Its `src/` directory holds rendering and interaction code; `public/content.json` holds page copy; `public/preview-assets.json` lists gallery scenes. Store website assets under `project-page/public/assets/`. Publishing instructions live in `docs/PROJECT_PAGE.md`, with asset formats in `docs/ASSETS.md`.

## Build, Test, and Development Commands

Use Node.js 22.12+; `.nvmrc` selects Node 22. Run website commands inside `project-page/`.

- `npm ci`: install the locked dependencies.
- `npm run dev`: serve the website at `http://127.0.0.1:4174/`.
- `npm run check:assets`: verify local references, file sizes, and portable asset paths.
- `npm run build`: validate assets and generate `dist/`.
- `npm run preview`: preview that build on port 4174.
- `npm run test:browser`: check the build at a repository subpath, including mobile layout and video playback. Set `CHROMIUM_PATH` or install Chrome with Playwright.

## Coding Style & Naming Conventions

Use ES modules, two-space indentation, single quotes, semicolons, camelCase identifiers, and kebab-case CSS selectors. Preserve neighboring compact CSS. No formatter or linter is configured. Keep public copy separate from implementation details.

## Testing Guidelines

Build and run browser checks after website changes. Exercise relevant gallery, camera, and playback behavior when modifying it. Reports and screenshots belong in ignored `project-page/review/`. Keep assets portable: no machine-specific paths or symlinks. Record imported assets in `project-page/scripts/asset-provenance.json`.

## Commit & Pull Request Guidelines

Use concise imperative subjects. Describe visible behavior changes and validation; include desktop/mobile screenshots for layout changes. Do not commit generated builds, dependencies, local credentials, or research outputs unrelated to the website. Keep the README aligned with actual paper, code, and model release status.
