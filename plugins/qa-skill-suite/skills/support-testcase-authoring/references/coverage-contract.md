# Source-to-Test Coverage Contract

Use this contract for every new `execution_contract="required"` testcase source. Coverage is proven only inside the explicitly inventoried source scope; it is not a claim that every imaginable product behavior has been covered.

## 1. Inventory the source before writing cases

Read the complete supplied source, including headings, tables, notes, examples, images and linked acceptance criteria. Split it into atomic `requirements[]`, then split each requirement into non-overlapping `coverage_items` for every applicable:

- main success and documented alternative flow
- field rule, required value, format, enumeration and data dependency
- numeric, length, date, pagination or quantity boundary
- combined condition or decision-table rule
- role, permission and data-scope rule
- state and valid or forbidden transition
- documented error, timeout, retry, duplicate-submit or recovery behavior
- explicit UI state, navigation rule and responsive expectation when UI is in scope
- API auth, parameter, status, schema, header, pagination and idempotency rule when API testcase authoring is explicitly requested

Do not merge two independently observable rules into one coverage item. Preserve a stable `source_ref` such as a heading, AC ID, table row or page/section locator. If an expected result is absent or contradictory, add it to `review_required` and stop generation.

## 2. Required JSON shape

```json
{
  "requirements": [
    {
      "id": "AC1",
      "text": "Password contains 8 to 20 characters",
      "coverage_items": [
        {
          "id": "COV-AC1-BVA",
          "description": "Password length boundaries 7, 8, 9, 19, 20 and 21",
          "source_ref": "requirements.md#AC1",
          "expected_result": "Lengths 8 to 20 are accepted and values outside the range are rejected",
          "minimum_cases": 6,
          "required_case_types": ["edge"],
          "required_techniques": ["BVA", "EP"]
        }
      ]
    }
  ]
}
```

Every confirmed testcase must declare one or more same-requirement obligations:

```json
{
  "testcase_id": "AUTH-EDGE-01",
  "req": "AC1",
  "coverage_item_refs": ["COV-AC1-BVA"]
}
```

`additional` cases are out of specification and must not reference confirmed coverage items.

## 3. Fail-closed rules

The generator rejects a required-contract source when:

- a requirement has no `coverage_items`
- a coverage item lacks `description`, `source_ref` or a resolved `expected_result`
- `minimum_cases` is not met
- a required case type or black-box technique is absent across linked cases
- a testcase has no coverage ref, references an unknown item or crosses requirement ownership
- an `additional` testcase claims confirmed requirement coverage

The generated Markdown and `.automation.json` contain the validated requirement coverage matrix. Fix the JSON source and regenerate all artifacts when the matrix is incomplete.

## 4. Coverage review order

1. Compare the source inventory with headings, ACs, rules, table rows and UI/API elements in scope
2. Confirm every inventory item has a resolved observable expected result
3. Apply EP, BVA, Decision Table, State Transition, Use Case Testing, Error Guessing or Pairwise to derive the required design and minimum case count
4. Link stable testcase IDs to each coverage item
5. Review uncovered, ambiguous and out-of-spec items before artifact generation

