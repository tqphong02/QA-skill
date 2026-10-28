# POM Template Reference

## When to read this

Read this reference in GENERATE mode when creating a new `pom.xml` or validating an existing one

## Complete pom.xml — JUnit 5 stack (default)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.project</groupId>
    <artifactId>selenium-automation</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <packaging>jar</packaging>

    <name>Selenium Automation Framework</name>
    <description>BDD automation framework with Selenium WebDriver, Cucumber, and JUnit 5</description>

    <properties>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>

        <!-- Dependency versions -->
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

        <!-- Plugin versions -->
        <surefire.version>3.5.2</surefire.version>
        <compiler.version>3.13.0</compiler.version>
        <allure-maven.version>2.13.0</allure-maven.version>

        <!-- Runtime properties with defaults -->
        <env>dev</env>
        <browser>chrome</browser>
        <headless>false</headless>
    </properties>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>com.fasterxml.jackson</groupId>
                <artifactId>jackson-bom</artifactId>
                <version>${jackson.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>

    <dependencies>
        <!-- Selenium -->
        <dependency>
            <groupId>org.seleniumhq.selenium</groupId>
            <artifactId>selenium-java</artifactId>
            <version>${selenium.version}</version>
        </dependency>

        <!-- WebDriverManager -->
        <dependency>
            <groupId>io.github.bonigarcia</groupId>
            <artifactId>webdrivermanager</artifactId>
            <version>${webdrivermanager.version}</version>
        </dependency>

        <!-- Cucumber -->
        <dependency>
            <groupId>io.cucumber</groupId>
            <artifactId>cucumber-java</artifactId>
            <version>${cucumber.version}</version>
        </dependency>
        <dependency>
            <groupId>io.cucumber</groupId>
            <artifactId>cucumber-junit-platform-engine</artifactId>
            <version>${cucumber.version}</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>io.cucumber</groupId>
            <artifactId>cucumber-picocontainer</artifactId>
            <version>${cucumber.version}</version>
            <scope>test</scope>
        </dependency>

        <!-- JUnit 5 -->
        <dependency>
            <groupId>org.junit.platform</groupId>
            <artifactId>junit-platform-suite</artifactId>
            <version>${junit-platform.version}</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter-api</artifactId>
            <version>${junit5.version}</version>
            <scope>test</scope>
        </dependency>

        <!-- Allure -->
        <dependency>
            <groupId>io.qameta.allure</groupId>
            <artifactId>allure-cucumber7-jvm</artifactId>
            <version>${allure.version}</version>
            <scope>test</scope>
        </dependency>

        <!-- Logging -->
        <dependency>
            <groupId>org.apache.logging.log4j</groupId>
            <artifactId>log4j-core</artifactId>
            <version>${log4j2.version}</version>
        </dependency>
        <dependency>
            <groupId>org.apache.logging.log4j</groupId>
            <artifactId>log4j-api</artifactId>
            <version>${log4j2.version}</version>
        </dependency>
        <dependency>
            <groupId>org.apache.logging.log4j</groupId>
            <artifactId>log4j-slf4j2-impl</artifactId>
            <version>${log4j2.version}</version>
        </dependency>

        <!-- JSON -->
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-databind</artifactId>
        </dependency>

        <!-- Excel -->
        <dependency>
            <groupId>org.apache.poi</groupId>
            <artifactId>poi-ooxml</artifactId>
            <version>${poi.version}</version>
        </dependency>

        <!-- Configuration -->
        <dependency>
            <groupId>org.aeonbits.owner</groupId>
            <artifactId>owner</artifactId>
            <version>${owner.version}</version>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>${compiler.version}</version>
                <configuration>
                    <source>${maven.compiler.source}</source>
                    <target>${maven.compiler.target}</target>
                    <encoding>${project.build.sourceEncoding}</encoding>
                </configuration>
            </plugin>

            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>${surefire.version}</version>
                <configuration>
                    <properties>
                        <configurationParameters>
                            cucumber.junit-platform.naming-strategy=long
                            cucumber.plugin=io.qameta.allure.cucumber7jvm.AllureCucumber7Jvm,pretty,html:target/cucumber-reports/cucumber.html,json:target/cucumber-reports/cucumber.json
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

            <plugin>
                <groupId>io.qameta.allure</groupId>
                <artifactId>allure-maven</artifactId>
                <version>${allure-maven.version}</version>
                <configuration>
                    <resultsDirectory>${project.build.directory}/allure-results</resultsDirectory>
                    <reportDirectory>${project.build.directory}/allure-report</reportDirectory>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

## Complete pom.xml — TestNG stack

Replace these sections when TestNG is selected:

```xml
<!-- Remove cucumber-junit-platform-engine, junit-platform-suite, junit-jupiter-api -->
<!-- Add instead: -->
<dependency>
    <groupId>io.cucumber</groupId>
    <artifactId>cucumber-testng</artifactId>
    <version>${cucumber.version}</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testng</groupId>
    <artifactId>testng</artifactId>
    <version>${testng.version}</version>
    <scope>test</scope>
</dependency>

<!-- Surefire configuration for TestNG -->
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-surefire-plugin</artifactId>
    <version>${surefire.version}</version>
    <configuration>
        <suiteXmlFiles>
            <suiteXmlFile>src/test/resources/testng.xml</suiteXmlFile>
        </suiteXmlFiles>
        <systemPropertyVariables>
            <env>${env}</env>
            <browser>${browser}</browser>
            <headless>${headless}</headless>
        </systemPropertyVariables>
    </configuration>
</plugin>
```

## Validation checklist

Before delivering `pom.xml`:
- [ ] All `${version}` properties are defined
- [ ] No duplicate dependencies
- [ ] Test-scoped dependencies are marked `<scope>test</scope>`
- [ ] Surefire plugin matches the selected test runner
- [ ] Allure plugin configuration matches allure.properties
- [ ] Compiler source/target matches the Java version
- [ ] System properties pass env, browser, headless to tests
- [ ] Jackson BOM is used for consistent Jackson versions
