import fs from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import { allure } from 'allure-playwright';

export const CANONICAL_ALLURE_PARAMETERS = [
  'account',
  'url',
  'evidence_image',
  'evidence_video',
] as const;

export const CANONICAL_ALLURE_ATTACHMENTS = {
  image: 'evidence-image',
  video: 'evidence-video',
} as const;

export type CanonicalAllureRuntime = Readonly<{
  accountSlot?: string | null;
  role?: string;
  testcaseId?: string;
  mutates?: boolean;
  parallelIndex?: number;
}>;

export type CanonicalAllureValues = Readonly<{
  account: string;
  url: string;
  evidenceImage: string;
  evidenceVideo: string;
  testcaseId?: string;
  runId?: string;
  role?: string;
  browser?: string;
  appBuild?: string;
}>;

function nonEmpty(value: unknown, fallback = 'N/A'): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function baseUrl(testInfo: TestInfo): string {
  const configured = testInfo.project.use?.baseURL;
  return nonEmpty(configured, 'N/A');
}

export function canonicalAccountLabel(runtime: CanonicalAllureRuntime): string {
  // Account values are stable slot/role labels only; credentials never enter Allure.
  const candidate = nonEmpty(runtime.accountSlot, nonEmpty(runtime.role, 'default-account'));
  if (/[\s@]/.test(candidate) || /(password|passwd|token|secret|authorization|bearer|api[_-]?key|cookie)/i.test(candidate)) {
    return `account-slot-${Number.isInteger(runtime.parallelIndex) ? runtime.parallelIndex : 'default'}`;
  }
  return candidate;
}

export async function addCanonicalAllureParameters(
  values: CanonicalAllureValues,
): Promise<void> {
  const parameters: Array<[string, string]> = [
    ['account', nonEmpty(values.account)],
    ['url', nonEmpty(values.url)],
    ['evidence_image', nonEmpty(values.evidenceImage)],
    ['evidence_video', nonEmpty(values.evidenceVideo)],
  ];
  const optional: Array<[string, string | undefined]> = [
    ['testcase_id', values.testcaseId],
    ['run_id', values.runId],
    ['role', values.role],
    ['browser', values.browser],
    ['app_build', values.appBuild],
  ];
  for (const [name, value] of optional) {
    if (value !== undefined) parameters.push([name, nonEmpty(value)]);
  }
  for (const [name, value] of parameters) {
    await allure.parameter(name, value);
  }
}

function outputPath(testInfo: TestInfo, name: string): string {
  return testInfo.outputPath(name);
}

async function attachImage(page: Page, testInfo: TestInfo): Promise<string> {
  const imagePath = outputPath(testInfo, 'evidence-image.png');
  await page.screenshot({ path: imagePath, fullPage: true });
  await testInfo.attach(CANONICAL_ALLURE_ATTACHMENTS.image, {
    path: imagePath,
    contentType: 'image/png',
  });
  return CANONICAL_ALLURE_ATTACHMENTS.image;
}

async function attachVideo(page: Page, testInfo: TestInfo): Promise<string> {
  const recording = page.video();
  if (!recording) return 'N/A';
  // Playwright exposes the recording path after the page closes. The context
  // fixture will close it later as well, so this is safe for generated tests.
  await page.close().catch(() => undefined);
  const videoPath = await recording.path().catch(() => '');
  if (!videoPath || !fs.existsSync(videoPath)) return 'N/A';
  await testInfo.attach(CANONICAL_ALLURE_ATTACHMENTS.video, {
    path: videoPath,
    contentType: 'video/webm',
  });
  return CANONICAL_ALLURE_ATTACHMENTS.video;
}

export async function captureCanonicalUiEvidence({
  page,
  runtime,
  testInfo,
}: {
  page: Page;
  runtime: CanonicalAllureRuntime;
  testInfo: TestInfo;
}): Promise<void> {
  const url = (() => {
    try {
      return nonEmpty(page.url(), baseUrl(testInfo));
    } catch {
      return baseUrl(testInfo);
    }
  })();
  let evidenceImage = 'N/A';
  let evidenceVideo = 'N/A';
  try {
    evidenceImage = await attachImage(page, testInfo);
  } catch (error) {
    testInfo.annotations.push({
      type: 'qa-evidence-warning',
      description: `evidence-image unavailable: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  try {
    evidenceVideo = await attachVideo(page, testInfo);
  } catch (error) {
    testInfo.annotations.push({
      type: 'qa-evidence-warning',
      description: `evidence-video unavailable: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  await addCanonicalAllureParameters({
    account: canonicalAccountLabel(runtime),
    url,
    evidenceImage,
    evidenceVideo,
    testcaseId: runtime.testcaseId,
    runId: process.env.QA_RUN_ID ?? process.env.RUN_ID ?? 'N/A',
    role: runtime.role,
    browser: testInfo.project.name,
    appBuild: process.env.QA_APP_BUILD ?? process.env.APP_BUILD ?? 'N/A',
  });
  testInfo.annotations.push({
    type: 'qa-allure-contract',
    description: JSON.stringify({
      contract: 'allure-canonical-v1',
      account: canonicalAccountLabel(runtime),
      url,
      evidence_image: evidenceImage,
      evidence_video: evidenceVideo,
    }),
  });
}
