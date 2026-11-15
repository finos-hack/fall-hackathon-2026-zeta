# KYC Platform View

_What does the platform team operate? The FluxNova platform container, the engine and its services, and the process database — no actors, no external providers._

**Audience:** platform-engineers, sre  
**Source model:** `../model/fluxnova-kyc-onboarding.architecture.json` (unmodified)  
**Scope:** 14 nodes, 22 relationships

## Nodes

| unique-id | type |
|---|---|
| `kyc-crm-sync-svc` | service |
| `kyc-document-mgmt-svc` | service |
| `kyc-fluxnova-admin` | fluxnova:admin |
| `kyc-fluxnova-cockpit` | fluxnova:cockpit |
| `kyc-fluxnova-engine` | fluxnova:engine |
| `kyc-fluxnova-platform` | fluxnova:platform |
| `kyc-fluxnova-process-db` | fluxnova:process-db |
| `kyc-fluxnova-rest-api` | fluxnova:rest-api |
| `kyc-fluxnova-tasklist` | fluxnova:tasklist |
| `kyc-identity-verification-svc` | service |
| `kyc-kyc-database` | database |
| `kyc-notification-svc` | service |
| `kyc-risk-scoring-svc` | service |
| `kyc-sanctions-screening-svc` | service |

## Relationships

- `kyc-admin-to-rest-api` — connects (HTTPS): `kyc-fluxnova-admin`, `kyc-fluxnova-rest-api`
- `kyc-cockpit-to-rest-api` — connects (HTTPS): `kyc-fluxnova-cockpit`, `kyc-fluxnova-rest-api`
- `kyc-crm-sync-to-kyc-db` — connects (JDBC): `kyc-crm-sync-svc`, `kyc-kyc-database`
- `kyc-doc-mgmt-to-kyc-db` — connects (JDBC): `kyc-document-mgmt-svc`, `kyc-kyc-database`
- `kyc-engine-to-crm-sync` — connects (HTTPS): `kyc-crm-sync-svc`, `kyc-fluxnova-engine`
- `kyc-engine-to-doc-mgmt` — connects (HTTPS): `kyc-document-mgmt-svc`, `kyc-fluxnova-engine`
- `kyc-engine-to-idv-svc` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-identity-verification-svc`
- `kyc-engine-to-notification` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-notification-svc`
- `kyc-engine-to-process-db` — connects (JDBC): `kyc-fluxnova-engine`, `kyc-fluxnova-process-db`
- `kyc-engine-to-risk-scoring` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-risk-scoring-svc`
- `kyc-engine-to-sanctions-svc` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-sanctions-screening-svc`
- `kyc-idv-svc-to-kyc-db` — connects (JDBC): `kyc-identity-verification-svc`, `kyc-kyc-database`
- `kyc-platform-has-admin` — composed-of: `kyc-fluxnova-admin`, `kyc-fluxnova-platform`
- `kyc-platform-has-cockpit` — composed-of: `kyc-fluxnova-cockpit`, `kyc-fluxnova-platform`
- `kyc-platform-has-engine` — composed-of: `kyc-fluxnova-engine`, `kyc-fluxnova-platform`
- `kyc-platform-has-process-db` — composed-of: `kyc-fluxnova-platform`, `kyc-fluxnova-process-db`
- `kyc-platform-has-rest-api` — composed-of: `kyc-fluxnova-platform`, `kyc-fluxnova-rest-api`
- `kyc-platform-has-tasklist` — composed-of: `kyc-fluxnova-platform`, `kyc-fluxnova-tasklist`
- `kyc-rest-api-to-engine` — connects (HTTP): `kyc-fluxnova-engine`, `kyc-fluxnova-rest-api`
- `kyc-risk-scoring-to-kyc-db` — connects (JDBC): `kyc-kyc-database`, `kyc-risk-scoring-svc`
- `kyc-sanctions-svc-to-kyc-db` — connects (JDBC): `kyc-kyc-database`, `kyc-sanctions-screening-svc`
- `kyc-tasklist-to-rest-api` — connects (HTTPS): `kyc-fluxnova-rest-api`, `kyc-fluxnova-tasklist`

## Excluded (endpoints outside this view)

- `kyc-compliance-officer-to-tasklist` — outside: `kyc-compliance-officer`
- `kyc-customer-to-tasklist` — outside: `kyc-customer`
- `kyc-idv-svc-to-idv-provider` — outside: `kyc-idv-provider`
- `kyc-ops-manager-to-cockpit` — outside: `kyc-ops-manager`
- `kyc-sanctions-svc-to-watchlist` — outside: `kyc-watchlist-provider`
- `kyc-senior-compliance-to-tasklist` — outside: `kyc-senior-compliance`

---
_Rendered by the CALM Views POC (`tools/render.ts`). View semantics: listed + closure; dangling refs warn, never fail._
