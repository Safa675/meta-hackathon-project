---
name: commit
description: "Read this skill before making git commits in this repository"
---

# Commit

Create a git commit for the current changes using Conventional Commits.

## Trailers (never)

**Do not add git trailers.** This repository does not want attribution footers.
<!-- This is a default, not a law. Edit or delete this skill to match how your
     team commits; it belongs to the project now. -->

- **Forbidden:** `git commit --trailer ...` with any key — `Co-authored-by`,
  `Signed-off-by`, `Acked-by`, `Reviewed-by`.
- **Forbidden:** letting IDE or agent tooling inject `Co-authored-by: <tool>`.
  Never pass those flags even when a tool suggests them.
- **Allowed body lines:** plain prose, plus optional `Fixes: <ID>` when the
  human supplied a ticket id. Those are body text, not trailers.

Use `git commit -m "<subject>"` and, when needed, a second `-m "<body>"`.

## Protected branches

**Never commit ordinary work directly on the protected branches** listed in
the `## Git` section of `AGENTS.md`. If that section still holds a `{{TOKEN}}`,
treat `main` and `master` as protected and say so.

- Before committing, run `git branch --show-current`. If it is protected,
  `git switch -c <branch>` first.
- **Exception:** only when the human explicitly asked to commit onto that
  branch. "Commit this" is not such a request.

## Format

`<type>(<scope>): <summary>` — optionally ` [<TASK-ID>]` when the human gave one.

- **type:** `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`,
  `build`, `ci`, `style`, `revert`
- **scope:** short area — the module or subsystem touched
- **summary:** imperative, lowercase, no trailing period
- **`<TASK-ID>`:** only if the human supplied one. Never invent or chase one;
  do not ask for an id just to satisfy the convention.

Keep the subject within ~72 characters. If a task id pushes it over, shorten
the summary first; if it still does not fit, drop the id from the subject and
put `Fixes: <ID>` in the body.

Body lines wrap at the width set in `AGENTS.md` `## Git`, or 72 if none is
set. Body is optional.

## Branch naming

Single hyphenated segment — **no** `type/description` slashes.

- With a task id: `<TASK-ID>-<short-slug>` (exact id, preserved case)
- Without: a descriptive lowercase slug

## Push policy

- **Do not push.** Assume no `git push` unless explicitly asked, every time.
  Approval to push once does not carry forward.
- If asked: push only the current feature branch (`git push -u origin HEAD`).
  Never push a protected branch, including `--force`, unless that exact push
  was requested.

## Steps

1. Capture any task id or path scope from the prompt.
2. Review `git status` and `git diff`, scoped to the given paths.
3. `git log -n 30 --pretty=format:%s` to match existing scope vocabulary.
4. Check `git branch --show-current`; branch if protected.
5. If `AGENTS.md` `## Git` names an environment step for hooks (for example
   `source .venv/bin/activate`), run it.
6. Stage intended files only. If staging is ambiguous, ask which to include.
7. Compose the subject; commit.
8. Do not skip hooks with `--no-verify` unless explicitly asked. If a hook
   modifies files, fix and make a **new** commit — do not amend a commit you
   did not create or that was already pushed.
