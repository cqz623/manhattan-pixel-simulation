# GitHub Pages publication preparation

Expected project URL: **https://cqz623.github.io/manhattan-pixel-simulation/**

Repository: `cqz623/manhattan-pixel-simulation`; default branch: `main`. These values were checked against the Git remote and read-only GitHub repository metadata on November 19, 2026. The repository is public. No repository settings were changed, and no commit, push, workflow dispatch or deployment was performed.

The owner has confirmed that **GitHub Actions is already selected as the Pages source**. Local and remote `main` still point to the same initial commit, and the committed README matches the remote README. The current expanded local README is retained unchanged by this final readiness check.

## Static structure and requirements

- `index.html` is at the root and imports `./styles.css` and `./src/main.js`.
- The active ES module graph uses explicit relative `.js` imports, including `../data/nyc-park-profile.js`. The map is generated in the browser; no backend, GIS download, API key, CDN, bundler or routing fallback is needed.
- Styles use local system fonts and an inline SVG data URL. There are no external font/image/runtime script requests.
- The app runs directly from any HTTP static server, including a repository subdirectory. Root-relative paths and local machine URLs are unnecessary. Exported JSON files remain local browser downloads; there is no server storage.
- Node 24 and `npm ci` are used in CI for the existing test-only dependency. Python is only a convenience for `npm start` locally; neither Node nor Python runs on the published site.

## Configuration added

`.github/workflows/pages.yml` runs **automatically on pushes to `main`**, with manual dispatch retained for `main`. Other branches do not deploy. Set the Pages publishing source to GitHub Actions before the first approved push. The build job installs locked test dependencies, runs all tests, packages the current files and verifies repository-prefix URLs before uploading `dist/`. The dependent deployment job uses the `github-pages` environment, Pages/OIDC permissions and GitHub's official configure/upload/deploy actions. No personal access token or repository secret is required.

The workflow explicitly sets `PAGES_BASE_PATH: /manhattan-pixel-simulation/` and passes it to the production asset verification command. Because this is a buildless ES-module application, relative HTML/CSS/import URLs resolve under that path directly; a Vite `base`, React router basename, HTML `<base>` element or URL rewriting is unnecessary. The deployment uploads the contents of `dist/`, not a nested repository-name folder; GitHub Pages supplies the repository prefix.

The existing Git remote already points to `https://github.com/cqz623/manhattan-pixel-simulation.git`, and the local branch is `main`. No remote replacement, pull, reset or README overwrite was needed. Only the existing README deployment paragraph was updated; all its other project documentation was retained.

`npm run build` is a copy-only packaging command, not a frontend compilation step. It recreates ignored `dist/` from an explicit public allowlist: HTML, CSS, `src/`, `data/`, `docs/` and the root project notes. This keeps existing linked notes, evidence and data attribution available. Retained historical GIS files are published only as archived material; the active app still does not import them. Git internals, workflows, tests, scripts, dependencies and package manifests are excluded from the site artifact. Symlinks are rejected.

`.nojekyll` marks the package as a plain static site. The Actions artifact deployment bypasses Jekyll independently of this marker. Markdown notes are copied unchanged, not converted into HTML pages. No CNAME or custom domain was added.

## Local verification

```sh
npm ci
npm test
npm run build
npm run check:pages
```

`check:pages` first walks HTML links, CSS URLs, the reachable literal ES-module import graph and linked Markdown notes. It checks exact file-name case, missing files, unsupported bare imports and paths escaping the repository prefix. It then serves the actual staged bytes only below `/manhattan-pixel-simulation/` on an ephemeral loopback port, requests every discovered asset and checks JavaScript/CSS/HTML MIME types. Root-level asset requests and missing URLs must return 404 so an accidental fallback cannot hide a path error. The temporary server stops when the command finishes.

To verify another repository name explicitly:

```sh
npm run check:pages -- /renamed-repository/
```

Validation on November 19, 2026: **108 tests passed, zero failures/skips**; the staged artifact resolved **57 linked files, including 33 JavaScript modules**, beneath `/manhattan-pixel-simulation/`. All requested content matched disk bytes and browser module MIME types. Workflow YAML parsed successfully, with a push-to-main trigger, optional manual dispatch, the explicit production base path and a build-before-deploy dependency. Generated `dist/` is ignored by Git. Hash checks verify that the application HTML, CSS, source modules and data files are unchanged by this deployment preparation.

These checks verify local static hosting and path compatibility with the expected Pages URL. They do not certify a remote Pages deployment or a new interactive browser review. The browser access host was unavailable during the earlier preview checks. The hosted URL and interactive browser behavior must be checked after authorized publication. The owner confirms the Pages source is configured; no settings were changed by this readiness check.

## Steps after explicit approval

1. Pages source is already **GitHub Actions**, as confirmed by the owner. After explicit publication approval, stage and commit the complete project using the commands below. No additional framework or base-path changes are needed.
2. Review and commit the intended application files, deployment scripts/configuration, lockfile and documentation on `main`. Most project files are currently untracked; committing only the workflow would leave the application missing. Keep `node_modules/` and generated `dist/` untracked.
3. Push the approved commit to `origin/main`. **This push automatically triggers the build and deployment workflow.** No manual dispatch is needed for the first or subsequent pushes.
4. Open **Actions → Publish Pixel City to GitHub Pages** and monitor the triggered run. For an intentional rerun without a new commit, choose **Run workflow → main**. No run has been triggered during this preparation.
5. Confirm both jobs succeed and open the URL emitted by the `github-pages` environment. Verify initial map, editor, Play/Step, A/B preset runs, route overlays and JSON downloads at the repository URL. Check the browser console/network for missing modules. Confirm HTTPS when the Pages settings make it available.

For later updates, review/commit/push to `main`; each push automatically tests, packages, verifies and deploys the site. Pushing now would publish the approved source once Pages is configured, so commit/push/deployment remain on hold pending explicit approval.

Exact commands after approval, from the repository directory:

```sh
git add .github/workflows/pages.yml .gitignore .nojekyll \
  README.md package.json package-lock.json index.html styles.css \
  src data docs scripts tests \
  SEMANTIC_MODEL.md FINAL_REQUIREMENTS.md FINAL_DEMO_PLAN.md
git diff --cached --stat
git commit -m "Prepare Pixel City for GitHub Pages"
git push -u origin main
```

These commands are instructions only and have not been executed. `dist/` and `node_modules/` remain ignored. No force push, README replacement or history reset is needed. The final push automatically starts the production deployment; monitor the workflow before testing https://cqz623.github.io/manhattan-pixel-simulation/.

Official references: [publishing-source setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [custom Pages workflows and required permissions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
