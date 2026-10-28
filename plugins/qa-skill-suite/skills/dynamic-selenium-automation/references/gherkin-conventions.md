# Gherkin Conventions Reference

## When to read this

Read this reference in GENERATE mode when writing or reviewing `.feature` files

## Language and structure

- Write Gherkin in English by default; use Vietnamese only when user explicitly requests
- Use `Given - When - Then` structure for every scenario
- One logical behavior per scenario
- Feature file name matches the feature area: `login.feature`, `registration.feature`

## Naming conventions

| Element | Convention | Example |
|---|---|---|
| Feature | Business capability description | `Feature: User Authentication` |
| Scenario | Expected outcome in sentence | `Scenario: Login with valid credentials` |
| Scenario Outline | Parameterized behavior | `Scenario Outline: Login with invalid credentials` |
| Tag | Lowercase, hyphenated, categorized | `@smoke`, `@regression`, `@login` |

## Tag strategy

| Tag | Purpose | When to use |
|---|---|---|
| `@smoke` | Critical path verification | Core business flows, post-deployment check |
| `@regression` | Full regression suite | All stable automated scenarios |
| `@negative` | Negative/error testing | Invalid input, unauthorized access |
| `@wip` | Work in progress | Not ready for CI execution |
| `@skip` | Temporarily disabled | Known issue, environment unavailable |
| `@flaky` | Intermittently failing | Under investigation |
| `@feature-name` | Feature grouping | `@login`, `@registration`, `@checkout` |

## Step writing rules

### DO

```gherkin
# Clear, behavior-focused steps
Given the user is on the login page
When the user enters valid credentials
Then the user should see the dashboard
```

### DO NOT

```gherkin
# Too technical — describes DOM/UI implementation
Given the user opens URL "https://app.example.com/login"
When the user types "admin" into the input field with id "username"
And the user types "pass123" into the input field with id "password"
And the user clicks the button with CSS selector ".btn-submit"
Then the element with class "dashboard-title" should contain text "Welcome"
```

### DO NOT

```gherkin
# Too vague — not testable
Given the system is ready
When the user does something
Then it works correctly
```

## Scenario Outline and Examples

Use `Scenario Outline` when the same behavior is tested with multiple data sets:

```gherkin
Scenario Outline: Validate password strength
  Given the user is on the registration page
  When the user enters password "<password>"
  Then the password strength indicator should show "<strength>"

  Examples:
    | password        | strength |
    | abc             | Weak     |
    | Abc12345        | Medium   |
    | Abc123!@#xyz    | Strong   |
```

## Background

Use `Background` for shared preconditions within a single feature file:

```gherkin
Feature: Shopping Cart

  Background:
    Given the user is logged in
    And the user has items in the cart

  Scenario: View cart items
    When the user navigates to the cart page
    Then the cart should display all added items

  Scenario: Remove item from cart
    When the user removes an item from the cart
    Then the cart item count should decrease by one
```

Do not use `Background` when:
- Preconditions differ between scenarios
- The background steps are complex or slow
- Only one scenario uses the precondition

## DataTable

Use `DataTable` for structured input within a single step:

```gherkin
Scenario: Create user with profile information
  Given the user fills in the registration form with:
    | field       | value              |
    | First Name  | John               |
    | Last Name   | Doe                |
    | Email       | john@example.com   |
    | Phone       | +84-123-456-789    |
  When the user submits the registration form
  Then the account should be created successfully
```

## Anti-patterns to avoid

| Anti-pattern | Why it's bad | Fix |
|---|---|---|
| Scenario with 20+ steps | Unreadable, testing too many things | Split into focused scenarios |
| Steps with hardcoded URLs | Brittle, environment-dependent | Use abstract steps, configure URLs |
| Duplicate step definitions | Maintenance burden | Reuse existing steps |
| Then without assertion | Test proves nothing | Every Then must verify an expected result |
| Given that modifies state without cleanup | Test pollution | Add cleanup or use independent data |
| Scenario depends on previous scenario | Order-dependent tests | Each scenario must be independent |

## Feature file organization

```text
features/
├── authentication/
│   ├── login.feature
│   ├── logout.feature
│   └── password-reset.feature
├── user-management/
│   ├── registration.feature
│   └── profile-update.feature
└── shopping/
    ├── cart.feature
    └── checkout.feature
```

Group by business domain, not by test type
