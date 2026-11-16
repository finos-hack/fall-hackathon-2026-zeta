# Inside the Platform (derived)

_Derived view: inside kyc-fluxnova-platform (composed-of members only)._

**Audience:** platform-engineers, sre  
**Source model:** `../model/fluxnova-kyc-onboarding.architecture.json` (unmodified)  
**Scope:** 6 nodes, 5 relationships

## Nodes

| unique-id | type |
|---|---|
| `kyc-fluxnova-admin` | fluxnova:admin |
| `kyc-fluxnova-cockpit` | fluxnova:cockpit |
| `kyc-fluxnova-engine` | fluxnova:engine |
| `kyc-fluxnova-process-db` | fluxnova:process-db |
| `kyc-fluxnova-rest-api` | fluxnova:rest-api |
| `kyc-fluxnova-tasklist` | fluxnova:tasklist |

## Relationships

- `kyc-admin-to-rest-api` — connects (HTTPS): `kyc-fluxnova-admin`, `kyc-fluxnova-rest-api`
- `kyc-cockpit-to-rest-api` — connects (HTTPS): `kyc-fluxnova-cockpit`, `kyc-fluxnova-rest-api`
- `kyc-engine-to-process-db` — connects (JDBC): `kyc-fluxnova-engine`, `kyc-fluxnova-process-db`
- `kyc-rest-api-to-engine` — connects (HTTP): `kyc-fluxnova-engine`, `kyc-fluxnova-rest-api`
- `kyc-tasklist-to-rest-api` — connects (HTTPS): `kyc-fluxnova-rest-api`, `kyc-fluxnova-tasklist`

## Excluded (endpoints outside this view)

- `kyc-compliance-officer-to-tasklist` — outside: `kyc-compliance-officer`
- `kyc-crm-sync-to-kyc-db` — outside: `kyc-crm-sync-svc`, `kyc-kyc-database`
- `kyc-customer-to-tasklist` — outside: `kyc-customer`
- `kyc-doc-mgmt-to-kyc-db` — outside: `kyc-document-mgmt-svc`, `kyc-kyc-database`
- `kyc-engine-to-crm-sync` — outside: `kyc-crm-sync-svc`
- `kyc-engine-to-doc-mgmt` — outside: `kyc-document-mgmt-svc`
- `kyc-engine-to-idv-svc` — outside: `kyc-identity-verification-svc`
- `kyc-engine-to-notification` — outside: `kyc-notification-svc`
- `kyc-engine-to-risk-scoring` — outside: `kyc-risk-scoring-svc`
- `kyc-engine-to-sanctions-svc` — outside: `kyc-sanctions-screening-svc`
- `kyc-idv-svc-to-idv-provider` — outside: `kyc-identity-verification-svc`, `kyc-idv-provider`
- `kyc-idv-svc-to-kyc-db` — outside: `kyc-identity-verification-svc`, `kyc-kyc-database`
- `kyc-ops-manager-to-cockpit` — outside: `kyc-ops-manager`
- `kyc-platform-has-admin` — outside: `kyc-fluxnova-platform`
- `kyc-platform-has-cockpit` — outside: `kyc-fluxnova-platform`
- `kyc-platform-has-engine` — outside: `kyc-fluxnova-platform`
- `kyc-platform-has-process-db` — outside: `kyc-fluxnova-platform`
- `kyc-platform-has-rest-api` — outside: `kyc-fluxnova-platform`
- `kyc-platform-has-tasklist` — outside: `kyc-fluxnova-platform`
- `kyc-risk-scoring-to-kyc-db` — outside: `kyc-kyc-database`, `kyc-risk-scoring-svc`
- `kyc-sanctions-svc-to-kyc-db` — outside: `kyc-kyc-database`, `kyc-sanctions-screening-svc`
- `kyc-sanctions-svc-to-watchlist` — outside: `kyc-sanctions-screening-svc`, `kyc-watchlist-provider`
- `kyc-senior-compliance-to-tasklist` — outside: `kyc-senior-compliance`

---
_Rendered by the CALM Views POC (`tools/render.ts`). View semantics: listed + closure; dangling refs warn, never fail._
