# Submission

- **Project:** Calm views, named selections over CALM architectures
- **Track:** Track 3 Features
- **Team:** zeta (Andrés Antoniuk, solo)
- **Why FINOS should care:** CALM has models and diagrams. It has no named, versioned
  reader selections yet. Issue [#2344](https://github.com/finos/architecture-as-code/issues/2344)
  is open because views are not first-class. This entry gives the missing layer as evidence.
  A view is a named, versioned, reviewable selection over an unchanged model.
  The entry includes real control claims, a reference model with an open license,
  and governance gates in a CI workflow. The path to graduation has three steps.
  First, move the view schema into the calm-schema pipeline. Second, add a Hub extension tab.
  Third, sit reader-side queries on CalmGraph when `calm query`
  ([#3661](https://github.com/finos/architecture-as-code/issues/3661)) lands.
  A view selects. A lens draws.
- **Repo state:** README, `submit.md`, `OPERATION.md` and `poc/` are present.
  The checks ran on this repository state. `OPERATION.md` lists the commands.
  - 16 of 16 view files validate.
  - 69 of 69 tools tests pass.
  - 15 of 15 lens extension tests pass.
  - The seed script test passes.
  - Every commit carries a DCO sign-off.
- **POC issue:** none. The community vehicle is the comment on
  [finos/architecture-as-code#3731](https://github.com/finos/architecture-as-code/issues/3731).
- **Demo:** live. The demo shows validation, the coverage gates, renders and the gallery.
  It also shows the Hub lens with drill-down and the Canvas spike. There is no recording.
