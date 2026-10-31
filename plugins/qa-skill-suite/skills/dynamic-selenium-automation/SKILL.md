---
name: dynamic-selenium-automation
description: Build, run, debug, review, and maintain Java Selenium WebDriver automation frameworks using POM, OOP, BDD (Cucumber + Gherkin), SOLID principles, and multi-environment configuration. Supports JUnit 5 or TestNG as test runner, Maven build lifecycle, Allure reporting, and CI/CD integration. Trigger on Selenium, Java automation, Cucumber BDD, Selenium framework, Selenium POM, Java test automation, hoặc xây dựng framework Selenium. Auto-route; do not require the skill name. Do not use for Playwright automation (route to dynamic-web-automation), mobile automation (route to dynamic-mobile), API-only contract testing (route to hybrid-api-contract), or performance testing (route to dynamic-performance).
mode: dynamic
surface: web
role: executor
legacy_aliases: selenium-java-automation
---

## Plugin runtime contract

When this skill is loaded from QA Skill Suite, treat the directory containing this `SKILL.md` as `SKILL_ROOT` and its parent as `PLUGIN_SKILLS_ROOT`. Resolve bundled scripts, references, templates, and sibling skills from those directories. Do not copy plugin assets into the user's project. Invoke a bundled script by its resolved absolute path while keeping the user's project as the working directory, unless that script explicitly requires another working directory.


<!-- qa-runs-contract:start -->
## Local run organization

When this workflow creates local reports, evidence, logs, converted intermediates, or other non-source deliverables and the user did not request an exact output path:

1. Start a fresh run with `node <skill-root>/scripts/qa-runs.mjs start --skill <skill-name> --label <short-scope>` when the bundled helper exists. In a QA-skill source checkout use `<repo-root>/scripts/qa-runs.mjs`. If neither helper exists, create the same layout manually
2. Keep every run-owned file under the returned `<project-root>/qa-runs/<skill-name>/<timestamp>_<scope>/` directory. Never emit generated files into the project root or overwrite an earlier run
3. Put the primary human-readable summary at `report.md` when the output format permits. Preserve required machine-readable and native filenames inside the same run directory
4. Finish the run with `qa-runs.mjs finish --run-dir <run-dir> --status <status> [--primary <report-path>]` so `LATEST.md`, `INDEX.md`, root `latest.json`, and per-skill `latest.json` point to the newest run
5. In the final response, link the primary report, the timestamped run directory, and `qa-runs/INDEX.md`; identify the run ID and status explicitly

An exact user path, a source-code deliverable that belongs in the target repository, or a safety-mandated location overrides this layout. Register or link the result without copying secrets or sensitive evidence into the index
<!-- qa-runs-contract:end -->

# Selenium Automation Framework — POM + OOP + BDD

Build and maintain production-grade Java Selenium WebDriver automation frameworks with Cucumber BDD, Page Object Model, SOLID principles, and multi-environment support. This skill generates complete, compilable, executable code — not isolated snippets

## Modes

| Mode | Trigger | Description |
|---|---|---|
| ANALYZE | Analyze requirement, codebase, existing framework | Read requirements and/or existing codebase, produce a structured analysis report |
| DESIGN | Design framework, architecture, dependencies | Design framework skeleton, dependency matrix, architecture decisions |
| GENERATE | Create, build, generate Feature/Step/Page/framework | Generate complete executable code: features, step definitions, page objects, configuration, pom.xml |
| EXECUTE | Build, run, execute test, mvn test | Compile and run tests via Maven CLI; verdict comes from `scripts/check_execution_result.py`, not console output |
| DEBUG | Debug, fix, analyze failure, flaky, error, lỗi | Analyze compilation errors, test failures, flaky behavior; fix root causes |
| REVIEW | Review code, architecture, quality, SOLID | Audit code against SOLID, POM conventions, locator stability, separation of concerns |
| MAINTAIN | Maintain, update, refactor, UI changed | Update page objects, step definitions, feature files when UI or requirements change |

Default mode: `GENERATE` when no explicit signal is present

## Operating rules

1. Analyze the project requirements and existing codebase before generating or modifying code
2. Identify the programming language, build tool, test framework, Selenium version, Cucumber version, and existing project architecture before selecting dependencies
3. If the project already exists, preserve its conventions and avoid unnecessary rewrites
4. Design the framework using Page Object Model, appropriate OOP principles, Cucumber BDD, and SOLID principles
5. Generate complete, consistent, and executable code rather than isolated snippets
6. Ensure that dependencies, package names, imports, annotations, configuration files, and test runners are compatible with one another
7. Implement WebDriver lifecycle management, explicit waits, environment configuration, test data management, logging, reporting, and failure diagnostics
8. After implementation, run Maven compilation and tests when execution tools are available
9. Analyze compilation errors, dependency conflicts, test failures, and flaky behavior, then fix the root cause instead of applying superficial workarounds
10. Never claim that tests passed unless they were actually executed and the results were verified
11. Do not introduce unnecessary abstractions, duplicated utilities, hardcoded credentials, fixed sleeps, or excessive inheritance
12. Provide a clear summary of generated files, architectural decisions, execution commands, assumptions, and any remaining issues

## Technology stack

| Technology | Purpose | Version constraint |
|---|---|---|
| Java | Programming language | 17 or 21 |
| Maven | Build and dependency management | 3.9+ |
| Selenium WebDriver | Browser automation | 4.x |
| Cucumber | BDD with Gherkin syntax | 7.x |
| JUnit 5 | Test runner (default) | 5.10+ |
| TestNG | Test runner (alternative) | 7.x |
| WebDriverManager | Browser driver management | 5.x |
| Log4j2 or SLF4J+Logback | Logging | Latest stable |
| Allure Report | Test result reporting | 2.x |
| Jackson | JSON processing | 2.x |
| Apache POI | Excel read/write | 5.x |
| Owner or Typesafe Config | Configuration management | Latest stable |

Select JUnit 5 or TestNG based on user preference or project config. Do not include both unless explicitly requested. JUnit 5 is the default

### Dependency compatibility contract

Before generating `pom.xml`, verify:
- Cucumber version is compatible with the selected test runner (cucumber-junit-platform-engine for JUnit 5, cucumber-testng for TestNG)
- Selenium 4.x does not require standalone WebDriverManager when Selenium Manager is sufficient
- Allure plugin version matches the test runner
- All BOM/parent versions are internally consistent
- No duplicate or conflicting transitive dependencies

## Framework architecture

### Mandatory patterns

| Pattern | Requirement |
|---|---|
| POM | Separate Page Object classes from test logic; each page class encapsulates locators and page-specific actions |
| OOP | Apply Encapsulation (private locators, public methods), Inheritance (BasePage), Polymorphism and Abstraction when genuinely useful |
| BDD | Cucumber + Gherkin for behavior specification |
| Separation of Concerns | UI interaction in pages, test flow orchestration in step definitions, data in external files, configuration in properties/YAML |
| SOLID | SRP for page objects, OCP for extensible base classes, LSP for page inheritance, ISP for focused interfaces, DIP for driver abstraction |

### Design patterns — apply only when justified

| Pattern | When to use |
|---|---|
| Page Factory | When `@FindBy` improves readability; skip if explicit locators are clearer |
| Factory | For creating page objects or test data objects with complex initialization |
| Singleton | Only for thread-safe configuration reader; never for WebDriver |
| Builder | For constructing complex test data objects |
| Strategy | For swappable wait strategies or browser selection |

Do not apply patterns mechanically. A framework for 10 test scenarios does not need the same abstractions as one for 1000

## Directory structure

```text
selenium-framework/
├── pom.xml
├── README.md
├── .gitignore
├── src/
│   ├── main/
│   │   └── java/
│   │       └── com/project/automation/
│   │           ├── config/
│   │           │   ├── ConfigReader.java
│   │           │   └── Environment.java
│   │           ├── driver/
│   │           │   ├── DriverFactory.java
│   │           │   └── DriverManager.java
│   │           ├── pages/
│   │           │   ├── BasePage.java
│   │           │   └── (feature-specific pages)
│   │           ├── components/
│   │           │   └── (reusable UI components)
│   │           ├── utils/
│   │           │   ├── WaitUtils.java
│   │           │   ├── ScreenshotUtils.java
│   │           │   ├── JsonUtils.java
│   │           │   └── ExcelUtils.java
│   │           └── constants/
│   │               └── AppConstants.java
│   └── test/
│       ├── java/
│       │   └── com/project/automation/
│       │       ├── runners/
│       │       │   ├── TestRunner.java
│       │       │   └── SmokeTestRunner.java
│       │       ├── stepdefinitions/
│       │       │   └── (feature-specific steps)
│       │       ├── hooks/
│       │       │   └── Hooks.java
│       │       ├── context/
│       │       │   └── TestContext.java
│       │       └── testsupport/
│       │           └── TestDataProvider.java
│       └── resources/
│           ├── features/
│           │   └── (feature files)
│           ├── config/
│           │   ├── dev.properties
│           │   ├── staging.properties
│           │   ├── uat.properties
│           │   └── production.properties
│           ├── testdata/
│           │   └── (JSON/Excel test data)
│           ├── log4j2.xml
│           ├── allure.properties
│           └── cucumber.properties
└── .github/
    └── workflows/
        ├── smoke-test.yml
        └── regression-test.yml
```

### Package naming

- Base package: `com.project.automation` (adjust to match user's project)
- Use the user's existing package convention when modifying an existing project
- Never generate conflicting package declarations

## Environment management

### Configuration contract

- Read configuration from `.properties` files under `src/test/resources/config/`
- Select environment via Maven system property: `-Denv=staging`
- Default environment: `dev` when no property is specified
- Each environment file contains: `base.url`, `browser`, `timeout.implicit`, `timeout.explicit`, `timeout.page.load`
- Do not hardcode URLs, credentials, or environment-specific values in Page Objects
- Do not store passwords, tokens, or API keys in source code; use environment variables or CI secrets
- Support browsers: Chrome, Firefox, Edge
- Support headless mode via `-Dheadless=true` for CI/CD
- Support Windows and Linux

### Execution examples

```bash
# Run all tests on staging with Chrome
mvn clean test -Denv=staging -Dbrowser=chrome

# Run smoke tests in headless mode
mvn clean test -Denv=staging -Dbrowser=chrome -Dheadless=true -Dcucumber.filter.tags="@smoke"

# Run specific feature
mvn clean test -Dcucumber.features="src/test/resources/features/login.feature"

# Generate Allure report
mvn allure:serve
```

## WebDriver management

### Lifecycle contract

- Create a new WebDriver instance per scenario (Cucumber hook `@Before`)
- Quit the driver after each scenario (`@After`)
- Use ThreadLocal for parallel execution safety
- Never use a shared singleton WebDriver for parallel runs
- Configure timeouts from environment properties, not hardcoded values
- Handle driver initialization failures gracefully with clear error messages

### DriverFactory requirements

```text
Input:  browser name (chrome|firefox|edge), headless flag, custom options
Output: configured WebDriver instance
Rules:  - Use WebDriverManager or Selenium Manager for driver binary resolution
        - Apply environment-specific Chrome/Firefox/Edge options
        - Set page load timeout, implicit wait from config
        - Support remote WebDriver URL for Selenium Grid if provided
        - Log browser name, version, and driver version at initialization
```

## BDD and Gherkin contract

### Feature file rules

- Write in `Given - When - Then` structure
- One behavior per scenario; do not combine unrelated assertions
- Use `Scenario Outline` with `Examples` for data-driven scenarios
- Use `Background` for shared preconditions within a feature
- Use `DataTable` for structured input data
- Tag by category: `@smoke`, `@regression`, `@login`, `@negative`
- Do not write overly technical Gherkin that describes DOM interactions
- Keep steps reusable across features; avoid duplicating step definitions

### Step definition rules

- Step definitions orchestrate test flow only; they do not contain locators or direct WebDriver calls
- Page Object methods handle all UI interactions
- One step definition class per feature area
- Inject shared state via `TestContext` (PicoContainer or Cucumber-Spring)
- Do not create duplicate step definitions with overlapping regex/expressions

### Example

```gherkin
Feature: User Login

  @smoke @login
  Scenario: Login successfully with valid credentials
    Given the user is on the login page
    When the user enters valid credentials
    And the user clicks the login button
    Then the user should be redirected to the dashboard

  @regression @login @negative
  Scenario Outline: Login with invalid credentials
    Given the user is on the login page
    When the user enters "<username>" and "<password>"
    And the user clicks the login button
    Then an error message "<message>" should be displayed

    Examples:
      | username      | password    | message                    |
      | invalid@test  | wrongPass   | Invalid credentials        |
      |               | validPass   | Username is required       |
      | valid@test    |             | Password is required       |
```

## Selenium coding rules

### Locators

- Priority: ID > CSS Selector > stable attributes > short anchored XPath
- Avoid long XPath depending on DOM structure
- Prefer explicit waits (`WebDriverWait` with `ExpectedConditions`)
- Never use `Thread.sleep()` for synchronization in normal flow
- Centralize locators in page object classes; do not scatter across step definitions
- Use `By` objects, not raw strings, for locator definitions

### Page Object design

- Each page class extends `BasePage`
- `BasePage` provides: navigation, common waits, common assertions, screenshot capture
- Keep `BasePage` focused; do not add unrelated convenience methods
- Separate locator declarations, action methods, and verification methods logically
- Page Objects do not depend on test scenarios or step definitions
- A Page Object method returns `this` (for chaining) or the next Page Object (for navigation)
- Do not put all business logic in one God Page Object

### Assertions

- Place assertions in step definitions or dedicated verification steps
- Compare actual results against expected results
- Verify business state, not just element existence
- Use descriptive assertion messages

## Test data and test design

### Black-box techniques — apply when designing test scenarios

| Technique | When to apply |
|---|---|
| Equivalence Partitioning | Grouping input values into valid/invalid partitions |
| Boundary Value Analysis | Testing at boundaries of input ranges |
| Decision Table Testing | Multiple conditions affecting outcomes |
| State Transition Testing | Workflows with distinct states |
| Negative Testing | Invalid input, unauthorized access, edge cases |
| Error Guessing | Common defect patterns based on experience |

### Test data contract

- Test data is external to code (JSON, Excel, CSV under `testdata/`)
- Support data-driven testing via `Scenario Outline` or custom data providers
- Generate both valid and invalid test data
- Tests must not depend on execution order
- Clean up test data after test when the test creates persistent state
- Do not use production user credentials in test data
- Provide test data factories or builders for complex objects

## Reporting and debugging

### Failure diagnostics

- Capture screenshot on scenario failure (Cucumber `@After` hook)
- Attach screenshot to Cucumber Report and/or Allure Report
- Log significant actions with timestamp using Log4j2/SLF4J
- Display exception type, message, and relevant stack trace
- Record environment name, browser, and execution timestamp in report
- Distinguish product defects from automation errors, environment issues, and data problems

### Flaky test policy

- Do not auto-retry to mask instability
- Log retry attempts when retry is intentionally configured
- Tag known flaky tests with `@flaky` and track root cause
- A retry-pass is `FAILED` with `flaky=true` annotation

### Allure integration

- Annotate features with `@Epic`, `@Feature`, `@Story` where meaningful
- Attach screenshots, page source, and browser console logs on failure
- Configure `allure.properties` with `allure.results.directory`
- Generate report via `mvn allure:serve` or `mvn allure:report`

## CI/CD integration

### Pipeline contract

- Run tests via Maven CLI: `mvn clean test`
- Support GitHub Actions and Jenkins
- Run smoke tests after deployment via tag filter
- Run regression tests on schedule or via pipeline trigger
- Store reports and screenshots as CI artifacts
- Run headless on Linux CI runners
- Manage browser and dependency versions consistently between local and CI
- Exit with non-zero code on test failure

### GitHub Actions example structure

```yaml
# .github/workflows/smoke-test.yml
name: Smoke Tests
on:
  workflow_dispatch:
  push:
    branches: [main, develop]

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - run: mvn clean test -Denv=staging -Dbrowser=chrome -Dheadless=true -Dcucumber.filter.tags="@smoke"
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: allure-results
          path: target/allure-results/
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: failure-screenshots
          path: target/screenshots/
```

## Code quality review checklist

When in REVIEW mode, evaluate against:

| Category | Criteria |
|---|---|
| SOLID | SRP: one responsibility per class. OCP: extend without modifying base. LSP: substitutable page objects. ISP: focused interfaces. DIP: depend on abstractions |
| Reusability | Shared components extracted. No copy-paste step definitions. Common waits/actions in BasePage |
| Stability | Explicit waits used. Locators resilient to minor DOM changes. No Thread.sleep. No hardcoded timeouts |
| Maintainability | Clear package structure. Consistent naming. Comments explain intent, not obvious code. Feature files readable by non-developers |
| Separation | No locators in step definitions. No test logic in page objects. No environment values in code. No credentials in source |
| Dependencies | Compatible versions. No unused dependencies. No duplicate utilities |

## Advanced capabilities

| Capability | Description |
|---|---|
| Requirement Analyzer | Parse requirement documents, identify test-worthy flows and risks |
| BDD Generator | Generate `.feature` files from requirements or test case descriptions |
| Framework Generator | Scaffold a complete framework from an empty project |
| Codebase Analyzer | Read existing framework structure before making changes |
| Locator Analyzer | Detect fragile locators and suggest stable alternatives |
| Test Failure Analyzer | Parse logs, screenshots, stack traces to identify root cause |
| Test Maintenance | Update Page Objects when UI changes |
| Duplicate Detection | Find redundant step definitions and utility methods |
| Coverage Analyzer | Map requirements to existing scenarios, identify gaps |
| CI/CD Assistant | Generate pipeline files for smoke and regression suites |

## Read only what the mode needs

| Mode | References to read |
|---|---|
| ANALYZE | [requirements-analysis.md](references/requirements-analysis.md) |
| DESIGN | [framework-architecture.md](references/framework-architecture.md), [dependency-matrix.md](references/dependency-matrix.md) |
| GENERATE | [pom-template.md](references/pom-template.md), [code-templates.md](references/code-templates.md), [gherkin-conventions.md](references/gherkin-conventions.md) |
| EXECUTE | [execution-guide.md](references/execution-guide.md) |
| DEBUG | [failure-analysis.md](references/failure-analysis.md) |
| REVIEW | [review-checklist.md](references/review-checklist.md) |
| MAINTAIN | [maintenance-guide.md](references/maintenance-guide.md) |

## Execution tooling

Before EXECUTE mode runs `mvn clean test`, check the toolchain instead of assuming it:

```bash
bash ./scripts/doctor.sh /path/to/project
```

After `mvn clean test` produces `target/cucumber-reports/cucumber.json`, compute the verdict from that report instead of reading console scrollback:

```bash
python3 ./scripts/check_execution_result.py \
  --cucumber-json /path/to/project/target/cucumber-reports/cucumber.json
```

The script returns `UNTEST` when the report is missing, empty, or unreadable, and `FAILED` when any scenario has a `failed`, `undefined`, or `pending` step — it is the only accepted source for a `PASS` claim; "the console looked green" is not evidence.

## Verdicts

Use only: `PASS`, `FAILED`, `N/A`, `UNTEST`

- `PASS` requires `check_execution_result.py` to report `verdict: PASS` from an actual Cucumber JSON report, not Maven console output read by eye
- `FAILED` requires the specific failure evidence from the same report (`failures[]`)
- `N/A` for scenarios not applicable to the current environment or configuration
- `UNTEST` when execution was not possible (missing dependency, environment unavailable, blocked) — `doctor.sh` exiting non-zero is one valid basis for this
- Never claim `PASS` from generated code alone without execution evidence
- A retry-pass is `FAILED` with `flaky=true`

## Hard gates

- Generated code must compile: `mvn compile` passes
- Test runner configuration matches Cucumber version
- All imports resolve; no missing classes
- Environment configuration is externalized
- No `Thread.sleep()` for synchronization
- No hardcoded credentials
- WebDriver lifecycle is per-scenario, not shared singleton
- Screenshot on failure is implemented
- Allure reporting is configured
- `.gitignore` excludes target/, *.class, driver binaries, IDE files, and secrets

## Handoff

- Authoring-only testcases without automation code → `support-testcase-authoring`
- Playwright-based web automation → `dynamic-web-automation`
- API contract-only validation → `hybrid-api-contract`
- Exploratory browser QA → `dynamic-web-exploratory`
- Mobile automation → `dynamic-mobile`
- Performance testing → `dynamic-performance`
- Security testing → `dynamic-security-pentest`
