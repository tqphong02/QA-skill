// Conservative change-impact planner for repository business discovery.
// It reduces work for test-only, UI-only, API-only, database-only and RBAC-only
// changes while escalating ambiguous or documentation changes to a full scan.

const SOURCE_EXTENSIONS = new Set([
  '.cjs', '.cs', '.dart', '.gql', '.go', '.graphql', '.java', '.js', '.jsx',
  '.json', '.kts', '.kt', '.mjs', '.md', '.mdx', '.php', '.prisma', '.proto',
  '.py', '.rb', '.rs', '.sql', '.ts', '.tsx', '.toml', '.xml', '.yaml', '.yml',
]);

const CODE_EXTENSIONS = new Set([
  '.cjs', '.cs', '.dart', '.go', '.java', '.js', '.jsx', '.kts', '.kt', '.mjs',
  '.php', '.py', '.rb', '.rs', '.ts', '.tsx',
]);

const IGNORED_PATH = /(^|\/)(\.git|node_modules|dist|build|coverage|\.next|\.nuxt|\.cache|qa-knowledge|evidence)(\/|$)/i;
const TEST_PATH = /(^|\/)(__tests__|tests?|spec|fixtures?|mocks?)(\/|$)|\.(?:test|spec|snap)\.[^.]+$/i;
const DOCUMENTATION_PATH = /(^|\/)(docs?|documentation|requirements?|specifications?|brd|srs|frs)(\/|$)|\.(?:md|mdx)$/i;
const CONFIG_PATH = /(^|\/)(package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig(?:\.[^.]+)?\.json|jsconfig\.json|nx\.json|turbo\.json|Dockerfile|docker-compose[^/]*|\.github\/|\.gitlab-ci\.yml|\.env\.example)$/i;
const API_PATH = /(^|\/)(api|apis|routes?|controllers?|handlers?|resolvers?|graphql|openapi|swagger|endpoints?|dtos?)(\/|$)|\.(?:graphql|gql|proto)$/i;
const DATABASE_PATH = /(^|\/)(db|database|databases|migrations?|entities?|models?|repositories?|orm)(\/|$)|\.(?:sql|prisma)$/i;
const PERMISSION_PATH = /(^|\/)(auth|authentication|authorization|guards?|permissions?|roles?|rbac|acl|polic(?:y|ies)|security)(\/|$)/i;
const STATE_PATH = /(^|\/)(state|states|status|statuses|workflow|workflows|machines?|transitions?)(\/|$)/i;
const UI_PATH = /(^|\/)(components?|pages?|screens?|views?|ui|frontend|client)(\/|$)|\.(?:tsx|jsx|vue|svelte)$/i;
const RULE_PATH = /(^|\/)(domain|rules?|validation|services?|use-cases?|polic(?:y|ies))(\/|$)/i;
const API_FILE = /\.(?:api|controller|dto|handler|resolver|route|routes|schema)\.[^.]+$/i;
const DATABASE_FILE = /\.(?:entity|migration|model|orm|repo|repository|schema)\.[^.]+$/i;
const PERMISSION_FILE = /\.(?:acl|auth|guard|permission|policy|role|security)\.[^.]+$/i;
const STATE_FILE = /\.(?:machine|state|status|transition|workflow)\.[^.]+$/i;
const UI_FILE = /\.(?:component|page|screen|view)\.[^.]+$/i;
const RULE_FILE = /\.(?:domain|rule|service|usecase|use-case|validation|validator)\.[^.]+$/i;

export function normalizeChangePath(value) {
  return String(value || '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '');
}

export function classifyChange(value) {
  const file = normalizeChangePath(value);
  if (!file) return { path: file, kind: 'ignored', categories: [] };
  if (IGNORED_PATH.test(file)) return { path: file, kind: 'ignored', categories: [] };
  if (TEST_PATH.test(file)) return { path: file, kind: 'test', categories: ['test'] };

  const extension = file.includes('.') ? `.${file.split('.').pop().toLowerCase()}` : '';
  const sourceLike = SOURCE_EXTENSIONS.has(extension)
    || /(^|\/)(src|app|lib|server|packages|apps)(\/|$)/i.test(file);
  if (!sourceLike) return { path: file, kind: 'metadata', categories: ['metadata'] };

  const categories = [];
  if (DOCUMENTATION_PATH.test(file)) categories.push('documentation');
  if (CONFIG_PATH.test(file)) categories.push('config');
  if (API_PATH.test(file) || API_FILE.test(file)) categories.push('api');
  if (DATABASE_PATH.test(file) || DATABASE_FILE.test(file)) categories.push('database');
  if (PERMISSION_PATH.test(file) || PERMISSION_FILE.test(file)) categories.push('permission');
  if (STATE_PATH.test(file) || STATE_FILE.test(file)) categories.push('state');
  if (UI_PATH.test(file) || UI_FILE.test(file)) categories.push('ui');
  if (RULE_PATH.test(file) || RULE_FILE.test(file)) categories.push('rules');
  if (CODE_EXTENSIONS.has(extension) && categories.length === 0) categories.push('broad');

  return {
    path: file,
    kind: 'business-source',
    categories: [...new Set(categories)],
  };
}

function taskMap(value) {
  return {
    'repo-fingerprint.mjs': Boolean(value.repoFingerprint),
    'source-indexer.mjs': Boolean(value.sourceIndexer),
    'graphify-adapter.mjs': Boolean(value.graphify),
    'architecture-discovery.mjs': Boolean(value.architecture),
    'api-contract-extractor.mjs': Boolean(value.apiContracts),
    'business-rule-extractor.mjs': Boolean(value.businessRules),
    'business-flow-builder.mjs': Boolean(value.businessFlows),
    'state-machine-extractor.mjs': Boolean(value.stateMachines),
    'permission-matrix-extractor.mjs': Boolean(value.permissionMatrix),
    'database-domain-extractor.mjs': Boolean(value.domainModel),
  };
}

export function buildFullImpactPlan(reason = 'full discovery requested') {
  return {
    mode: 'full',
    reason,
    changed_files: [],
    ignored_files: [],
    test_files: [],
    business_files: [],
    categories: ['full'],
    phase1: taskMap({
      repoFingerprint: true,
      sourceIndexer: true,
      graphify: true,
      architecture: true,
      apiContracts: true,
      businessRules: true,
    }),
    phase2: taskMap({
      businessFlows: true,
      stateMachines: true,
      permissionMatrix: true,
      domainModel: true,
    }),
    refresh_derived: true,
  };
}

export function buildIncrementalImpactPlan(values = {}, { hasBaseline = true } = {}) {
  const rawFiles = Array.isArray(values) ? values : values.changedFiles;
  const changedFiles = [...new Set((rawFiles || []).map(normalizeChangePath).filter(Boolean))].sort();
  if (!hasBaseline) return buildFullImpactPlan('incremental baseline is missing or not trustworthy');

  const classified = changedFiles.map(classifyChange);
  const ignored = classified.filter(item => item.kind === 'ignored').map(item => item.path);
  const tests = classified.filter(item => item.kind === 'test').map(item => item.path);
  const business = classified.filter(item => item.kind === 'business-source');
  const metadata = classified.filter(item => item.kind === 'metadata').map(item => item.path);

  if (!business.length) {
    return {
      mode: 'metadata-only',
      reason: tests.length ? 'test-only or metadata-only change' : 'no business-source change detected',
      changed_files: changedFiles,
      ignored_files: [...ignored, ...metadata],
      test_files: tests,
      business_files: [],
      categories: tests.length ? ['test'] : ['metadata'],
      phase1: taskMap({ repoFingerprint: changedFiles.length > 0 }),
      phase2: taskMap({}),
      refresh_derived: false,
    };
  }

  const categories = new Set(business.flatMap(item => item.categories));
  const broad = categories.has('broad') || categories.has('documentation') || categories.has('config');
  const codeChanged = business.some(item => CODE_EXTENSIONS.has(`.${item.path.split('.').pop().toLowerCase()}`));
  const uiOnly = codeChanged
    && !broad
    && categories.has('ui')
    && !['api', 'database', 'permission', 'state', 'rules'].some(category => categories.has(category));

  const plan = {
    mode: 'incremental',
    reason: broad
      ? 'ambiguous, documentation or configuration change escalated to full scanner set'
      : `impact categories: ${[...categories].sort().join(', ')}`,
    changed_files: changedFiles,
    ignored_files: [...ignored, ...metadata],
    test_files: tests,
    business_files: business.map(item => item.path),
    categories: [...categories].sort(),
    phase1: taskMap({
      repoFingerprint: true,
      sourceIndexer: codeChanged,
      graphify: codeChanged,
      architecture: codeChanged || categories.has('config'),
      apiContracts: broad || categories.has('api') || (!uiOnly && categories.has('rules')),
      businessRules: broad || codeChanged || categories.has('rules'),
    }),
    phase2: taskMap({
      businessFlows: broad || codeChanged,
      stateMachines: broad || codeChanged || categories.has('state'),
      permissionMatrix: broad || categories.has('permission') || categories.has('api'),
      domainModel: broad || categories.has('database'),
    }),
    refresh_derived: true,
  };

  return plan;
}

export function planTaskNames(plan, phase) {
  return Object.entries(plan?.[phase] || {})
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
}
