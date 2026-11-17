# Submission

- Project: Calm views — named selections over CALM architectures
- Track: Track 3 Features
- Team: zeta — Andrés Antoniuk (solo)
- Why FINOS should care: CALM has models and diagrams but no reader layer.
  Issue [#2344](https://github.com/finos/architecture-as-code/issues/2344) is open because views are not first-class. This entry ships
  that missing layer as evidence: named, versioned, reviewable selections
  over untouched models, with real control claims, a redistributable
  reference model, and governance gates running in CI. The graduation path
  is concrete: view schema into the calm-schema pipeline, a Hub extension
  tab, and reader-side queries sitting on CalmGraph when `calm query`
  ([#3661](https://github.com/finos/architecture-as-code/issues/3661)) lands. A view selects, a lens draws.
- Repo state at submission: README filled, `submit.md` present, POC
  workspace with 10/10 validate OK, 38/38 tests green from a clean clone,
  DCO on every commit, CI green (install, build, test, validate, plus
  both governance gates).
- POC issue: none (decided 2026-11-14 — no POC issue). Community vehicle is
  the comment on [finos/architecture-as-code#3731](https://github.com/finos/architecture-as-code/issues/3731), plus link if applicable.
- Demo: live (validate + coverage gates → render + gallery + Canvas spike
  with the grouped view selector and drill-down). No recording.

Submission checklist (Wed 18/11, hard stop 19:00 local):

- [ ] Project name and track confirmed.
- [ ] README filled in the zeta repo via PR (rama, nunca directo a main).
- [ ] `submit.md` present in the zeta repo via PR.
- [ ] DCO audit: every commit carries matching Signed-off-by.
- [ ] Reread diff for environment mentions or private material.
- [ ] Confirm receipt per the channel announced at kickoff.
