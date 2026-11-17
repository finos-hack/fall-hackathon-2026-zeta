# Screening Neighborhood (derived)

_Derived view: 1-hop neighborhood of kyc-sanctions-screening-svc._

**Audience:** risk-analysts  
**Source model:** `../model/fluxnova-kyc-onboarding.architecture.json` (unmodified)  
**Scope:** 4 nodes, 3 relationships

## Nodes

| unique-id | type |
|---|---|
| `kyc-fluxnova-engine` | fluxnova:engine |
| `kyc-kyc-database` | database |
| `kyc-sanctions-screening-svc` | service |
| `kyc-watchlist-provider` | system |

## Relationships

- `kyc-engine-to-sanctions-svc` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-sanctions-screening-svc`
- `kyc-sanctions-svc-to-kyc-db` — connects (JDBC): `kyc-kyc-database`, `kyc-sanctions-screening-svc`
- `kyc-sanctions-svc-to-watchlist` — connects (HTTPS): `kyc-sanctions-screening-svc`, `kyc-watchlist-provider`

## Excluded (endpoints outside this view)

- `kyc-admin-to-rest-api` — outside: `kyc-fluxnova-admin`, `kyc-fluxnova-rest-api`
- `kyc-cockpit-to-rest-api` — outside: `kyc-fluxnova-cockpit`, `kyc-fluxnova-rest-api`
- `kyc-compliance-officer-to-tasklist` — outside: `kyc-compliance-officer`, `kyc-fluxnova-tasklist`
- `kyc-crm-sync-to-kyc-db` — outside: `kyc-crm-sync-svc`
- `kyc-customer-to-tasklist` — outside: `kyc-customer`, `kyc-fluxnova-tasklist`
- `kyc-doc-mgmt-to-kyc-db` — outside: `kyc-document-mgmt-svc`
- `kyc-engine-to-crm-sync` — outside: `kyc-crm-sync-svc`
- `kyc-engine-to-doc-mgmt` — outside: `kyc-document-mgmt-svc`
- `kyc-engine-to-idv-svc` — outside: `kyc-identity-verification-svc`
- `kyc-engine-to-notification` — outside: `kyc-notification-svc`
- `kyc-engine-to-process-db` — outside: `kyc-fluxnova-process-db`
- `kyc-engine-to-risk-scoring` — outside: `kyc-risk-scoring-svc`
- `kyc-idv-svc-to-idv-provider` — outside: `kyc-identity-verification-svc`, `kyc-idv-provider`
- `kyc-idv-svc-to-kyc-db` — outside: `kyc-identity-verification-svc`
- `kyc-ops-manager-to-cockpit` — outside: `kyc-fluxnova-cockpit`, `kyc-ops-manager`
- `kyc-platform-has-admin` — outside: `kyc-fluxnova-admin`, `kyc-fluxnova-platform`
- `kyc-platform-has-cockpit` — outside: `kyc-fluxnova-cockpit`, `kyc-fluxnova-platform`
- `kyc-platform-has-engine` — outside: `kyc-fluxnova-platform`
- `kyc-platform-has-process-db` — outside: `kyc-fluxnova-platform`, `kyc-fluxnova-process-db`
- `kyc-platform-has-rest-api` — outside: `kyc-fluxnova-platform`, `kyc-fluxnova-rest-api`
- `kyc-platform-has-tasklist` — outside: `kyc-fluxnova-platform`, `kyc-fluxnova-tasklist`
- `kyc-rest-api-to-engine` — outside: `kyc-fluxnova-rest-api`
- `kyc-risk-scoring-to-kyc-db` — outside: `kyc-risk-scoring-svc`
- `kyc-senior-compliance-to-tasklist` — outside: `kyc-fluxnova-tasklist`, `kyc-senior-compliance`
- `kyc-tasklist-to-rest-api` — outside: `kyc-fluxnova-rest-api`, `kyc-fluxnova-tasklist`

---
_Rendered by the CALM Views POC (`tools/render.ts`). View semantics: listed + closure; dangling refs warn, never fail._


---
_Rendered 2026-11-17 by calm-views-tools@0.1.0 from fluxnova-kyc-onboarding.architecture.json sha256:54a5d6066987._
