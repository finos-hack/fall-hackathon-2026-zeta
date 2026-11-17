# Submission

- Project: Calm views — one model, three readers
- Track: Track 3 Features
- Team: zeta — Andrés Antoniuk (solo)
- Repo state at submission: README filled, `submit.md` present, POC
  workspace with 10/10 validate OK, 38/38 tests green from a clean clone,
  DCO on every commit, CI green (install, build, test, validate, plus
  both governance gates).
- POC issue: none (decided 2026-11-14 — no POC issue). Community vehicle is
  the comment on `finos/architecture-as-code#3731`, plus link if applicable.
- Demo: live (validate + coverage gates → render + gallery + Canvas spike
  with the grouped view selector and drill-down). No recording.
- Evidence for `finos/architecture-as-code#2344`: named, versioned views
  as sidecars with audience and filter, zero presentation in the schema.
  Two models: the vendored KYC architecture (20 nodes, untouched) and the
  redistributable eCH-0122 Swiss e-government reference (155 nodes, layers
  and capabilities as views). Reader-side queries run over both via
  `query.js` (including `context` bundles and `coverage --require` gates).
- Why FINOS should care: views graduate through the calm-schema pipeline and
  land as a Hub extension tab, an integration path, not just a demo.
  Reader-side queries (#2344 territory) are designed to sit on CalmGraph
  when `calm query` (#3661) lands. A view selects, a lens draws.

Submission checklist (Wed 18/11, hard stop 19:00 local):

- [x] Project name and track confirmed.
- [x] README filled in the zeta repo via PR (branch, never direct to main).
- [x] `submit.md` present in the zeta repo via PR.
- [x] Revert of the 2 early commits included via PR (decided 2026-11-14).
- [ ] DCO audit: every commit carries matching Signed-off-by.
- [ ] Reread diff for environment mentions or private material.
- [ ] Confirm receipt per the channel announced at kickoff.
