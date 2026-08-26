# Canonical Allure contract

This is the only Allure result format emitted by the deterministic web-automation skill. Do not add a second fixture, reporter directory, parameter spelling, or evidence naming convention.

## Fixed output

| Artifact | Path | Rule |
|---|---|---|
| Raw Allure results | `reports/allure-results` | Cleared before each unified run |
| Generated report | `reports/allure-report` | Generated with `allure generate ... --clean` |
| Contract result | `reports/allure-contract.json` | Must be `PASS` before UI/functional `PASS` or `FAILED` is projected |
| Playwright evidence root | `evidence/test-results` | Same run/session as the Allure result |

The reporter is fixed in `playwright.config.ts`:

```ts
['allure-playwright', {
  resultsDir: 'reports/allure-results',
  detail: true,
  suiteTitle: false,
}]
```

Generated specs import `test` and `expect` from `fixtures/pom`. They must not import `allure-playwright` directly to create their own metadata format.

## Required parameters

Every executable result has these parameters, in this logical order:

| Name | Value | Source and safety rule |
|---|---|---|
| `account` | account slot or role label | Stable non-secret label only; never an email, password, token or cookie |
| `url` | final page URL | Absolute `http(s)` URL from the same Playwright page/session |
| `evidence_image` | `evidence-image` or `N/A` | Points to the canonical image attachment |
| `evidence_video` | `evidence-video` or `N/A` | Points to the canonical video attachment |

The fixture may also add only these stable metadata parameters: `testcase_id`, `run_id`, `role`, `browser`, and `app_build`. Additional project parameters are warnings; secret-like values are violations.

## Required evidence attachments

For UI and functional tests whose status is not `skipped`, the result must contain exactly one attachment with each canonical name:

| Attachment name | MIME family | Creation |
|---|---|---|
| `evidence-image` | `image/*` | POM fixture captures a full-page PNG after the test |
| `evidence-video` | `video/*` | POM fixture closes the page, resolves the Playwright recording and attaches it |

Technical attachments such as `trace.zip`, `qa-runtime-context` or selector evidence may remain for diagnosis, but they do not replace the two canonical media attachments. If either required attachment is missing, `run-testcase-pom.mjs` projects the affected UI/functional result to `UNTEST`.

Skipped tests are allowed to have no fixture-generated parameters or media when Playwright skips them before fixtures start. When fixtures do run, they still emit the same parameter names with `N/A`. API-only runs do not require browser media, but the same parameter names remain the contract when an Allure result is produced.

## Runtime ownership

`fixtures/allure-contract.ts` is the single producer. It:

1. captures `evidence-image` and `evidence-video` from the same page/session;
2. adds the fixed parameter names through `allure.parameter`;
3. records only redacted account/role metadata; and
4. records a `qa-allure-contract` annotation for traceability.

Do not add per-spec screenshot/video hooks or direct `allure.parameter` calls. A Page Object owns actions and a spec owns assertions; the shared fixture owns Allure metadata/evidence.

## Validation

Run the validator against raw results before opening or publishing HTML:

```bash
npm run allure:contract
npm run allure:gen
```

The machine-readable validator is:

```bash
node scripts/verify-allure-contract.mjs \
  --results-dir reports/allure-results \
  --mode mixed \
  --output reports/allure-contract.json
```

`PASS` means required parameters, URL shape, attachment names/types and secret checks passed. `BLOCKED` means the report cannot be used as evidence. The unified runner always clears stale raw results, writes this contract result, and applies the gate before projecting `PASS`, `FAILED`, `N/A` or `UNTEST`.

## Anti-patterns

- `screenshot-on-failure`, `video`, `screen`, `url`, `link`, or `link_url` as alternate canonical names
- `screenshot: 'only-on-failure'` or `video: 'retain-on-failure'` for a deterministic UI/functional run
- a second `allure-results` directory or an uncleaned previous run
- direct `allure-playwright` imports in generated specs
- account credentials, cookies, bearer tokens or request bodies containing secrets as parameters
- treating an Allure HTML page as proof when `reports/allure-contract.json` is `BLOCKED`
