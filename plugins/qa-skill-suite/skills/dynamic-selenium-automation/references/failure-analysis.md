# Failure Analysis Reference

## When to read this

Read this reference in DEBUG mode when analyzing compilation errors, test failures, or flaky behavior

## Failure classification

| Category | Description | Root cause owner |
|---|---|---|
| Product defect | Application behavior does not match requirement | Development team |
| Automation defect | Test code is incorrect or fragile | Automation engineer |
| Environment issue | Server down, network timeout, deployment incomplete | DevOps / Infrastructure |
| Test data issue | Data missing, expired, or in wrong state | Test data management |
| Flaky test | Passes and fails intermittently without code change | Requires investigation |

## Diagnosis workflow

### Step 1 — Reproduce

- Run the failing test in isolation: `mvn clean test -Dcucumber.filter.tags="@failing-tag"`
- Run 3 times to check consistency
- Note: consistent failure vs intermittent failure

### Step 2 — Collect evidence

| Evidence | Source |
|---|---|
| Error message | Maven console output |
| Stack trace | Full exception chain in logs |
| Screenshot | `target/screenshots/` or embedded in Cucumber/Allure report |
| Page source | Captured in `@After` hook on failure |
| Browser console | `driver.manage().logs().get(LogType.BROWSER)` |
| Network requests | Browser DevTools if available |
| Expected vs actual | Assertion message |
| Environment | Config properties, browser version |

### Step 3 — Classify the error

#### Compilation errors

| Error | Cause | Fix |
|---|---|---|
| `cannot find symbol` | Missing import, wrong class name, deleted method | Add import, fix reference |
| `package does not exist` | Wrong dependency, missing in pom.xml | Add/fix dependency |
| `incompatible types` | API change, wrong version | Check API docs for correct usage |
| `duplicate class` | Conflicting dependencies | Run `mvn dependency:tree`, exclude duplicate |
| `annotation processing` | Cucumber expression conflict | Check step definition regex/expression |

#### Runtime errors

| Exception | Common cause | Fix |
|---|---|---|
| `NoSuchElementException` | Locator wrong, element not in DOM | Fix locator, add wait |
| `TimeoutException` | Element never appears, page too slow | Increase explicit wait, check URL |
| `StaleElementReferenceException` | DOM refreshed, element reference invalid | Re-locate element |
| `ElementNotInteractableException` | Element hidden, overlapped, disabled | Scroll into view, wait for visibility |
| `ElementClickInterceptedException` | Overlay, modal, popup blocking | Close overlay, use JS click as last resort |
| `InvalidSelectorException` | Malformed CSS/XPath | Validate selector syntax |
| `UnreachableBrowserException` | Driver crashed, browser closed | Check driver/browser version compatibility |
| `SessionNotCreatedException` | Driver version mismatch | Update WebDriverManager, browser, or both |
| `JavascriptException` | Page JS error | Capture console log, report as potential product defect |

#### Cucumber-specific errors

| Error | Cause | Fix |
|---|---|---|
| `Undefined step` | No matching step definition | Create step definition with correct expression |
| `Duplicate step definitions` | Two methods match the same Gherkin step | Make expressions more specific or remove duplicate |
| `Ambiguous step definitions` | Overlapping regex patterns | Refine regex patterns |
| `CucumberException: Glue path` | Wrong glue configuration in runner | Fix `@ConfigurationParameter` glue value |
| `No tests were executed` | Runner not picked up by Surefire | Check runner package and Surefire includes |

### Step 4 — Identify root cause

Questions to answer:
1. Is this a new failure or a regression?
2. Did the application UI change?
3. Did test data expire or change?
4. Did a dependency update?
5. Is the failure environment-specific?
6. Does the test pass locally but fail in CI?

### Step 5 — Fix and verify

- Fix the root cause, not the symptom
- If the fix involves adding a longer wait, question why the element takes longer
- If the fix involves a try-catch, question whether the exception should occur at all
- Run the fixed test at least 3 times to verify stability
- Run related tests to check for regressions

## Flaky test analysis

### Definition

A test is flaky if it produces different results (pass/fail) without any code or environment change

### Common causes

| Cause | Detection | Fix |
|---|---|---|
| Race condition | Fails intermittently, especially in CI | Add explicit wait for the specific condition |
| Shared test data | Fails when run in parallel or after another test | Isolate test data |
| Animation/transition | Fails on slow machines | Wait for animation to complete |
| Async operations | Fails when server is slow | Wait for async result, not just element presence |
| Browser popup/notification | Fails on first run | Handle or dismiss in setup |
| Network timing | Fails on slow networks | Add appropriate timeout |

### Flaky test protocol

1. Tag with `@flaky`
2. Log the flaky test in a tracking document
3. Investigate within 5 business days
4. If root cause is found, fix and remove `@flaky` tag
5. If not fixable, document the reason and review periodically
6. Do not auto-retry to mask flakiness
7. A retry-pass is reported as `FAILED` with `flaky=true`

## Log analysis tips

### Log4j2 patterns to search

```text
# Find all errors
grep "ERROR" target/logs/automation.log

# Find specific scenario
grep "Starting scenario:" target/logs/automation.log

# Find driver lifecycle
grep "Created.*driver\|quitDriver" target/logs/automation.log

# Find element interaction failures
grep "Exception\|Error\|Failed" target/logs/automation.log
```

### Stack trace reading

1. Start from the bottom (root cause)
2. Find the first line that references your package (`com.project.automation`)
3. Check the class and line number
4. Read the exception message
5. Check if there's a "Caused by" chain
