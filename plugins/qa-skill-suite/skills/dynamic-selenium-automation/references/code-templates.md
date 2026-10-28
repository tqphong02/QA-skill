# Code Templates Reference

## When to read this

Read this reference in GENERATE mode when creating Java source files for the framework

## BasePage.java

```java
package com.project.automation.pages;

import org.openqa.selenium.*;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.time.Duration;

public abstract class BasePage {

    protected final WebDriver driver;
    protected final WebDriverWait wait;
    protected final Logger logger = LogManager.getLogger(this.getClass());

    protected BasePage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver,
                Duration.ofSeconds(Long.parseLong(
                        System.getProperty("timeout.explicit", "10"))));
    }

    // --- Navigation ---

    protected void navigateTo(String url) {
        logger.info("Navigating to: {}", url);
        driver.get(url);
    }

    protected String getCurrentUrl() {
        return driver.getCurrentUrl();
    }

    protected String getPageTitle() {
        return driver.getTitle();
    }

    // --- Element interaction ---

    protected WebElement waitForVisible(By locator) {
        return wait.until(ExpectedConditions.visibilityOfElementLocated(locator));
    }

    protected WebElement waitForClickable(By locator) {
        return wait.until(ExpectedConditions.elementToBeClickable(locator));
    }

    protected void click(By locator) {
        logger.info("Clicking element: {}", locator);
        waitForClickable(locator).click();
    }

    protected void type(By locator, String text) {
        logger.info("Typing '{}' into: {}", text, locator);
        WebElement element = waitForVisible(locator);
        element.clear();
        element.sendKeys(text);
    }

    protected String getText(By locator) {
        return waitForVisible(locator).getText();
    }

    protected boolean isDisplayed(By locator) {
        try {
            return waitForVisible(locator).isDisplayed();
        } catch (TimeoutException e) {
            return false;
        }
    }

    // --- Waits ---

    protected void waitForUrlContains(String urlFragment) {
        wait.until(ExpectedConditions.urlContains(urlFragment));
    }

    protected void waitForTitleContains(String titleFragment) {
        wait.until(ExpectedConditions.titleContains(titleFragment));
    }

    // --- Screenshot ---

    protected byte[] takeScreenshot() {
        return ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
    }
}
```

## ConfigReader.java

```java
package com.project.automation.config;

import org.aeonbits.owner.Config;
import org.aeonbits.owner.Config.Sources;
import org.aeonbits.owner.ConfigFactory;

@Sources({
    "classpath:config/${env}.properties",
    "classpath:config/dev.properties"
})
public interface ConfigReader extends Config {

    @Key("base.url")
    String baseUrl();

    @Key("browser")
    @DefaultValue("chrome")
    String browser();

    @Key("timeout.implicit")
    @DefaultValue("5")
    int implicitTimeout();

    @Key("timeout.explicit")
    @DefaultValue("10")
    int explicitTimeout();

    @Key("timeout.page.load")
    @DefaultValue("30")
    int pageLoadTimeout();

    static ConfigReader create() {
        String env = System.getProperty("env", "dev");
        return ConfigFactory.create(ConfigReader.class,
                System.getProperties(),
                System.getenv(),
                java.util.Map.of("env", env));
    }
}
```

## DriverFactory.java

```java
package com.project.automation.driver;

import io.github.bonigarcia.wdm.WebDriverManager;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.edge.EdgeDriver;
import org.openqa.selenium.edge.EdgeOptions;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.firefox.FirefoxOptions;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.time.Duration;

public class DriverFactory {

    private static final Logger logger = LogManager.getLogger(DriverFactory.class);

    private DriverFactory() {
        // Utility class
    }

    public static WebDriver createDriver(String browserName, boolean headless,
                                          int implicitTimeout, int pageLoadTimeout) {
        WebDriver driver;

        switch (browserName.toLowerCase()) {
            case "firefox" -> {
                WebDriverManager.firefoxdriver().setup();
                FirefoxOptions options = new FirefoxOptions();
                if (headless) options.addArguments("--headless");
                driver = new FirefoxDriver(options);
            }
            case "edge" -> {
                WebDriverManager.edgedriver().setup();
                EdgeOptions options = new EdgeOptions();
                if (headless) options.addArguments("--headless");
                driver = new EdgeDriver(options);
            }
            default -> {
                WebDriverManager.chromedriver().setup();
                ChromeOptions options = new ChromeOptions();
                if (headless) {
                    options.addArguments("--headless=new");
                    options.addArguments("--no-sandbox");
                    options.addArguments("--disable-dev-shm-usage");
                }
                options.addArguments("--disable-extensions");
                options.addArguments("--start-maximized");
                driver = new ChromeDriver(options);
            }
        }

        driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(implicitTimeout));
        driver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(pageLoadTimeout));

        logger.info("Created {} driver (headless={})", browserName, headless);
        return driver;
    }
}
```

## DriverManager.java

```java
package com.project.automation.driver;

import org.openqa.selenium.WebDriver;

public class DriverManager {

    private static final ThreadLocal<WebDriver> driverThreadLocal = new ThreadLocal<>();

    private DriverManager() {
        // Utility class
    }

    public static WebDriver getDriver() {
        return driverThreadLocal.get();
    }

    public static void setDriver(WebDriver driver) {
        driverThreadLocal.set(driver);
    }

    public static void quitDriver() {
        WebDriver driver = driverThreadLocal.get();
        if (driver != null) {
            driver.quit();
            driverThreadLocal.remove();
        }
    }
}
```

## TestContext.java

```java
package com.project.automation.context;

import com.project.automation.config.ConfigReader;
import com.project.automation.driver.DriverManager;
import org.openqa.selenium.WebDriver;

import java.util.HashMap;
import java.util.Map;

public class TestContext {

    private final ConfigReader config;
    private final Map<String, Object> scenarioData = new HashMap<>();

    public TestContext() {
        this.config = ConfigReader.create();
    }

    public ConfigReader getConfig() {
        return config;
    }

    public WebDriver getDriver() {
        return DriverManager.getDriver();
    }

    public void setData(String key, Object value) {
        scenarioData.put(key, value);
    }

    @SuppressWarnings("unchecked")
    public <T> T getData(String key) {
        return (T) scenarioData.get(key);
    }

    public void clearData() {
        scenarioData.clear();
    }
}
```

## Hooks.java

```java
package com.project.automation.hooks;

import com.project.automation.config.ConfigReader;
import com.project.automation.context.TestContext;
import com.project.automation.driver.DriverFactory;
import com.project.automation.driver.DriverManager;
import io.cucumber.java.After;
import io.cucumber.java.Before;
import io.cucumber.java.Scenario;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;

public class Hooks {

    private static final Logger logger = LogManager.getLogger(Hooks.class);
    private final TestContext testContext;

    public Hooks(TestContext testContext) {
        this.testContext = testContext;
    }

    @Before
    public void setUp(Scenario scenario) {
        logger.info("=== Starting scenario: {} ===", scenario.getName());

        ConfigReader config = testContext.getConfig();
        String browser = System.getProperty("browser", config.browser());
        boolean headless = Boolean.parseBoolean(System.getProperty("headless", "false"));

        WebDriver driver = DriverFactory.createDriver(
                browser, headless,
                config.implicitTimeout(), config.pageLoadTimeout());

        DriverManager.setDriver(driver);
        logger.info("Environment: {} | Browser: {} | Headless: {}",
                System.getProperty("env", "dev"), browser, headless);
    }

    @After
    public void tearDown(Scenario scenario) {
        WebDriver driver = DriverManager.getDriver();

        if (scenario.isFailed() && driver != null) {
            logger.error("Scenario FAILED: {}", scenario.getName());
            byte[] screenshot = ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
            scenario.attach(screenshot, "image/png",
                    "failure_" + scenario.getName().replaceAll("\\s+", "_"));
        }

        DriverManager.quitDriver();
        testContext.clearData();
        logger.info("=== Finished scenario: {} — Status: {} ===",
                scenario.getName(), scenario.getStatus());
    }
}
```

## TestRunner.java (JUnit 5)

```java
package com.project.automation.runners;

import org.junit.platform.suite.api.ConfigurationParameter;
import org.junit.platform.suite.api.IncludeEngines;
import org.junit.platform.suite.api.SelectPackages;
import org.junit.platform.suite.api.Suite;

import static io.cucumber.junit.platform.engine.Constants.*;

@Suite
@IncludeEngines("cucumber")
@SelectPackages("com.project.automation")
@ConfigurationParameter(key = GLUE_PROPERTY_NAME,
        value = "com.project.automation.stepdefinitions,com.project.automation.hooks")
@ConfigurationParameter(key = FEATURES_PROPERTY_NAME,
        value = "src/test/resources/features")
@ConfigurationParameter(key = PLUGIN_PROPERTY_NAME,
        value = "io.qameta.allure.cucumber7jvm.AllureCucumber7Jvm,pretty,html:target/cucumber-reports/cucumber.html")
@ConfigurationParameter(key = FILTER_TAGS_PROPERTY_NAME,
        value = "not @skip")
public class TestRunner {
}
```

## TestRunner.java (TestNG)

```java
package com.project.automation.runners;

import io.cucumber.testng.AbstractTestNGCucumberTests;
import io.cucumber.testng.CucumberOptions;
import org.testng.annotations.DataProvider;

@CucumberOptions(
        features = "src/test/resources/features",
        glue = {"com.project.automation.stepdefinitions",
                "com.project.automation.hooks"},
        plugin = {"io.qameta.allure.cucumber7jvm.AllureCucumber7Jvm",
                  "pretty",
                  "html:target/cucumber-reports/cucumber.html",
                  "json:target/cucumber-reports/cucumber.json"},
        tags = "not @skip"
)
public class TestRunner extends AbstractTestNGCucumberTests {

    @Override
    @DataProvider(parallel = true)
    public Object[][] scenarios() {
        return super.scenarios();
    }
}
```

## SmokeTestRunner.java (JUnit 5)

```java
package com.project.automation.runners;

import org.junit.platform.suite.api.ConfigurationParameter;
import org.junit.platform.suite.api.IncludeEngines;
import org.junit.platform.suite.api.SelectPackages;
import org.junit.platform.suite.api.Suite;

import static io.cucumber.junit.platform.engine.Constants.*;

@Suite
@IncludeEngines("cucumber")
@SelectPackages("com.project.automation")
@ConfigurationParameter(key = GLUE_PROPERTY_NAME,
        value = "com.project.automation.stepdefinitions,com.project.automation.hooks")
@ConfigurationParameter(key = FEATURES_PROPERTY_NAME,
        value = "src/test/resources/features")
@ConfigurationParameter(key = FILTER_TAGS_PROPERTY_NAME,
        value = "@smoke")
public class SmokeTestRunner {
}
```

## Example Page Object — LoginPage.java

```java
package com.project.automation.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

public class LoginPage extends BasePage {

    // --- Locators ---
    private final By usernameInput = By.id("username");
    private final By passwordInput = By.id("password");
    private final By loginButton = By.id("login-button");
    private final By errorMessage = By.cssSelector(".error-message");
    private final By dashboardIndicator = By.cssSelector("[data-testid='dashboard']");

    public LoginPage(WebDriver driver) {
        super(driver);
    }

    // --- Actions ---

    public LoginPage open(String baseUrl) {
        navigateTo(baseUrl + "/login");
        return this;
    }

    public LoginPage enterUsername(String username) {
        type(usernameInput, username);
        return this;
    }

    public LoginPage enterPassword(String password) {
        type(passwordInput, password);
        return this;
    }

    public void clickLogin() {
        click(loginButton);
    }

    public LoginPage loginAs(String username, String password) {
        enterUsername(username);
        enterPassword(password);
        clickLogin();
        return this;
    }

    // --- Verifications ---

    public boolean isErrorMessageDisplayed() {
        return isDisplayed(errorMessage);
    }

    public String getErrorMessageText() {
        return getText(errorMessage);
    }

    public boolean isDashboardLoaded() {
        return isDisplayed(dashboardIndicator);
    }
}
```

## Example Step Definition — LoginSteps.java

```java
package com.project.automation.stepdefinitions;

import com.project.automation.context.TestContext;
import com.project.automation.pages.LoginPage;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

import static org.junit.jupiter.api.Assertions.*;

public class LoginSteps {

    private final TestContext context;
    private LoginPage loginPage;

    public LoginSteps(TestContext context) {
        this.context = context;
    }

    @Given("the user is on the login page")
    public void theUserIsOnTheLoginPage() {
        loginPage = new LoginPage(context.getDriver());
        loginPage.open(context.getConfig().baseUrl());
    }

    @When("the user enters valid credentials")
    public void theUserEntersValidCredentials() {
        // Load from test data, not hardcoded
        String username = context.getData("valid.username");
        String password = context.getData("valid.password");
        loginPage.loginAs(username, password);
    }

    @When("the user enters {string} and {string}")
    public void theUserEntersCredentials(String username, String password) {
        loginPage.enterUsername(username);
        loginPage.enterPassword(password);
    }

    @When("the user clicks the login button")
    public void theUserClicksTheLoginButton() {
        loginPage.clickLogin();
    }

    @Then("the user should be redirected to the dashboard")
    public void theUserShouldBeRedirectedToDashboard() {
        assertTrue(loginPage.isDashboardLoaded(),
                "Dashboard should be loaded after successful login");
    }

    @Then("an error message {string} should be displayed")
    public void anErrorMessageShouldBeDisplayed(String expectedMessage) {
        assertTrue(loginPage.isErrorMessageDisplayed(),
                "Error message should be visible");
        assertEquals(expectedMessage, loginPage.getErrorMessageText(),
                "Error message text should match expected");
    }
}
```

## Environment property file template

```properties
# config/dev.properties
base.url=http://localhost:8080
browser=chrome
timeout.implicit=5
timeout.explicit=10
timeout.page.load=30
```

## log4j2.xml template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Configuration status="WARN">
    <Appenders>
        <Console name="Console" target="SYSTEM_OUT">
            <PatternLayout pattern="%d{HH:mm:ss.SSS} [%t] %-5level %logger{36} - %msg%n"/>
        </Console>
        <File name="File" fileName="target/logs/automation.log">
            <PatternLayout pattern="%d{yyyy-MM-dd HH:mm:ss.SSS} [%t] %-5level %logger{36} - %msg%n"/>
        </File>
    </Appenders>
    <Loggers>
        <Logger name="com.project.automation" level="INFO"/>
        <Root level="WARN">
            <AppenderRef ref="Console"/>
            <AppenderRef ref="File"/>
        </Root>
    </Loggers>
</Configuration>
```

## allure.properties template

```properties
allure.results.directory=target/allure-results
allure.link.issue.pattern=https://project.atlassian.net/browse/{}
allure.link.tms.pattern=https://project.atlassian.net/browse/{}
```

## cucumber.properties template

```properties
cucumber.publish.quiet=true
```

## .gitignore template

```gitignore
# Build
target/
*.class

# IDE
.idea/
*.iml
.vscode/
.settings/
.project
.classpath
*.swp

# OS
.DS_Store
Thumbs.db

# Drivers
*.exe
chromedriver
geckodriver

# Logs
*.log

# Reports (generated)
allure-results/
allure-report/

# Secrets
*.env
*.secret
credentials.*
```
