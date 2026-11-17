# Audit logging coverage

_Every node and relationship that carries an audit-logging control claim: the answer to which parts of the system log for the auditor._

**Audience:** auditors, compliance-officers  
**Source model:** `../model/fluxnova-kyc-onboarding.architecture.json` (unmodified)  
**Scope:** 4 nodes, 3 relationships

## Nodes

| unique-id | type |
|---|---|
| `kyc-fluxnova-engine` | fluxnova:engine |
| `kyc-identity-verification-svc` | service |
| `kyc-risk-scoring-svc` | service |
| `kyc-sanctions-screening-svc` | service |

## Relationships

- `kyc-engine-to-idv-svc` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-identity-verification-svc`
- `kyc-engine-to-risk-scoring` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-risk-scoring-svc`
- `kyc-engine-to-sanctions-svc` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-sanctions-screening-svc`

## Excluded (endpoints outside this view)

- `kyc-admin-to-rest-api` — outside: `kyc-fluxnova-admin`, `kyc-fluxnova-rest-api`
- `kyc-cockpit-to-rest-api` — outside: `kyc-fluxnova-cockpit`, `kyc-fluxnova-rest-api`
- `kyc-compliance-officer-to-tasklist` — outside: `kyc-compliance-officer`, `kyc-fluxnova-tasklist`
- `kyc-crm-sync-to-kyc-db` — outside: `kyc-crm-sync-svc`, `kyc-kyc-database`
- `kyc-customer-to-tasklist` — outside: `kyc-customer`, `kyc-fluxnova-tasklist`
- `kyc-doc-mgmt-to-kyc-db` — outside: `kyc-document-mgmt-svc`, `kyc-kyc-database`
- `kyc-engine-to-crm-sync` — outside: `kyc-crm-sync-svc`
- `kyc-engine-to-doc-mgmt` — outside: `kyc-document-mgmt-svc`
- `kyc-engine-to-notification` — outside: `kyc-notification-svc`
- `kyc-engine-to-process-db` — outside: `kyc-fluxnova-process-db`
- `kyc-idv-svc-to-idv-provider` — outside: `kyc-idv-provider`
- `kyc-idv-svc-to-kyc-db` — outside: `kyc-kyc-database`
- `kyc-ops-manager-to-cockpit` — outside: `kyc-fluxnova-cockpit`, `kyc-ops-manager`
- `kyc-platform-has-admin` — outside: `kyc-fluxnova-admin`, `kyc-fluxnova-platform`
- `kyc-platform-has-cockpit` — outside: `kyc-fluxnova-cockpit`, `kyc-fluxnova-platform`
- `kyc-platform-has-engine` — outside: `kyc-fluxnova-platform`
- `kyc-platform-has-process-db` — outside: `kyc-fluxnova-platform`, `kyc-fluxnova-process-db`
- `kyc-platform-has-rest-api` — outside: `kyc-fluxnova-platform`, `kyc-fluxnova-rest-api`
- `kyc-platform-has-tasklist` — outside: `kyc-fluxnova-platform`, `kyc-fluxnova-tasklist`
- `kyc-rest-api-to-engine` — outside: `kyc-fluxnova-rest-api`
- `kyc-risk-scoring-to-kyc-db` — outside: `kyc-kyc-database`
- `kyc-sanctions-svc-to-kyc-db` — outside: `kyc-kyc-database`
- `kyc-sanctions-svc-to-watchlist` — outside: `kyc-watchlist-provider`
- `kyc-senior-compliance-to-tasklist` — outside: `kyc-fluxnova-tasklist`, `kyc-senior-compliance`
- `kyc-tasklist-to-rest-api` — outside: `kyc-fluxnova-rest-api`, `kyc-fluxnova-tasklist`

---
_Rendered by the CALM Views POC (`tools/render.ts`). View semantics: listed + closure; dangling refs warn, never fail._


---
_Rendered 2026-11-17 by calm-views-tools@0.1.0 from fluxnova-kyc-onboarding.architecture.json sha256:54a5d6066987._
