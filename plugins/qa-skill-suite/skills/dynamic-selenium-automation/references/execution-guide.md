# Execution Guide Reference

## When to read this

Read this reference in EXECUTE mode when building and running tests

## Pre-execution checklist

Before running `mvn clean test`:

1. **Java version** — Verify `java -version` matches project requirement (17 or 21)
2. **Maven version** — Verify `mvn -version` shows 3.9+
3. **Environment config** — Target environment file exists under `src/test/resources/config/`
4. **Browser availability** — Target browser is installed on the machine
5. **Network access** — Test environment URL is reachable
6. **Dependencies** — Run `mvn dependency:resolve` if first run

## Execution commands

### Full regression

```bash
mvn clean test -Denv=staging -Dbrowser=chrome
```

### Smoke tests only

```bash
mvn clean test -Denv=staging -Dbrowser=chrome -Dcucumber.filter.tags="@smoke"
```

### Specific feature

```bash
mvn clean test -Dcucumber.features="src/test/resources/features/login.feature"
```

### Specific scenario by tag

```bash
mvn clean test -Dcucumber.filter.tags="@login and not @skip"
```

### Headless mode for CI

```bash
mvn clean test -Denv=staging -Dbrowser=chrome -Dheadless=true
```

### Multiple browsers

```bash
# Chrome
mvn clean test -Dbrowser=chrome

# Firefox
mvn clean test -Dbrowser=firefox

# Edge
mvn clean test -Dbrowser=edge
```

### Parallel execution (TestNG)

```bash
mvn clean test -Dthreads=4
```

For JUnit 5, configure parallel in `junit-platform.properties`:
```properties
cucumber.execution.parallel.enabled=true
cucumber.execution.parallel.config.fixed.parallelism=4
```

## Report generation

### Cucumber HTML report

Automatically generated at `target/cucumber-reports/cucumber.html` after test execution

### Allure report

```bash
# Serve report locally (opens browser)
mvn allure:serve

# Generate static report
mvn allure:report
# Report at target/allure-report/index.html
```

### Allure results location

Results are saved to `target/allure-results/` by default. CI pipelines should upload this directory as an artifact

## Post-execution analysis

### Success indicators

- Maven build SUCCESS
- All scenarios marked as Passed in Cucumber report
- No unexpected screenshots in failure directory
- Allure report shows expected coverage

### Failure triage

| Symptom | Likely cause | First action |
|---|---|---|
| Compilation error | Missing import, wrong package, incompatible dependency | Read error message, check pom.xml |
| NoSuchElementException | Locator incorrect or element not loaded | Check locator, add explicit wait |
| TimeoutException | Page load slow, element never appears | Increase timeout, verify URL |
| StaleElementReferenceException | DOM refreshed after element was found | Re-locate element after action |
| WebDriverException | Driver binary mismatch, browser not installed | Update WebDriverManager, check browser version |
| CucumberException | Step definition not found, duplicate steps | Check glue path, check regex patterns |
| No tests executed | Runner not found, wrong package, filter too strict | Check Surefire config, relax tag filter |

### Evidence collection

For every test run, collect:
1. Maven console output (stdout + stderr)
2. Cucumber JSON report
3. Allure results directory
4. Screenshot directory
5. Log file (`target/logs/automation.log`)
6. Environment details (OS, Java version, browser version)

## CI execution specifics

### GitHub Actions

```bash
# Typical CI command
mvn clean test \
  -Denv=staging \
  -Dbrowser=chrome \
  -Dheadless=true \
  -Dcucumber.filter.tags="@smoke" \
  --batch-mode \
  --fail-at-end
```

### Jenkins

```bash
# Pipeline step
sh "mvn clean test -Denv=${params.ENVIRONMENT} -Dbrowser=chrome -Dheadless=true"
```

### Exit codes

- `0` — All tests passed
- `1` — One or more tests failed
- Non-zero from Maven — Build/compilation error

CI pipelines should treat any non-zero exit as a failure and upload artifacts regardless
