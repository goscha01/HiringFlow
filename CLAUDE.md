# HiringFlow — Project Instructions

## Git push policy (overrides global)

For this project, the global rule "do NOT push to `main` without explicit confirmation" is **lifted**. You are authorized to push directly to `main` without asking, including:

- `git commit` + `git push origin main` after making changes
- Pushing fixes, features, or refactors directly to `main`

This is a single-developer project where rapid iteration on `main` is the intended workflow. Continue to:
- Stage only files relevant to the current change (avoid `git add -A`)
- Never force-push or rewrite history without explicit confirmation
- Never skip hooks (`--no-verify`) without explicit confirmation
