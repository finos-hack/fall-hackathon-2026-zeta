# KYC Audit View

_Where can a compliance officer see control coverage? Human touchpoints, the screening and scoring services, the database holding PII, the external providers receiving data, and the screening-effectiveness evaluation._

**Audience:** compliance-officers, auditors  
**Source model:** `../model/fluxnova-kyc-onboarding.architecture.json` (unmodified)  
**Scope:** 14 nodes, 14 relationships

## Nodes

| unique-id | type |
|---|---|
| `kyc-compliance-officer` | actor |
| `kyc-customer` | actor |
| `kyc-document-mgmt-svc` | service |
| `kyc-fluxnova-cockpit` | fluxnova:cockpit |
| `kyc-fluxnova-engine` | fluxnova:engine |
| `kyc-fluxnova-tasklist` | fluxnova:tasklist |
| `kyc-identity-verification-svc` | service |
| `kyc-idv-provider` | system |
| `kyc-kyc-database` | database |
| `kyc-ops-manager` | actor |
| `kyc-risk-scoring-svc` | service |
| `kyc-sanctions-screening-svc` | service |
| `kyc-senior-compliance` | actor |
| `kyc-watchlist-provider` | system |

## Relationships

- `kyc-compliance-officer-to-tasklist` — interacts: `kyc-compliance-officer`, `kyc-fluxnova-tasklist`
- `kyc-customer-to-tasklist` — interacts: `kyc-customer`, `kyc-fluxnova-tasklist`
- `kyc-doc-mgmt-to-kyc-db` — connects (JDBC): `kyc-document-mgmt-svc`, `kyc-kyc-database`
- `kyc-engine-to-doc-mgmt` — connects (HTTPS): `kyc-document-mgmt-svc`, `kyc-fluxnova-engine`
- `kyc-engine-to-idv-svc` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-identity-verification-svc`
- `kyc-engine-to-risk-scoring` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-risk-scoring-svc`
- `kyc-engine-to-sanctions-svc` — connects (HTTPS): `kyc-fluxnova-engine`, `kyc-sanctions-screening-svc`
- `kyc-idv-svc-to-idv-provider` — connects (HTTPS): `kyc-identity-verification-svc`, `kyc-idv-provider`
- `kyc-idv-svc-to-kyc-db` — connects (JDBC): `kyc-identity-verification-svc`, `kyc-kyc-database`
- `kyc-ops-manager-to-cockpit` — interacts: `kyc-fluxnova-cockpit`, `kyc-ops-manager`
- `kyc-risk-scoring-to-kyc-db` — connects (JDBC): `kyc-kyc-database`, `kyc-risk-scoring-svc`
- `kyc-sanctions-svc-to-kyc-db` — connects (JDBC): `kyc-kyc-database`, `kyc-sanctions-screening-svc`
- `kyc-sanctions-svc-to-watchlist` — connects (HTTPS): `kyc-sanctions-screening-svc`, `kyc-watchlist-provider`
- `kyc-senior-compliance-to-tasklist` — interacts: `kyc-fluxnova-tasklist`, `kyc-senior-compliance`

## Decorator: `kyc-screening-effectiveness` (control-evaluation)

Applies to: `kyc-identity-verification-svc`, `kyc-sanctions-screening-svc`, `kyc-risk-scoring-svc`, `kyc-kyc-database`

```json
{
  "evaluation": "sanctions and identity screening run synchronously in the onboarding path; screening outcomes persist in kyc-database for supervisory review",
  "reviewed": "2026-10-30",
  "outcome": "effective-with-observations"
}
```

## Excluded (endpoints outside this view)

- `kyc-admin-to-rest-api` — outside: `kyc-fluxnova-admin`, `kyc-fluxnova-rest-api`
- `kyc-cockpit-to-rest-api` — outside: `kyc-fluxnova-rest-api`
- `kyc-crm-sync-to-kyc-db` — outside: `kyc-crm-sync-svc`
- `kyc-engine-to-crm-sync` — outside: `kyc-crm-sync-svc`
- `kyc-engine-to-notification` — outside: `kyc-notification-svc`
- `kyc-engine-to-process-db` — outside: `kyc-fluxnova-process-db`
- `kyc-platform-has-admin` — outside: `kyc-fluxnova-admin`, `kyc-fluxnova-platform`
- `kyc-platform-has-cockpit` — outside: `kyc-fluxnova-platform`
- `kyc-platform-has-engine` — outside: `kyc-fluxnova-platform`
- `kyc-platform-has-process-db` — outside: `kyc-fluxnova-platform`, `kyc-fluxnova-process-db`
- `kyc-platform-has-rest-api` — outside: `kyc-fluxnova-platform`, `kyc-fluxnova-rest-api`
- `kyc-platform-has-tasklist` — outside: `kyc-fluxnova-platform`
- `kyc-rest-api-to-engine` — outside: `kyc-fluxnova-rest-api`
- `kyc-tasklist-to-rest-api` — outside: `kyc-fluxnova-rest-api`

---
_Rendered by the CALM Views POC (`tools/render.ts`). View semantics: listed + closure; dangling refs warn, never fail._
