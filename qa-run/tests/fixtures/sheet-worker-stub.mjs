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
const evidenceDir = path.join(path.dirname(resultPath), `worker-${assignment.id}-evidence`);
fs.mkdirSync(evidenceDir, { recursive: true });

const results = assignment.testcases.map((testcase) => {
  const evidencePath = path.join(evidenceDir, `row-${testcase.row_number}.json`);
  fs.writeFileSync(
    evidencePath,
    JSON.stringify({ row_number: testcase.row_number, observed: 'stub-pass' }, null, 2),
    'utf8',
  );
  return {
    row_number: testcase.row_number,
    testcase_id: testcase.testcase_id,
    result: 'Pass',
    priority: ['Critical', 'High', 'Medium', 'Low'].includes(testcase.priority)
      ? testcase.priority
      : 'Medium',
    evidence: evidencePath,
  };
});

fs.writeFileSync(
  resultPath,
  JSON.stringify({ worker_id: assignment.id, results }, null, 2),
  'utf8',
);
console.log(`Completed ${results.length} testcase(s)`);
