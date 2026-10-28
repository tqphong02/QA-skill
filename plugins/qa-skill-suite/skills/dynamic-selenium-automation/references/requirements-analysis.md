# Requirements Analysis Reference

## When to read this

Read this reference in ANALYZE mode when the user provides requirements, user stories, or business specifications that need to be translated into testable automation scenarios

## Analysis workflow

### Step 1 — Source identification

Identify the requirement source type:
- Business Requirements Document (BRD)
- User stories with acceptance criteria
- Functional specification
- UI mockups or wireframes
- Existing manual test cases
- Verbal/chat description from user

### Step 2 — Flow extraction

For each requirement, extract:
- Primary business flows (happy paths)
- Alternative flows (valid variations)
- Error/exception flows
- Boundary conditions
- State transitions
- Role-based access differences
- Data validation rules

### Step 3 — Risk assessment

Classify each flow by automation priority:

| Priority | Criteria |
|---|---|
| P1 — Must automate | Critical business flow, high regression risk, frequently executed |
| P2 — Should automate | Important flow, moderate regression risk, stable UI |
| P3 — Could automate | Nice to have, low risk, infrequent use |
| P4 — Do not automate | Unstable UI, one-time verification, requires human judgment |

### Step 4 — Test design technique mapping

Map each requirement to appropriate black-box techniques:

| Requirement type | Recommended technique |
|---|---|
| Input field with range | Boundary Value Analysis + Equivalence Partitioning |
| Multiple conditions → result | Decision Table Testing |
| Workflow with states | State Transition Testing |
| Form validation | Equivalence Partitioning + Negative Testing |
| Search/filter | Equivalence Partitioning + Error Guessing |
| Login/authentication | Decision Table + Negative Testing |
| Dropdown/selection | Equivalence Partitioning |
| Date/time input | Boundary Value Analysis |

### Step 5 — Coverage matrix

Produce a traceability matrix:

```text
REQ-ID | Requirement Description | Test Scenarios | Design Technique | Priority | Status
REQ-01 | User can login          | SC-01, SC-02   | Decision Table   | P1       | Covered
REQ-02 | Password validation     | SC-03..SC-06   | BVA + EP         | P1       | Covered
REQ-03 | Remember me             | SC-07          | EP               | P3       | Gap
```

### Step 6 — Output format

The analysis report must contain:
1. Summary of requirements analyzed
2. Business flow inventory
3. Risk-prioritized automation candidates
4. Coverage matrix with gaps identified
5. Recommended test design techniques per requirement
6. Assumptions and questions for clarification
7. Estimated number of feature files, scenarios, and page objects

## Assumptions handling

- List every assumption explicitly
- Mark unresolved expected results as `UNRESOLVED — requires BA clarification`
- Do not guess business rules; ask or mark as assumption
- Distinguish confirmed requirements from inferred behavior
