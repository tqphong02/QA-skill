import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildAnyCallGraph,
  buildCallGraph,
  buildNestJsGraph,
} from "../src/graph.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("interprocedural and NestJS graphs", () => {
  it("resolves controller to service to repository through constructor DI", () => {
    const nestRoot = resolve(root, "fixtures/nestjs");
    const graph = buildCallGraph({
      repositoryPath: nestRoot,
      filePath: "payment.controller.ts",
      className: "PaymentController",
      functionName: "create",
      maxDepth: 5,
      maxNodes: 20,
    });
    expect(graph.nodes.map((node) => node.functionName)).toEqual([
      "create",
      "processPayment",
      "save",
    ]);
    expect(
      graph.edges.filter((edge) => edge.resolution === "resolved"),
    ).toHaveLength(2);
    expect(graph.truncated).toBe(false);
  });

  it("extracts NestJS modules, injections and HTTP routes", () => {
    const graph = buildNestJsGraph(resolve(root, "fixtures/nestjs"));
    expect(graph.modules).toContainEqual({
      name: "PaymentModule",
      controllers: ["PaymentController"],
      providers: ["PaymentService", "PaymentRepository"],
      imports: [],
      exports: ["PaymentService"],
    });
    expect(graph.injections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "PaymentController",
          to: "PaymentService",
          resolved: true,
        }),
        expect.objectContaining({
          from: "PaymentService",
          to: "PaymentRepository",
          resolved: true,
        }),
      ]),
    );
    expect(graph.routes).toContainEqual({
      controller: "PaymentController",
      method: "create",
      httpMethod: "POST",
      path: "/payments",
      handler: "PaymentController.create",
    });
    expect(graph.warnings).toContain(
      "Unresolved injection OrphanService.gateway: EXTERNAL_GATEWAY",
    );
  });

  it("resolves a Python same-file call without loading source into the model", () => {
    const graph = buildAnyCallGraph({
      repositoryPath: root,
      filePath: "fixtures/payment_service.py",
      functionName: "process_payment",
    });
    expect(graph.language).toBe("python");
    expect(graph.nodes.map((node) => node.functionName)).toContain(
      "create_payment",
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: "fixtures/payment_service.py#create_payment",
          resolution: "resolved",
        }),
      ]),
    );
  });

  it("fails closed on missing/ambiguous entries and marks bounded traversal", () => {
    expect(() =>
      buildCallGraph({
        repositoryPath: root,
        functionName: "notHere",
      }),
    ).toThrow(/FUNCTION_NOT_FOUND/);
    expect(() =>
      buildCallGraph({
        repositoryPath: root,
        functionName: "processPayment",
      }),
    ).toThrow(/AMBIGUOUS_FUNCTION/);

    const bounded = buildAnyCallGraph({
      repositoryPath: root,
      filePath: "fixtures/payment_service.py",
      functionName: "process_payment",
      maxDepth: 0,
    });
    expect(bounded.truncated).toBe(true);
    expect(() =>
      buildAnyCallGraph({
        repositoryPath: root,
        filePath: "fixtures/payment_service.py",
        functionName: "not_here",
      }),
    ).toThrow(/FUNCTION_NOT_FOUND/);
  });
});
