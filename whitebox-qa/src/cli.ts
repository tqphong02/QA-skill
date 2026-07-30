#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { attachTokenBudget, compactAnalysis } from "./compact.js";
import { importIstanbulCoverageFiles } from "./coverage.js";
import { runJsCoverage } from "./coverage-runner.js";
import { analyzeAnyFunction, findAnyFunctions } from "./engine.js";
import { buildAnyCallGraph, buildNestJsGraph } from "./graph.js";
import { createTestcaseTemplateInput, readJson } from "./handoff.js";
import { renderMarkdown } from "./reporters.js";
import { scanRepository } from "./scanner.js";
import { writeUnitTest } from "./unit-test-generator.js";

const program = new Command();
program
  .name("whitebox")
  .description(
    "Deterministic multi-language white-box analyzer with runtime evidence import",
  )
  .version("2.0.0");

program
  .command("scan")
  .argument("<repo>", "repository path")
  .action((repo: string) => {
    const root = resolve(repo);
    console.log(
      JSON.stringify(
        {
          repositoryPath: root,
          files: scanRepository(root).map((path) =>
            path.slice(root.length + 1),
          ),
        },
        null,
        2,
      ),
    );
  });

program
  .command("find")
  .argument("<function>", "function or method name")
  .requiredOption("--repo <path>", "repository path")
  .option("--file <path>", "relative or absolute source file")
  .option("--class <name>", "class name")
  .action(
    (
      functionName: string,
      options: { repo: string; file?: string; class?: string },
    ) => {
      const matches = findAnyFunctions(
        resolve(options.repo),
        functionName,
        options.file,
        options.class,
      ).map((match) => {
        const { absoluteFilePath: _absolute, ...publicMatch } = match;
        return publicMatch;
      });
      console.log(
        JSON.stringify({ functionName, count: matches.length, matches }, null, 2),
      );
      if (matches.length === 0) process.exitCode = 2;
    },
  );

program
  .command("analyze")
  .requiredOption("--function <name>", "function or method name")
  .option("--repo <path>", "repository path", ".")
  .option("--file <path>", "relative or absolute source file")
  .option("--class <name>", "class name")
  .option("--format <format>", "json, compact, markdown, or both", "compact")
  .option("--output <path>", "output file or basename")
  .option("--max-branches <count>", "decision limit", "20")
  .option("--max-paths <count>", "execution path limit", "50")
  .option("--max-depth <count>", "nested control-flow depth limit", "5")
  .action(
    (options: {
      function: string;
      repo: string;
      file?: string;
      class?: string;
      format: string;
      output?: string;
      maxBranches: string;
      maxPaths: string;
      maxDepth: string;
    }) => {
      if (!["json", "compact", "markdown", "both"].includes(options.format)) {
        throw new Error(`INVALID_FORMAT: ${options.format}`);
      }
      const analysis = attachTokenBudget(analyzeAnyFunction({
        repositoryPath: resolve(options.repo),
        filePath: options.file,
        functionName: options.function,
        className: options.class,
        maxBranches: Number.parseInt(options.maxBranches, 10),
        maxPaths: Number.parseInt(options.maxPaths, 10),
        maxDepth: Number.parseInt(options.maxDepth, 10),
      }));
      const json = `${JSON.stringify(analysis, null, 2)}\n`;
      const compact = `${JSON.stringify(compactAnalysis(analysis), null, 2)}\n`;
      const markdown = renderMarkdown(analysis);
      if (!options.output) {
        console.log(
          options.format === "markdown"
            ? markdown
            : options.format === "json"
              ? json.trimEnd()
              : compact.trimEnd(),
        );
        if (options.format === "both") {
          console.error(
            "FORMAT_NOTICE: --format both without --output prints compact JSON only",
          );
        }
        return;
      }
      const requested = resolve(options.output);
      const base =
        extname(requested) === ".json" || extname(requested) === ".md"
          ? requested.slice(0, -extname(requested).length)
          : requested;
      mkdirSync(dirname(base), { recursive: true });
      if (options.format === "json" || options.format === "both") {
        writeFileSync(`${base}.json`, json);
      }
      if (options.format === "compact") {
        writeFileSync(`${base}.compact.json`, compact);
      }
      if (options.format === "markdown" || options.format === "both") {
        writeFileSync(`${base}.md`, markdown);
      }
    },
  );

program
  .command("handoff")
  .requiredOption("--analysis <path>", "whitebox analysis JSON")
  .requiredOption("--mapping <path>", "explicit requirement mapping JSON")
  .requiredOption("--output-json <path>", "canonical testcase-template JSON")
  .option("--xlsx <path>", "invoke canonical testcase generator")
  .action(
    (options: {
      analysis: string;
      mapping: string;
      outputJson: string;
      xlsx?: string;
    }) => {
      const canonical = createTestcaseTemplateInput(
        readJson(resolve(options.analysis)),
        readJson(resolve(options.mapping)),
      );
      const outputJson = resolve(options.outputJson);
      mkdirSync(dirname(outputJson), { recursive: true });
      writeFileSync(outputJson, `${JSON.stringify(canonical, null, 2)}\n`);
      console.log(`Generated canonical testcase JSON: ${outputJson}`);
      if (!options.xlsx) return;

      const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
      const generatorCandidates = [
        resolve(skillRoot, "..", "testcase-template", "scripts", "gen-testcases.py"),
        resolve(
          skillRoot,
          "..",
          "..",
          "testcase-template",
          "scripts",
          "gen-testcases.py",
        ),
      ];
      const generator = generatorCandidates.find(existsSync);
      if (!generator) {
        throw new Error(
          "TESTCASE_TEMPLATE_NOT_FOUND: install whitebox-qa with testcase-template",
        );
      }
      const result = spawnSync(
        "python3",
        [generator, outputJson, resolve(options.xlsx)],
        { stdio: "inherit" },
      );
      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(
          `TESTCASE_TEMPLATE_FAILED: generator exited ${result.status}`,
        );
      }
    },
  );

program
  .command("graph")
  .description("Build a bounded interprocedural call graph")
  .requiredOption("--repo <path>", "repository path")
  .requiredOption("--function <name>", "entry function or method")
  .option("--file <path>", "exact source file")
  .option("--class <name>", "exact class name")
  .option("--max-depth <count>", "call depth", "5")
  .option("--max-nodes <count>", "node limit", "100")
  .option("--output <path>", "output JSON path")
  .action(
    (options: {
      repo: string;
      function: string;
      file?: string;
      class?: string;
      maxDepth: string;
      maxNodes: string;
      output?: string;
    }) => {
      const graph = buildAnyCallGraph({
        repositoryPath: resolve(options.repo),
        functionName: options.function,
        filePath: options.file,
        className: options.class,
        maxDepth: Number.parseInt(options.maxDepth, 10),
        maxNodes: Number.parseInt(options.maxNodes, 10),
      });
      const rendered = `${JSON.stringify(graph, null, 2)}\n`;
      if (options.output) {
        const output = resolve(options.output);
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, rendered);
      } else {
        console.log(rendered.trimEnd());
      }
    },
  );

program
  .command("nestjs")
  .description("Extract NestJS modules, constructor DI and controller routes")
  .requiredOption("--repo <path>", "NestJS repository path")
  .option("--output <path>", "output JSON path")
  .action((options: { repo: string; output?: string }) => {
    const graph = buildNestJsGraph(resolve(options.repo));
    const rendered = `${JSON.stringify(graph, null, 2)}\n`;
    if (options.output) {
      const output = resolve(options.output);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, rendered);
    } else {
      console.log(rendered.trimEnd());
    }
  });

program
  .command("generate-test")
  .description("Generate executable Jest or Vitest source from approved mappings")
  .requiredOption("--analysis <path>", "whitebox analysis JSON")
  .requiredOption("--mapping <path>", "unit-test mapping JSON")
  .requiredOption("--output <path>", "output .test.ts path")
  .action(
    (options: { analysis: string; mapping: string; output: string }) => {
      const output = resolve(options.output);
      mkdirSync(dirname(output), { recursive: true });
      writeUnitTest(
        readJson(resolve(options.analysis)),
        readJson(resolve(options.mapping)),
        output,
      );
      console.log(`Generated executable unit test: ${output}`);
    },
  );

program
  .command("coverage")
  .description("Import measured Istanbul coverage into a Whitebox analysis")
  .requiredOption("--analysis <path>", "whitebox analysis JSON")
  .requiredOption("--report <path>", "Istanbul coverage-final.json")
  .requiredOption("--output <path>", "enriched analysis JSON")
  .action(
    (options: { analysis: string; report: string; output: string }) => {
      const enriched = attachTokenBudget(
        importIstanbulCoverageFiles(
          resolve(options.analysis),
          resolve(options.report),
        ),
      );
      const output = resolve(options.output);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, `${JSON.stringify(enriched, null, 2)}\n`);
      console.log(
        `Imported runtime coverage: statement=${enriched.coverage.statement ?? "N/A"} branch=${enriched.coverage.branch ?? "N/A"}`,
      );
    },
  );

program
  .command("run-coverage")
  .description("Run local Jest/Vitest coverage and enrich a Whitebox analysis")
  .requiredOption("--runner <name>", "vitest or jest")
  .requiredOption("--cwd <path>", "target repository path")
  .requiredOption("--analysis <path>", "whitebox analysis JSON")
  .requiredOption("--output <path>", "enriched analysis JSON")
  .option("--test <path>", "test file or test filter")
  .option("--config <path>", "Jest/Vitest config path")
  .option("--report <path>", "coverage-final.json path")
  .action(
    (options: {
      runner: string;
      cwd: string;
      analysis: string;
      output: string;
      test?: string;
      config?: string;
      report?: string;
    }) => {
      if (options.runner !== "vitest" && options.runner !== "jest") {
        throw new Error(`COVERAGE_RUNNER_UNSUPPORTED: ${options.runner}`);
      }
      const enriched = attachTokenBudget(
        runJsCoverage({
          runner: options.runner,
          cwd: options.cwd,
          analysisPath: options.analysis,
          testPath: options.test,
          configPath: options.config,
          reportPath: options.report,
        }),
      );
      const output = resolve(options.output);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, `${JSON.stringify(enriched, null, 2)}\n`);
      console.log(
        `Runtime coverage passed and imported: statement=${enriched.coverage.statement ?? "N/A"} branch=${enriched.coverage.branch ?? "N/A"}`,
      );
    },
  );

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 2;
});
