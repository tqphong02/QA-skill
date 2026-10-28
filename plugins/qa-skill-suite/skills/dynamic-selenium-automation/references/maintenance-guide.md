# Maintenance Guide Reference

## When to read this

Read this reference in MAINTAIN mode when updating an existing framework due to UI changes, requirement changes, dependency updates, or refactoring needs

## Maintenance triggers

| Trigger | Action required |
|---|---|
| UI element changed | Update locators in affected Page Object |
| UI flow changed | Update Page Object methods and Step Definitions |
| New feature added | Create new Feature file, Page Object, Step Definitions |
| Requirement changed | Update Feature file, potentially Step Definitions and Page Objects |
| Dependency update | Update version in pom.xml, verify compatibility, run full regression |
| Flaky test identified | Diagnose, fix root cause, remove @flaky tag |
| Browser update | Verify WebDriverManager resolves correct driver, run smoke test |
| Environment change | Update or add environment config file |
| Test data expired | Refresh test data, consider data generation |

## Locator maintenance

### When locators break

1. Identify the broken locator from the stack trace
2. Inspect the current UI to find the element
3. Choose the best available locator strategy (ID > CSS > XPath)
4. Update ONLY the locator in the Page Object — do not change the method signature
5. Run the affected scenarios to verify
6. Run related scenarios to check for regressions

### Bulk locator update

When the UI undergoes significant changes:

1. List all Page Objects that interact with the changed pages
2. For each Page Object, verify every locator against the current UI
3. Update broken locators
4. Run all scenarios that use the affected Page Objects
5. Commit changes with descriptive message referencing the UI change

## Dependency update workflow

### Minor version update (e.g., 4.25.0 → 4.27.0)

1. Update version in `pom.xml` properties
2. Run `mvn dependency:resolve` to verify resolution
3. Run `mvn compile` to check compilation
4. Run full regression suite
5. If all pass, commit and push

### Major version update (e.g., Selenium 3.x → 4.x)

1. Read the migration guide for the new version
2. Create a branch for the update
3. Update version in `pom.xml`
4. Address compilation errors (API changes)
5. Address deprecation warnings
6. Run full regression suite
7. Fix failures
8. Review and merge

### Dependency conflict resolution

```bash
# Find conflicts
mvn dependency:tree -Dverbose | grep "conflict"

# Analyze unused/missing
mvn dependency:analyze
```

## Adding new test scenarios

### For an existing feature

1. Add scenario to existing `.feature` file
2. Run to see undefined steps
3. Add Step Definitions — reuse existing when possible
4. Update Page Objects if new UI interactions are needed
5. Add test data if needed
6. Run the new scenario
7. Run the full feature to check for side effects

### For a new feature

1. Create `new-feature.feature` under `features/`
2. Create `NewFeaturePage.java` under `pages/`
3. Create `NewFeatureSteps.java` under `stepdefinitions/`
4. Add test data under `testdata/` if needed
5. Run the new feature
6. Add appropriate tags (`@smoke`, `@regression`)
7. Verify the test runner picks up the new feature

## Framework refactoring

### When to refactor

- Duplicated step definitions across files
- Page Object exceeds 300 lines
- BasePage has methods only used by one subclass
- Test data is hardcoded in multiple places
- Configuration is read in inconsistent ways
- Utility methods are duplicated

### How to refactor safely

1. Identify the code to refactor
2. Ensure existing tests pass (baseline)
3. Make small, incremental changes
4. Run tests after each change
5. Commit frequently with descriptive messages
6. Do not change behavior while refactoring

### Common refactoring patterns

| Situation | Refactoring |
|---|---|
| Large Page Object | Split into page sections or components |
| Duplicate step definitions | Extract shared steps to common step class |
| Hardcoded test data | Move to JSON/Excel files |
| Copy-pasted waits | Extract to WaitUtils |
| Multiple config reading | Centralize in ConfigReader |
| Inconsistent logging | Standardize in BasePage and Hooks |

## Test data maintenance

### Data refresh

- Schedule regular data refresh for time-sensitive test data
- Use data generators for unique values (email, username)
- Clean up created test data after test when possible
- Document data dependencies in test data files

### Data independence

- Each scenario should create or select its own test data
- Do not rely on data created by previous scenarios
- Use unique identifiers (timestamp, UUID) for created data
- Provide data cleanup in `@After` hooks when tests create persistent state

## Health check script

Run periodically to verify framework health:

```bash
#!/bin/bash
echo "=== Framework Health Check ==="

# 1. Compile
echo "Step 1: Compilation"
mvn compile -q && echo "PASS" || echo "FAIL"

# 2. Test compile
echo "Step 2: Test compilation"
mvn test-compile -q && echo "PASS" || echo "FAIL"

# 3. Dependency check
echo "Step 3: Dependencies"
mvn dependency:analyze -q 2>&1 | grep -c "WARNING" | xargs -I{} echo "Warnings: {}"

# 4. Smoke test
echo "Step 4: Smoke tests"
mvn test -Dcucumber.filter.tags="@smoke" -Dheadless=true -q && echo "PASS" || echo "FAIL"

echo "=== Health Check Complete ==="
```
