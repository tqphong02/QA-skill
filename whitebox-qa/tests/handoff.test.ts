import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeFunction } from "../src/analyzer.js";
import { createTestcaseTemplateInput } from "../src/handoff.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function analysis() {
  return analyzeFunction({
    repositoryPath: root,
    filePath: "fixtures/payment-service.ts",
    className: "PaymentService",
    functionName: "processPayment",
    maxBranches: 20,
    maxPaths: 50,
    maxDepth: 5,
  });
}

function mapping(requirement = "AC1") {
  return {
    project: {
      code: "PAY",
      name: "Payment Service",
      device: "Whitebox function-level test",
      version: "v1",
      priority: "High",
      test_date: "2026-07-29",
      author: "QA Team",
      reviewer: "Lead QA",
      description: "Kiểm thử logic xử lý thanh toán từ source code",
      objective: "Bao phủ các nhánh đã xác nhận theo requirement",
    },
    source_document: "requirements/payment.md",
    requirements: [
      { id: "AC1", text: "Từ chối thanh toán khi không có người dùng" },
    ],
    group: "PAYMENT",
    mappings: [
      {
        candidate_id: "WB-001",
        requirement,
        scenario_id: "SCN-WB-PAY-001",
        scenario_name: "Từ chối thanh toán khi không có người dùng",
        type: "negative",
        description:
          "Xác minh rằng hệ thống từ chối thanh toán khi không tìm thấy người dùng",
        pre_condition:
          "Không có người dùng tương ứng với userId được dùng để kiểm thử",
        procedure:
          "1. Chuẩn bị userId không tồn tại\n2. Gọi chức năng xử lý thanh toán với userId đã chuẩn bị\n3. Quan sát kết quả",
        expected:
          "1. Thanh toán không được tạo\n2. Hệ thống trả lỗi USER_NOT_FOUND",
        priority: "High",
      },
    ],
  };
}

describe("testcase-template handoff", () => {
  it("builds canonical UI and FUNCTION sections without a local template", () => {
    const input = createTestcaseTemplateInput(analysis(), mapping());
    expect(input).toMatchObject({
      sections: [
        { title: "1.1. USER INTERFACE", kind: "ui" },
        { title: "1.2. FUNCTION", kind: "function" },
      ],
    });
    expect(JSON.stringify(input)).toContain("sha256=");
    expect(JSON.stringify(input)).toContain("branches=BR-");
  });

  it("blocks unknown requirements", () => {
    expect(() =>
      createTestcaseTemplateInput(analysis(), mapping("AC404")),
    ).toThrow(/UNKNOWN_REQUIREMENT/);
  });

  it("blocks unknown and duplicate candidate mappings", () => {
    const unknown = mapping();
    unknown.mappings[0].candidate_id = "WB-404";
    expect(() => createTestcaseTemplateInput(analysis(), unknown)).toThrow(
      /UNKNOWN_CANDIDATE/,
    );

    const duplicate = mapping();
    duplicate.mappings.push({ ...duplicate.mappings[0] });
    expect(() => createTestcaseTemplateInput(analysis(), duplicate)).toThrow(
      /DUPLICATE_CANDIDATE_MAPPING/,
    );
  });

  it("requires additional type for explicit out-of-spec candidates", () => {
    const value = mapping("(out-of-spec)");
    expect(() => createTestcaseTemplateInput(analysis(), value)).toThrow(
      /OUT_OF_SPEC_TYPE_REQUIRED/,
    );
    value.mappings[0].type = "additional";
    expect(createTestcaseTemplateInput(analysis(), value)).toMatchObject({
      sections: [{ kind: "ui" }, { kind: "function" }],
    });
  });

  it("blocks unresolved expected results", () => {
    const value = mapping();
    value.mappings[0].expected = "TBD";
    expect(() => createTestcaseTemplateInput(analysis(), value)).toThrow(
      /UNRESOLVED_EXPECTED/,
    );
  });
});
