# Views as context for AI agents

Views double as the context unit for agents. `query context <view-id>`
resolves a named view into a compact LLM-ready bundle. Real output for the
KYC audit view (48 lines total, deterministic):

```
# view: kyc-audit-view (KYC Audit View)
audience: compliance-officers, auditors
group: KYC onboarding
model: model/fluxnova-kyc-onboarding.architecture.json sha256:54a5d6066987cd41ffbaf5e8fb1e666a03816074c56aa8219111396abd2a4541
scope: 12/20 nodes, 14/28 relationships
## nodes
- kyc-kyc-database [database] KYC Database
- kyc-sanctions-screening-svc [service] Sanctions & PEP Screening Service
## relationships
- kyc-sanctions-svc-to-kyc-db [connects] kyc-sanctions-screening-svc, kyc-kyc-database
## excluded (endpoints outside this view)
- kyc-engine-to-notification (outside: kyc-fluxnova-engine, kyc-notification-svc)
```

(Full output: run `node dist/query.js context kyc-audit-view` from `poc/tools`.)

The sha pins exactly which model bytes the answer is about. Scope states
what the agent sees (12/20) and excluded-with-reason states what it does
not. Governance lands before any agent reads anything: `coverage --require`
gates in CI fail the build when a node claiming audit-logging or
data-classification is missing from every auditor view. No server, no SQL.
Designed to sit on CalmGraph when calm query (#3661) lands.

- Repo: https://github.com/finos-hack/fall-hackathon-2026-zeta
- Demo video: https://youtu.be/FgxKLOsVypE
- https://github.com/finos/architecture-as-code/issues/2344
- https://github.com/finos/architecture-as-code/issues/3661
