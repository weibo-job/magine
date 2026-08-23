# Magine GitHub Open Source Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the current Magine desktop prototype to `weibo-job/magine` with truthful platform compatibility, safe BYOK instructions, and a clean public repository.

**Architecture:** Keep the application code and required runtime preview assets unchanged. Limit release work to public documentation, repository hygiene, selected UI screenshots, verification, and Git publication; do not claim untested Windows or Linux support.

**Tech Stack:** React, TypeScript, Vite, Electron, React Flow, Three.js, GSAP, GitHub.

**Spec:** User-approved release plan in the current Codex task.

## Global Constraints

- Officially verified package: macOS Apple Silicon DMG only.
- macOS Intel, Windows, and Linux must be labeled unverified unless tested on those systems.
- Browser mode must be labeled partial because desktop filesystem and terminal tools degrade.
- API keys must never be committed; users configure their own keys locally.
- Promotional exports and QA artifacts under `output/` must not be published as source files.
- Do not reset or discard the current uncommitted product work.

---

### Task 1: Public documentation and licensing

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `package.json`
- Create: `LICENSE`
- Create: `SECURITY.md`

**Interfaces:**
- Consumes: Current application behavior and `package.json` build scripts.
- Produces: Public setup instructions, compatibility matrix, BYOK explanation, license, and vulnerability reporting guidance.

- [ ] **Step 1:** Add `output/` to `.gitignore` while keeping `public/style-previews/` tracked.
- [ ] **Step 2:** Rewrite README with product positioning, workflow, feature list, provider setup, source development, macOS packaging, compatibility matrix, local-data behavior, limitations, and project structure.
- [ ] **Step 2a:** Replace the stale package description and add MIT/GitHub package metadata plus the Node.js version floor.
- [ ] **Step 3:** Add the MIT License for copyright holder `fusu` and year `2026`.
- [ ] **Step 4:** Add security guidance that forbids committing keys and explains private vulnerability reporting.

### Task 2: Public screenshots

**Files:**
- Create: `docs/images/roundtable.png`
- Create: `docs/images/demo-loop.png`
- Create: `docs/images/free-canvas.png`

**Interfaces:**
- Consumes: Existing verified UI captures in local `output/` folders.
- Produces: Three stable README screenshots with repository-relative paths.

- [ ] **Step 1:** Copy only the selected roundtable, Demo-loop, and free-canvas captures into `docs/images/`.
- [ ] **Step 2:** Verify each image opens and is below GitHub's 100 MB per-file limit.
- [ ] **Step 3:** Reference the three images from the matching README feature sections.

### Task 3: Safety and build verification

**Files:**
- Verify: all tracked and untracked publish candidates.

**Interfaces:**
- Consumes: Tasks 1 and 2 release tree.
- Produces: Evidence that no obvious credential is included and the application still builds.

- [ ] **Step 1:** Scan publish candidates by filename-only output for Kling, DeepSeek, Volcengine, Ark, OpenAI, and generic secret patterns.
- [ ] **Step 2:** Run `node --experimental-strip-types --test src/canvas/toolbarPanels.test.ts` and require zero failures.
- [ ] **Step 3:** Run `npm run build` and require exit code 0.
- [ ] **Step 4:** Run `git diff --check` and inspect `git status --short` plus the staged diff summary.

### Task 4: GitHub publication

**Files:**
- Publish: the reviewed Git tree to `origin/main`.

**Interfaces:**
- Consumes: Verified release tree from Task 3.
- Produces: A pushed GitHub commit and, only after confirmation, a public repository.

- [ ] **Step 1:** Fetch `origin` and verify that publishing will not overwrite unseen remote commits.
- [ ] **Step 2:** Stage source, required runtime assets, documentation, and selected screenshots; exclude all ignored output and local secrets.
- [ ] **Step 3:** Review staged filenames and staged diff summary before committing.
- [ ] **Step 4:** Commit with message `chore: prepare Magine public release`.
- [ ] **Step 5:** Push the commit to `origin/main` and verify the remote branch points to the new commit.
- [ ] **Step 6:** Ask for action-time confirmation before changing repository visibility from Private to Public.
