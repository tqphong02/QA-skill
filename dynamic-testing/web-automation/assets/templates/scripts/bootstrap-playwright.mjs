#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const REQUIRED_DEV_DEPENDENCIES = {
  '@playwright/test': '^1.54.0',
  '@types/node': '^22.0.0',
  typescript: '^5.8.0',
};

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hasAnyDependency(packageJson, name) {
  return [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ].some(section => section && typeof section[name] === 'string');
}

function declaredDependencies(packageJson) {
  return [...new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ])];
}

function localBinary(projectRoot, name) {
  const binaryName = process.platform === 'win32' ? `${name}.cmd` : name;
  return path.join(projectRoot, 'node_modules', '.bin', binaryName);
}

export function inspectProjectRuntime(projectRoot) {
  const packagePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return {
      status: 'BLOCKED',
      reason: 'package.json is required in project-root',
      package_path: packagePath,
      missing_dependencies: Object.keys(REQUIRED_DEV_DEPENDENCIES),
      install_required: true,
      playwright_module: false,
      playwright_cli: false,
      typescript_cli: false,
    };
  }

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (error) {
    return {
      status: 'BLOCKED',
      reason: `cannot parse package.json: ${error.message}`,
      package_path: packagePath,
      missing_dependencies: [],
      install_required: false,
      playwright_module: false,
      playwright_cli: false,
      typescript_cli: false,
    };
  }

  const missingDependencies = Object.keys(REQUIRED_DEV_DEPENDENCIES)
    .filter(name => !hasAnyDependency(packageJson, name));
  const missingDeclaredModules = declaredDependencies(packageJson)
    .filter(name => !fs.existsSync(path.join(projectRoot, 'node_modules', name, 'package.json')));
  const playwrightModule = fs.existsSync(path.join(projectRoot, 'node_modules', '@playwright', 'test', 'package.json'));
  const playwrightCli = fs.existsSync(localBinary(projectRoot, 'playwright'));
  const typescriptCli = fs.existsSync(localBinary(projectRoot, 'tsc'));
  const installRequired = missingDependencies.length > 0
    || missingDeclaredModules.length > 0
    || !playwrightModule
    || !playwrightCli
    || !typescriptCli;

  return {
    status: installRequired ? 'NEEDS_BOOTSTRAP' : 'READY',
    package_path: packagePath,
    missing_dependencies: missingDependencies,
    missing_declared_modules: missingDeclaredModules,
    install_required: installRequired,
    playwright_module: playwrightModule,
    playwright_cli: playwrightCli,
    typescript_cli: typescriptCli,
    package_name: packageJson.name || null,
  };
}

function readPackageJson(projectRoot) {
  const packagePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error(`BLOCKED: package.json không tồn tại trong project-root: ${projectRoot}`);
  }
  try {
    return {
      packagePath,
      value: JSON.parse(fs.readFileSync(packagePath, 'utf8')),
    };
  } catch (error) {
    throw new Error(`BLOCKED: package.json không hợp lệ: ${error.message}`);
  }
}

function run(command, args, projectRoot, label, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${label} thất bại (exit=${result.status ?? 'unknown'})`);
  }
  return result;
}

function ensurePackageDependencies(projectRoot) {
  const { packagePath, value: packageJson } = readPackageJson(projectRoot);
  const missingDependencies = Object.entries(REQUIRED_DEV_DEPENDENCIES)
    .filter(([name]) => !hasAnyDependency(packageJson, name));
  if (missingDependencies.length === 0) return [];

  packageJson.devDependencies = {
    ...(packageJson.devDependencies || {}),
    ...Object.fromEntries(missingDependencies),
  };
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  return missingDependencies.map(([name]) => name);
}

function installDependencies(projectRoot) {
  // Keep dependency installation explicit and deterministic. Playwright browser
  // installation is performed separately below, so npm lifecycle scripts from a
  // target project cannot silently download or mutate unrelated resources.
  run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], projectRoot, 'npm install');
}

function installedBrowserExecutable(browser) {
  try {
    const playwright = require('@playwright/test');
    const browserType = playwright[browser];
    if (!browserType || typeof browserType.executablePath !== 'function') return null;
    const executable = browserType.executablePath();
    return executable && fs.existsSync(executable) ? executable : null;
  } catch {
    return null;
  }
}

function installBrowsers(projectRoot, browsers, withDeps) {
  const missingBrowsers = browsers.filter(browser => !installedBrowserExecutable(browser));
  if (missingBrowsers.length === 0) return { status: 'READY', installed: [], skipped: browsers };
  const args = ['--no-install', 'playwright', 'install'];
  if (withDeps) args.push('--with-deps');
  args.push(...missingBrowsers);
  run('npx', args, projectRoot, `npx playwright install ${missingBrowsers.join(', ')}`);
  return { status: 'READY', installed: missingBrowsers, skipped: browsers.filter(browser => !missingBrowsers.includes(browser)) };
}

function checkTypes(projectRoot) {
  const tsc = localBinary(projectRoot, 'tsc');
  if (!fs.existsSync(tsc)) throw new Error('BLOCKED: project-local TypeScript binary chưa sẵn sàng');
  run(tsc, ['--noEmit'], projectRoot, 'tsc --noEmit');
}

export function ensurePlaywrightRuntime(projectRoot, {
  browsers = ['chromium'],
  install = true,
  installBrowsers: shouldInstallBrowsers = true,
  checkTypes: shouldCheckTypes = true,
  withDeps = false,
} = {}) {
  const resolvedRoot = path.resolve(projectRoot);
  const initial = inspectProjectRuntime(resolvedRoot);
  if (initial.status === 'BLOCKED') throw new Error(`BLOCKED: ${initial.reason}`);
  if (initial.install_required && !install) {
    throw new Error(`BLOCKED: project runtime chưa sẵn sàng (${initial.missing_dependencies.join(', ') || 'node_modules thiếu'})`);
  }

  const addedDependencies = ensurePackageDependencies(resolvedRoot);
  let runtime = inspectProjectRuntime(resolvedRoot);
  let installedDependencies = false;
  if (runtime.install_required) {
    installDependencies(resolvedRoot);
    installedDependencies = true;
    runtime = inspectProjectRuntime(resolvedRoot);
  }
  if (runtime.install_required) {
    throw new Error(`BLOCKED: project dependencies vẫn thiếu sau npm install: ${JSON.stringify(runtime)}`);
  }

  const browserInstall = shouldInstallBrowsers && browsers.length > 0
    ? installBrowsers(resolvedRoot, browsers, withDeps)
    : { status: 'SKIPPED', installed: [], skipped: [] };
  if (shouldCheckTypes && fs.existsSync(path.join(resolvedRoot, 'tsconfig.json'))) {
    checkTypes(resolvedRoot);
  }

  return {
    status: 'READY',
    project_root: resolvedRoot,
    added_dependencies: addedDependencies,
    installed_dependencies: installedDependencies,
    browsers: shouldInstallBrowsers ? browsers : [],
    typecheck: shouldCheckTypes && fs.existsSync(path.join(resolvedRoot, 'tsconfig.json')) ? 'PASS' : 'SKIPPED',
    browser_install: browserInstall,
    runtime: inspectProjectRuntime(resolvedRoot),
  };
}

function parseBrowsers(value) {
  return String(value || 'chromium')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function main() {
  const projectRoot = path.resolve(getArg('--project-root', process.cwd()));
  const checkOnly = process.argv.includes('--check-only');
  const skipInstall = process.argv.includes('--skip-install');
  const skipBrowsers = process.argv.includes('--skip-browsers');
  const skipTypes = process.argv.includes('--skip-types');
  const result = checkOnly
    ? inspectProjectRuntime(projectRoot)
    : ensurePlaywrightRuntime(projectRoot, {
      browsers: parseBrowsers(getArg('--browsers', 'chromium')),
      install: !skipInstall,
      installBrowsers: !skipBrowsers,
      checkTypes: !skipTypes,
      withDeps: process.argv.includes('--with-deps'),
    });
  const output = {
    ...result,
    command: checkOnly ? 'check-only' : 'bootstrap',
  };
  console.log(JSON.stringify(output, null, 2));
  if (output.status !== 'READY') process.exitCode = 2;
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[playwright-bootstrap] ${error.message}`);
    process.exitCode = 2;
  }
}
