# Review Checklist Reference

## When to read this

Read this reference in REVIEW mode when auditing framework code quality, architecture, and maintainability

## Review categories

### 1. SOLID Principles

| Principle | What to check | Red flags |
|---|---|---|
| SRP | Each class has one responsibility | Page object that reads config. Step definition that creates WebDriver. Hooks class that manages test data |
| OCP | Can add new features without modifying existing code | Adding a new page requires modifying BasePage. Adding a browser requires modifying DriverFactory switch |
| LSP | Subclasses work where parent is expected | Page subclass throws UnsupportedOperationException. Override changes method contract |
| ISP | Interfaces are focused | Single interface with 20+ methods. Classes implement interface but throw on unused methods |
| DIP | High-level modules don't depend on low-level details | Step definitions call `driver.findElement()` directly. Page objects read config files directly |

### 2. Page Object Model

| Check | Pass | Fail |
|---|---|---|
| Locators encapsulated | Private `By` fields in page class | Locators in step definitions or test data |
| Actions in page objects | `loginPage.enterUsername()` | `driver.findElement(By.id("user")).sendKeys()` in steps |
| Page returns page | `login()` returns DashboardPage | Void methods requiring caller to instantiate next page |
| No test assertions in pages | Pages return values | Pages contain `assertTrue()` |
| No WebDriver in steps | Steps call page methods | Steps call `context.getDriver().findElement()` |
| No God Object | Each page < 300 lines | Single page with 1000+ lines |

### 3. Locator Quality

| Check | Good | Bad |
|---|---|---|
| Stability | `By.id("login-btn")` | `By.xpath("//div[3]/form/button[1]")` |
| Readability | `By.cssSelector("[data-testid='submit']")` | `By.xpath("//div[@class='c-btn c-btn--primary ng-star-inserted']")` |
| Uniqueness | Locator matches exactly one element | Locator matches multiple elements |
| Independence | Locator survives minor UI changes | Locator breaks when sibling element is added |

### 4. Wait Strategy

| Check | Pass | Fail |
|---|---|---|
| Explicit waits used | `WebDriverWait` with `ExpectedConditions` | `Thread.sleep(5000)` |
| Wait for condition | Wait for element visible, clickable, text present | Wait for fixed time |
| Timeout from config | `Duration.ofSeconds(config.explicitTimeout())` | `Duration.ofSeconds(30)` hardcoded |
| No implicit + explicit mix | Use one strategy consistently | Both implicit and explicit on same elements |

### 5. WebDriver Lifecycle

| Check | Pass | Fail |
|---|---|---|
| Per-scenario lifecycle | New driver in `@Before`, quit in `@After` | Shared driver across scenarios |
| ThreadLocal for parallel | `ThreadLocal<WebDriver>` | Static `WebDriver` field |
| Cleanup on failure | `@After` always quits driver | Driver leak on exception |
| No singleton driver | DriverManager uses ThreadLocal | Global singleton WebDriver |

### 6. Configuration

| Check | Pass | Fail |
|---|---|---|
| Externalized | `.properties` or YAML files | Values in Java constants |
| Environment-aware | `-Denv=staging` selects config | Single hardcoded config |
| No secrets in code | Env vars or CI secrets | `password = "admin123"` in source |
| Defaults provided | Sensible defaults when property missing | NullPointerException on missing property |

### 7. Test Independence

| Check | Pass | Fail |
|---|---|---|
| Order independent | Any scenario can run alone | Scenario B depends on Scenario A |
| Data independent | Each scenario uses own data | Scenarios share and modify same data |
| State cleanup | Test data cleaned in `@After` | Leftover data affects next run |
| No shared mutable state | TestContext scoped per scenario | Static fields holding test state |

### 8. Separation of Concerns

| Layer | Allowed | Not allowed |
|---|---|---|
| Feature files | Business behavior in Gherkin | Technical implementation details |
| Step definitions | Orchestrate flow, assertions | Locators, WebDriver calls |
| Page objects | UI interaction, locators | Assertions, test data, config reading |
| Hooks | Driver lifecycle, screenshot | Business logic |
| Config | Environment properties | Test data |
| Utils | Cross-cutting helpers | Business logic |

### 9. Code Quality

| Check | Standard |
|---|---|
| Naming | `loginPage`, `enterUsername()`, `isErrorDisplayed()` — clear and consistent |
| Method length | < 20 lines per method |
| Class length | < 300 lines per class |
| Comments | Explain WHY, not WHAT |
| Exception handling | Specific exceptions, meaningful messages |
| Logging | Important actions logged, no sensitive data in logs |
| Dead code | No commented-out code, no unused methods |
| Duplication | No copy-pasted step definitions or utility methods |

### 10. CI/CD Readiness

| Check | Pass | Fail |
|---|---|---|
| Headless support | `-Dheadless=true` works | Tests require visible browser |
| Exit code | Non-zero on failure | Always exits 0 |
| Artifacts | Reports uploaded as CI artifacts | Reports lost after CI run |
| Deterministic | Same result on repeated runs | Random failures in CI |
| Platform independent | Works on Windows and Linux | Path separators hardcoded |

## Review output format

```text
## Code Review Report

### Summary
- Files reviewed: N
- Issues found: N (Critical: X, Major: Y, Minor: Z)
- Overall assessment: PASS / NEEDS WORK / CRITICAL ISSUES

### Critical Issues
[Issues that prevent test execution or cause incorrect results]

### Major Issues
[Issues that affect maintainability or reliability]

### Minor Issues
[Style, naming, or minor improvement suggestions]

### Positive Observations
[Good practices observed in the codebase]

### Recommendations
[Prioritized list of improvements]
```
