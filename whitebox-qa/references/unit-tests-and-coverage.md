# Executable unit tests and runtime coverage

## Unit-test mapping

`generate-test` accepts:

```json
{
  "framework": "vitest",
  "module": "../src/payment.service",
  "imports": [
    {"name": "PaymentService", "alias": "Subject", "default": false}
  ],
  "suite": "PaymentService.processPayment whitebox paths",
  "setup": ["const subject = new Subject()"],
  "beforeEach": ["vi.restoreAllMocks()"],
  "cases": [
    {
      "candidate_id": "WB-001",
      "title": "rejects an unknown user",
      "body": [
        "await expect(subject.processPayment(undefined, 100)).rejects.toThrow(\"USER_NOT_FOUND\")"
      ]
    }
  ]
}
```

The body is explicit executable source supplied after dependencies and expected behavior are understood. The generator never guesses mocks, constructors, test data, or assertions. It validates candidate IDs and preserves candidate/path/branch trace comments.

## Safe runtime runner

`run-coverage` only launches the selected local binary:

- `<repo>/node_modules/.bin/vitest run ... --coverage --coverage.reporter=json`
- `<repo>/node_modules/.bin/jest ... --coverage --coverageReporters=json --runInBand`

It uses `spawnSync` without a shell. An optional test path and config path are resolved inside the target repository. Test failure remains a hard failure.

## Coverage mapping

The importer reads Istanbul `coverage-final.json`, finds the analyzed target file, maps decision lines to branch counts and return/throw lines to statement counts, then sets:

- overall statement and branch percentages
- branch path evidence with count and status
- candidate runtime state: covered, partial, uncovered, or unknown

Unknown is intentionally distinct from uncovered. Recheck source revision and source maps whenever mappings are unknown.

Automatic execution is currently for Jest/Vitest. For Python, Java, Go, C#, and Dart, keep static results separate until a native coverage adapter or trustworthy compatible report is available.
