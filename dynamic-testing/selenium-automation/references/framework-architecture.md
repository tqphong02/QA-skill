# Framework Architecture Reference

## When to read this

Read this reference in DESIGN mode when creating a new framework or evaluating an existing framework's architecture

## Architecture decision record

### Decision 1 — Test runner selection

| Runner | Choose when |
|---|---|
| JUnit 5 | Default choice. Modern API, extensibility, better IDE support, active development |
| TestNG | Team already uses TestNG. Need built-in parallel execution XML configuration. Existing TestNG infrastructure |

Selection is made via `test.runner` property in the project configuration. The generated `pom.xml` and runner classes must be consistent with the selection

### Decision 2 — Dependency injection for Cucumber

| DI framework | Choose when |
|---|---|
| PicoContainer | Default. Lightweight, zero config, sufficient for sharing TestContext |
| Spring | Project is Spring-based, needs Spring context, complex dependency graphs |
| Guice | Team preference or existing Guice infrastructure |

### Decision 3 — Configuration management

| Library | Choose when |
|---|---|
| Owner | Default. Annotation-based, clean API for .properties files |
| Typesafe Config | Need HOCON format, hierarchical config, complex overrides |
| Java Properties | Minimal dependencies, simple key-value only |

### Decision 4 — Logging

| Library | Choose when |
|---|---|
| Log4j2 | Default. High performance, flexible configuration, XML/JSON config |
| SLF4J + Logback | Team standard. Spring Boot projects |

## Architecture layers

```text
┌─────────────────────────────────────────────────────────┐
│  Feature Files (.feature)                               │  ← Behavior specification
├─────────────────────────────────────────────────────────┤
│  Step Definitions                                       │  ← Test flow orchestration
├─────────────────────────────────────────────────────────┤
│  Test Context                                           │  ← Shared state per scenario
├─────────────┬───────────────────────────────────────────┤
│  Page Objects│  Components                              │  ← UI interaction layer
├─────────────┴───────────────────────────────────────────┤
│  BasePage                                               │  ← Common page operations
├─────────────────────────────────────────────────────────┤
│  Driver Manager / Factory                               │  ← WebDriver lifecycle
├─────────────────────────────────────────────────────────┤
│  Config Reader                                          │  ← Environment configuration
├─────────────────────────────────────────────────────────┤
│  Utils (Wait, Screenshot, JSON, Excel)                  │  ← Cross-cutting utilities
└─────────────────────────────────────────────────────────┘
```

## SOLID mapping

| Principle | Application |
|---|---|
| SRP | Each page object handles one page. Each step definition file covers one feature area. Config reader only reads config. DriverFactory only creates drivers |
| OCP | BasePage is open for extension (subclass), closed for modification. New pages extend, not modify BasePage |
| LSP | Any page object subclass can be used where BasePage is expected. No surprises in overridden methods |
| ISP | If interfaces are used, keep them focused (e.g., `Navigable`, `Searchable`, not `AllPageActions`) |
| DIP | Step definitions depend on page object abstractions, not on concrete WebDriver calls. Config reader provides values, callers don't know the source |

## Package organization guidelines

### `config/` — Configuration management
- `ConfigReader.java` — Reads environment properties, exposes typed getters
- `Environment.java` — Enum or class representing supported environments

### `driver/` — WebDriver lifecycle
- `DriverFactory.java` — Creates WebDriver instances based on browser name and options
- `DriverManager.java` — ThreadLocal WebDriver management, init/quit lifecycle

### `pages/` — Page Object classes
- `BasePage.java` — Constructor takes WebDriver, provides common waits, navigation, screenshot
- One class per page or significant page section
- Method naming: `enterUsername()`, `clickLoginButton()`, `isErrorMessageDisplayed()`

### `components/` — Reusable UI components
- Shared widgets: navigation bar, footer, modal dialogs, date pickers
- Components are injected into pages, not extended

### `utils/` — Cross-cutting utilities
- `WaitUtils.java` — Explicit wait wrappers
- `ScreenshotUtils.java` — Screenshot capture and file management
- `JsonUtils.java` — Read/write JSON using Jackson
- `ExcelUtils.java` — Read/write Excel using Apache POI

### `constants/` — Application constants
- `AppConstants.java` — Timeout values, file paths, regex patterns
- No environment-specific values here

### `runners/` — Test runner configuration
- `TestRunner.java` — Main Cucumber runner with plugin configuration
- `SmokeTestRunner.java` — Runner filtered by `@smoke` tag

### `stepdefinitions/` — Step definition classes
- One class per feature area (LoginSteps, RegistrationSteps)
- Inject TestContext for shared state

### `hooks/` — Cucumber hooks
- `Hooks.java` — `@Before` (driver init), `@After` (screenshot on fail, driver quit)
- `@BeforeAll` / `@AfterAll` for one-time setup/teardown if needed

### `context/` — Shared test state
- `TestContext.java` — Holds WebDriver, current page object, scenario-scoped data
- Injected via PicoContainer or Spring

## Scaling considerations

| Scale | Approach |
|---|---|
| < 20 scenarios | Simple flat structure, minimal abstractions |
| 20-100 scenarios | Feature-organized packages, shared components |
| 100-500 scenarios | Module-based packages, test data builders, parallel execution |
| > 500 scenarios | Multi-module Maven project, dedicated test data service, Selenium Grid |

Do not over-engineer a small project. Add abstractions when complexity demands them
