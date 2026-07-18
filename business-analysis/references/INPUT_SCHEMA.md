# Business analysis JSON contract

Use one JSON object as the source for XMind, Q&A Markdown and Q&A Excel

## Required top-level fields

```json
{
  "project": "Project name",
  "scope": "Scope reviewed",
  "analysis_date": "2026-07-18",
  "source_markdown": ["docs/spec.md"],
  "executive_summary": "Short confirmed summary",
  "actors": [],
  "modules": [],
  "cross_cutting": [],
  "review_coverage": [],
  "questions": []
}
```

## Fact status

Use one of:

- `verified` for a fact directly supported by a source reference
- `inferred` for a reasonable interpretation that still needs confirmation
- `unresolved` when the document does not define the behavior

## Actor

```json
{
  "name": "Administrator",
  "responsibilities": ["Manage users"],
  "permissions": ["Create user", "Disable user"],
  "status": "verified",
  "source_ref": "spec.md#roles"
}
```

## Module and flow

```json
{
  "name": "Authentication",
  "purpose": "Authenticate a registered user",
  "status": "verified",
  "source_ref": "spec.md#login",
  "flows": [
    {
      "id": "FLOW-001",
      "name": "Login with email and password",
      "actor": "Registered user",
      "status": "verified",
      "source_ref": "spec.md#login",
      "preconditions": ["Account is active"],
      "trigger": "User submits login form",
      "steps": [
        {
          "id": "S1",
          "action": "Enter valid email and password",
          "system_response": "Validate credentials",
          "state_change": "No state change",
          "api_data": "POST /login",
          "source_ref": "spec.md#login"
        }
      ],
      "outcomes": ["Authenticated session is created"],
      "alternate_flows": [],
      "exceptions": [],
      "business_rules": [],
      "dependencies": [],
      "unresolved": []
    }
  ]
}
```

## Review coverage

Include all 18 exact area names from `SENIOR_REVIEW_CHECKLIST.md`

```json
{
  "area": "Scope and actors",
  "status": "checked",
  "notes": "Actors are listed but tenant boundary is unclear",
  "source_ref": "spec.md#scope",
  "question_ids": ["QA-001"]
}
```

Allowed status: `checked`, `blocked`, `not_applicable`

## Q&A item

```json
{
  "id": "QA-001",
  "category": "Roles and permissions",
  "module_flow": "Authentication / Disable user",
  "source_ref": "spec.md#roles",
  "ambiguity_gap": "Document does not define active session behavior after disable",
  "risk": "A disabled user may retain access",
  "question": "Should all active sessions be revoked immediately when the account is disabled?",
  "proposed_assumption": "Revoke all sessions immediately",
  "owner": "PO",
  "priority": "P0",
  "status": "Open",
  "answer": ""
}
```

Allowed priority: `P0`, `P1`, `P2`, `P3`

Allowed question status: `Open`, `Answered`, `Blocked`, `Cancelled`

If `id` is omitted, the renderer assigns `QA-001`, `QA-002` in list order. Do not reorder questions independently after generation

## Cross-cutting item

```json
{
  "name": "Audit trail",
  "details": ["Record actor and timestamp for user status changes"],
  "status": "unresolved",
  "source_ref": "Missing from source"
}
```

## Merge rule

When analysis already exists, read the JSON and previous Q&A first. Preserve stable flow IDs and Question IDs. Add new items at the end, update answered items in place and regenerate all three outputs
