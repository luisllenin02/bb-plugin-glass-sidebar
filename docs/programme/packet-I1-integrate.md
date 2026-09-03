# Packet I1 — Integration: build, install, reload, smoke-check, hand-off notes

Role: you integrate the released units into the running bb: build the fork,
reload the `bb-sidebar` plugin, install the `liquid-glass` theme plugin, run
the smoke checks, and write the hand-off note. Read
`/home/system/workspaces/LAL/Development/plans/glass-sidebar/00-brief.md` §2
and §5 first, and `/home/system/workspaces/LAL/Development/plans/glass-sidebar/01-marketplace-references.md` §3 (Theme Toggle pointer for HANDOFF.md). The orchestrator's release list is appended at the bottom of your
prompt: integrate only the packets marked RELEASED; for any marked HELD, leave
their files as they are on the branch and say so in the note.

## Steps

1. Fork: `cd /home/system/workspaces/LAL/Development/forks/bb-sidebar && git status -sb && git log --oneline main..HEAD`. Every packet commit should be present; the tree should be clean (report any stray uncommitted files, do not commit them).
2. `npx tsc --noEmit && npx vitest run --config vitest.config.ts` → must be green. If not, stop; report the failure verbatim as `blocked`.
3. `bb plugin build` in the fork (produces `dist/app.js` etc.). Then `bb plugin reload bb-sidebar`. Then `bb plugin list | grep -A4 '^bb-sidebar'` and `bb plugin logs bb-sidebar -n 60`: status must be `running`, no errors in the log tail. If the reload fails, capture the log, run `bb plugin reload bb-sidebar` once more; if it still fails, report `blocked` with the log (the host falls back to its own list, so the user is not stranded).
4. Theme: `cd /home/system/workspaces/LAL/Development/bb-plugins/liquid-glass && npm install && bb plugin types --check` (if it reports drift against the host SDK 0.4.34, run `bb plugin types` to repin, then `npm install` again) `&& npm test && bb plugin build && bb plugin install /home/system/workspaces/LAL/Development/bb-plugins/liquid-glass --yes` (if already installed, `bb plugin reload liquid-glass`). Then `bb theme list` must show `plugin:liquid-glass:liquid-glass` and `plugin:liquid-glass:liquid-glass-light` (these are the manifest ids; there is no `-dark` id). Do NOT `bb theme set`; the user chooses. Record the exact commands to activate in the note.
5. Preservation check: `git diff main..HEAD --stat -- src/*.test.tsx src/*.test.ts` must show only additions to pre-existing test files; run `git show main:src/app.test.tsx | grep -c "single"` style spot checks are not required, but the full suite must pass and its count must be ≥ 249. Then the slot conflict guard: `python3 /home/system/workspaces/LAL/Development/forks/check-plugin-slot-conflicts.py` must exit 0.
6. Optional screenshot (best effort, skip on failure): 
   `LD_LIBRARY_PATH=/tmp/libasound/extracted/usr/lib/x86_64-linux-gnu timeout 100 /home/system/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --hide-scrollbars --window-size=1600,1000 --timeout=20000 --screenshot=/home/system/workspaces/LAL/Development/plans/glass-sidebar/screens/after-sidebar.png http://127.0.0.1:38886/`
   If a PNG appears, mention its path; if not, say "screenshot unavailable".
7. Rewrite `/home/system/workspaces/LAL/Development/plans/glass-sidebar/HANDOFF.md` from scratch (the run-1 version overstated what shipped and cited a wrong theme id; do not keep its prose): what shipped (per packet, one paragraph each, with the commit hashes), what is held, how to activate the theme (`bb theme set plugin:liquid-glass:liquid-glass`), how to use folders / colours / the live strip (keyboard and mouse), how to roll back (`git -C forks/bb-sidebar checkout main && bb plugin build && bb plugin reload bb-sidebar`; `bb plugin remove liquid-glass`), and the follow-ups the reviews flagged as non-blocking (copy them from the appended review notes).

Do not modify source files. Describe only behaviour that is actually on the branch and running: verify each feature you name against `git log main..HEAD` and the file list before writing it. Record that B1 (organisation state) is live on the branch and note its review status from the release list. If the liquid-glass contract test fails again, quote the failing assertion and stop with `blocked`; the orchestrator already aligned it with SDK 0.4.34 (clsx/tailwind-merge may be devDependencies). Return the report per brief §5 plus the full path of `HANDOFF.md`.
