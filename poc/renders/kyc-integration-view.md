# KYC Integration View

_Where does the system touch the outside world? The engine, the API, the services that call external providers, and the providers themselves — no human touchpoints, no datastores._

**Audience:** integration-developers, partner-managers  
**Source model:** `../model/fluxnova-kyc-onboarding.architecture.json` (unmodified)  
**Scope:** 10 nodes, 9 relationships

## Nodes

| unique-id | type |
|---|---|
| `kyc-crm-sync-svc` | service |
| `kyc-document-mgmt-svc` | service |
| `kyc-fluxnova-engine` | fluxnova:engine |
| `kyc-fluxnova-rest-api` | fluxnova:rest-api |
| `kyc-identity-verification-svc` | service |
| `kyc-idv-provider` | system |
| `kyc-notification-svc` | service |
| `kyc-risk-scoring-svc` | service |
| `kyc-sanctions-screening-svc` | service |
| `kyc-watchlist-provider` | system |

## Relationships

- `kyc-engine-to-crm-sync` — connects (HTTPS): `kyc-crm-sync-svc`, `kyc-fluxnova-engine`
- `kyc-engine-to-doc-mgmt` — connects (HTTPS): `kyc-document-mgmt-svc`, `kyc-fluxnova-engine`
- `kyc-engine-to-idv-svc` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-identity-verification-svc`
- `kyc-engine-to-notification` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-notification-svc`
- `kyc-engine-to-risk-scoring` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-risk-scoring-svc`
- `kyc-engine-to-sanctions-svc` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-sanctions-screening-svc`
- `kyc-idv-svc-to-idv-provider` — connects (HTTPS): `kyc-identity-verification-svc`, `kyc-idv-provider`
- `kyc-rest-api-to-engine` — connects (HTTP): `kyc-fluxnova-engine`, `kyc-fluxnova-rest-api`
- `kyc-sanctions-svc-to-watchlist` — connects (HTTPS): `kyc-sanctions-screening-svc`, `kyc-watchlist-provider`

## Excluded (endpoints outside this view)

- `kyc-admin-to-rest-api` — outside: `kyc-fluxnova-admin`
- `kyc-cockpit-to-rest-api` — outside: `kyc-fluxnova-cockpit`
- `kyc-compliance-officer-to-tasklist` — outside: `kyc-compliance-officer`, `kyc-fluxnova-tasklist`
- `kyc-crm-sync-to-kyc-db` — outside: `kyc-kyc-database`
- `kyc-customer-to-tasklist` — outside: `kyc-customer`, `kyc-fluxnova-tasklist`
- `kyc-doc-mgmt-to-kyc-db` — outside: `kyc-kyc-database`
- `kyc-engine-to-process-db` — outside: `kyc-fluxnova-process-db`
- `kyc-idv-svc-to-kyc-db` — outside: `kyc-kyc-database`
- `kyc-ops-manager-to-cockpit` — outside: `kyc-fluxnova-cockpit`, `kyc-ops-manager`
- `kyc-platform-has-admin` — outside: `kyc-fluxnova-admin`, `kyc-fluxnova-platform`
- `kyc-platform-has-cockpit` — outside: `kyc-fluxnova-cockpit`, `kyc-fluxnova-platform`
- `kyc-platform-has-engine` — outside: `kyc-fluxnova-platform`
- `kyc-platform-has-process-db` — outside: `kyc-fluxnova-platform`, `kyc-fluxnova-process-db`
- `kyc-platform-has-rest-api` — outside: `kyc-fluxnova-platform`
- `kyc-platform-has-tasklist` — outside: `kyc-fluxnova-platform`, `kyc-fluxnova-tasklist`
- `kyc-risk-scoring-to-kyc-db` — outside: `kyc-kyc-database`
- `kyc-sanctions-svc-to-kyc-db` — outside: `kyc-kyc-database`
- `kyc-senior-compliance-to-tasklist` — outside: `kyc-fluxnova-tasklist`, `kyc-senior-compliance`
- `kyc-tasklist-to-rest-api` — outside: `kyc-fluxnova-tasklist`

---
_Rendered by the CALM Views POC (`tools/render.ts`). View semantics: listed + closure; dangling refs warn, never fail._
