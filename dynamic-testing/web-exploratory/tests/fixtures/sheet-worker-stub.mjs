import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? '' : args[index + 1];
};

const assignmentPath = getArg('--assignment');
const resultPath = getArg('--result');
if (!assignmentPath || !resultPath) {
  console.error('Missing --assignment or --result');
  process.exit(2);
}

const assignment = JSON.parse(fs.readFileSync(assignmentPath, 'utf8'));
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const results = assignment.testcases.map((testcase) => {
  const failed = testcase.row_number === 13;
  if (!testcase.evidence_directory) {
    throw new Error(`Missing evidence_directory for row ${testcase.row_number}`);
  }
  fs.mkdirSync(testcase.evidence_directory, { recursive: true });
  const evidencePath = path.join(
    testcase.evidence_directory,
    `row-${testcase.row_number}-${failed ? 'fail' : 'pass'}.png`,
  );
  fs.writeFileSync(evidencePath, onePixelPng);
  return {
    row_number: testcase.row_number,
    testcase_id: testcase.testcase_id,
    result: failed ? 'Fail' : 'Pass',
    priority: failed
      ? 'High'
      : ['Critical', 'High', 'Medium', 'Low'].includes(testcase.priority)
      ? testcase.priority
      : 'Medium',
    note: failed ? 'Stub observed state did not match expected' : '',
    evidence: evidencePath,
  };
});

fs.writeFileSync(
  resultPath,
  JSON.stringify({ worker_id: assignment.id, results }, null, 2),
  'utf8',
);
console.log(`Completed ${results.length} testcase(s)`);
