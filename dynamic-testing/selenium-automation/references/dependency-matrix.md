# Dependency Matrix Reference

## When to read this

Read this reference in DESIGN mode when selecting and validating the dependency set for pom.xml

## Compatibility matrix — JUnit 5 stack (default)

```xml
<!-- BOM versions — update together -->
<selenium.version>4.27.0</selenium.version>
<cucumber.version>7.20.1</cucumber.version>
<junit5.version>5.11.3</junit5.version>
<junit-platform.version>1.11.3</junit-platform.version>
<allure.version>2.29.0</allure.version>
<jackson.version>2.18.1</jackson.version>
<log4j2.version>2.24.1</log4j2.version>
<poi.version>5.3.0</poi.version>
<webdrivermanager.version>5.9.2</webdrivermanager.version>
<owner.version>1.0.12</owner.version>

<!-- Core dependencies -->
selenium-java                    ${selenium.version}
cucumber-java                    ${cucumber.version}
cucumber-junit-platform-engine   ${cucumber.version}     <!-- NOT cucumber-junit -->
cucumber-picocontainer           ${cucumber.version}
junit-platform-suite             ${junit-platform.version}
junit-jupiter-api                ${junit5.version}        <!-- test scope -->
allure-cucumber7-jvm             ${allure.version}
webdrivermanager                 ${webdrivermanager.version}
jackson-databind                 ${jackson.version}
poi-ooxml                        ${poi.version}
log4j-core                       ${log4j2.version}
log4j-api                        ${log4j2.version}
log4j-slf4j2-impl               ${log4j2.version}
owner                            ${owner.version}
```

### Critical JUnit 5 + Cucumber integration notes

1. Use `cucumber-junit-platform-engine`, NOT `cucumber-junit` (JUnit 4 vintage)
2. Runner class uses `@Suite` and `@ConfigurationParameter`, NOT `@RunWith(Cucumber.class)`
3. `junit-platform.properties` must include `cucumber.plugin` configuration
4. Surefire plugin must have `<configurationParameters>` for Cucumber discovery

## Compatibility matrix — TestNG stack

```xml
<selenium.version>4.27.0</selenium.version>
<cucumber.version>7.20.1</cucumber.version>
<testng.version>7.10.2</testng.version>
<allure.version>2.29.0</allure.version>

<!-- Core dependencies — differences from JUnit 5 -->
cucumber-testng                  ${cucumber.version}     <!-- replaces cucumber-junit-platform-engine -->
testng                           ${testng.version}
allure-testng                    ${allure.version}       <!-- replaces allure-cucumber7-jvm if using TestNG runner directly -->
```

### Critical TestNG + Cucumber integration notes

1. Runner class extends `AbstractTestNGCucumberTests`
2. Override `scenarios()` method with `@DataProvider(parallel = true)` for parallel execution
3. Surefire plugin uses `<suiteXmlFiles>` for TestNG XML configuration
4. Allure uses `allure-cucumber7-jvm` for Cucumber-level reporting

## Maven plugins

```xml
<!-- Build plugins -->
maven-compiler-plugin     3.13.0    <!-- source/target = 17 or 21 -->
maven-surefire-plugin     3.5.2     <!-- test execution -->
allure-maven              2.13.0    <!-- report generation -->
maven-checkstyle-plugin   3.5.0     <!-- optional: code style -->

<!-- Surefire configuration for JUnit 5 + Cucumber -->
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-surefire-plugin</artifactId>
  <configuration>
    <properties>
      <configurationParameters>
        cucumber.junit-platform.naming-strategy=long
        cucumber.plugin=io.qameta.allure.cucumber7jvm.AllureCucumber7Jvm,pretty,html:target/cucumber-reports/cucumber.html
        cucumber.publish.quiet=true
      </configurationParameters>
    </properties>
    <systemPropertyVariables>
      <env>${env}</env>
      <browser>${browser}</browser>
      <headless>${headless}</headless>
    </systemPropertyVariables>
  </configuration>
</plugin>
```

## Conflict resolution rules

| Conflict | Resolution |
|---|---|
| cucumber-junit vs cucumber-junit-platform-engine | Use only one. JUnit 5 → platform-engine. JUnit 4 → cucumber-junit |
| Multiple SLF4J bindings | Keep only one: log4j-slf4j2-impl OR logback-classic |
| Selenium Manager vs WebDriverManager | Selenium 4.11+ has built-in Selenium Manager. WebDriverManager is optional but provides more control |
| Jackson version conflicts | Use jackson-bom to enforce consistent versions |
| Guava version conflicts | Selenium 4.x bundles Guava; do not declare a separate version unless needed |

## Validation command

After generating pom.xml:
```bash
mvn dependency:tree -Dverbose
mvn dependency:analyze
```

Check for:
- No duplicate artifacts
- No version conflicts
- No unused declared dependencies
- No used undeclared dependencies
