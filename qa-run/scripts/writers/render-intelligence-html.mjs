#!/usr/bin/env node
/**
 * Render validated QA intelligence into a self-contained interactive HTML file.
 *
 * Visual conventions are adapted from plannotator/effective-html:
 * https://github.com/plannotator/effective-html
 * Audited upstream commit: 63b1bf04d3e48b426a31fdb82b1319c33663fde4
 *
 * This renderer never changes the canonical JSON and never upgrades evidence.
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] || fallback : fallback;
};
const hasFlag = flag => args.includes(flag);

function usage() {
  console.log(`Usage:
  node render-intelligence-html.mjs --input <validated.json> --output <report.html> [--kind auto]
  node render-intelligence-html.mjs --check <report.html>

Supported inputs:
  business-execution-brief  qa-run Business Execution Brief
  graphify-discovery       normalized graphify-adapter artifact
  architecture-map         qa-run static repository architecture map
  business-analysis        business-analysis hidden JSON source
  whitebox-call-graph      whitebox-qa bounded call graph or NestJS graph`);
}

function fail(message, code = 2) {
  console.error(`[intelligence-html] BLOCKED: ${message}`);
  process.exit(code);
}

function checkHtml(filePath) {
  if (!fs.existsSync(filePath)) fail(`HTML file does not exist: ${filePath}`);
  const html = fs.readFileSync(filePath, 'utf8');
  const checks = {
    doctype: /^<!doctype html>/i.test(html),
    selfContained: !/<script[^>]+\bsrc=|<link[^>]+\bhref=/i.test(html),
    darkMode: /localStorage\.getItem\('qa-theme'\)/.test(html) && /html\.dark/.test(html),
    diagramLabel: /<svg[^>]+role="img"[^>]+aria-label=/i.test(html),
    panZoomGroup: /<g id="svg-content"/.test(html),
    dismissibleOverlay: /id="detailClose"/.test(html),
    reducedMotion: /prefers-reduced-motion/.test(html),
    nonEmptyDiagram: Number(
      html.match(/<meta name="qa-diagram-node-count" content="(\d+)">/)?.[1] || 0,
    ) > 0,
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  console.log(JSON.stringify({ file: path.resolve(filePath), checks, status: failed.length ? 'FAILED' : 'PASS' }, null, 2));
  if (failed.length) process.exit(2);
}

if (hasFlag('--help') || hasFlag('-h')) {
  usage();
  process.exit(0);
}
if (getArg('--check')) {
  checkHtml(path.resolve(getArg('--check')));
  process.exit(0);
}

const inputArg = getArg('--input').trim();
const outputArg = getArg('--output').trim();
const kindArg = getArg('--kind', 'auto').toLowerCase();
if (!inputArg) fail('--input is required');
if (!outputArg) fail('--output is required');

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) {
  fail(`input file does not exist: ${inputPath}`);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (error) {
  fail(`input is not valid JSON: ${error.message}`);
}

function detectKind(value) {
  if (kindArg !== 'auto') return kindArg;
  if (value.tool === 'graphify-adapter') return 'graphify-discovery';
  if (value.tool === 'architecture-discovery.mjs' && Array.isArray(value.modules)) {
    return 'architecture-map';
  }
  if (Array.isArray(value.risk_inventory) && value.business_context) {
    return 'business-execution-brief';
  }
  if (Array.isArray(value.modules) && Array.isArray(value.flow_links)) {
    return 'business-analysis';
  }
  if (value.graphVersion === '1.0' && Array.isArray(value.nodes) && Array.isArray(value.edges)) {
    return 'whitebox-call-graph';
  }
  if (value.graphVersion === '1.0' && value.framework === 'nestjs') {
    return 'whitebox-call-graph';
  }
  return 'unsupported';
}

const kind = detectKind(data);
if (![
  'graphify-discovery',
  'architecture-map',
  'business-execution-brief',
  'business-analysis',
  'whitebox-call-graph',
].includes(kind)) {
  fail(`unsupported input schema: ${kind}`);
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function unique(values) {
  const seen = new Set();
  return values.map(clean).filter(Boolean).filter(value => {
    const key = value.toLocaleLowerCase('en-US');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeId(value, index) {
  const id = clean(value).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
  return id || `node-${index + 1}`;
}

function metric(label, value, tone = 'neutral') {
  return { label, value: clean(value), tone };
}

function buildGraphifyModel(value) {
  const nodeMap = new Map((value.nodes || []).map(node => [clean(node.id), node]));
  const edgeNodeIds = unique((value.candidates || []).flatMap(edge => [edge.sourceId, edge.targetId]));
  const preferredNodes = edgeNodeIds
    .map(id => nodeMap.get(id))
    .filter(Boolean);
  const nodePool = [...preferredNodes, ...(value.nodes || [])]
    .filter((node, index, list) => list.findIndex(item => clean(item.id) === clean(node.id)) === index)
    .slice(0, 36);
  const nodes = nodePool.map((node, index) => ({
    id: safeId(node.id, index),
    sourceId: clean(node.id),
    label: clean(node.label),
    meta: [node.fileType, node.community !== null ? `community ${node.community}` : '']
      .filter(Boolean).join(' · '),
    detail: clean(node.source) || 'No source location',
    community: node.community ?? 'unassigned',
    tone: 'dependency',
  }));
  const normalizedBySource = new Map(nodes.map(node => [node.sourceId, node.id]));
  const edges = (value.candidates || [])
    .filter(edge => normalizedBySource.has(clean(edge.sourceId)) && normalizedBySource.has(clean(edge.targetId)))
    .slice(0, 72)
    .map(edge => ({
      source: normalizedBySource.get(clean(edge.sourceId)),
      target: normalizedBySource.get(clean(edge.targetId)),
      label: clean(edge.relation),
      confidence: clean(edge.confidence || 'AMBIGUOUS').toUpperCase(),
      detail: clean(edge.sourceRef),
    }));
  const summary = value.summary || {};
  return {
    title: `Repository intelligence — ${path.basename(value.repository?.path || 'repository')}`,
    subtitle: 'Graphify candidates · static source only · runtime verification still required',
    kind,
    metrics: [
      metric('Nodes', summary.totalNodes ?? nodes.length),
      metric('Edges', summary.totalEdges ?? edges.length),
      metric('Extracted', summary.confidenceCounts?.EXTRACTED ?? 0, 'good'),
      metric('Inferred', summary.confidenceCounts?.INFERRED ?? 0, 'warn'),
      metric('Ambiguous', summary.confidenceCounts?.AMBIGUOUS ?? 0, 'risk'),
    ],
    nodes,
    edges,
    sections: [
      {
        title: 'Provenance boundary',
        items: [
          'EXTRACTED means an explicit static relationship, not runtime proof',
          'INFERRED and AMBIGUOUS relationships remain review candidates',
          `Repository commit: ${value.repository?.commit || 'unknown'}`,
          `Graph commit: ${value.graphBuiltAtCommit || 'unknown'}`,
        ],
      },
      {
        title: 'Top dependency candidates',
        items: (value.candidates || []).slice(0, 16).map(edge => (
          `[${edge.confidence}] ${edge.source} --${edge.relation}--> ${edge.target}`
        )),
      },
    ],
  };
}

function buildBriefModel(value) {
  const context = value.business_context || {};
  const flow = unique(context.happy_flow || []);
  const nodes = flow.slice(0, 32).map((step, index) => ({
    id: `flow-${index + 1}`,
    sourceId: `flow-${index + 1}`,
    label: step,
    meta: `Step ${index + 1}`,
    detail: unique([
      ...(context.routes || []),
      ...(context.roles || []),
    ]).slice(0, 4).join(' · '),
    community: 'flow',
    tone: index === 0 ? 'entry' : index === flow.length - 1 ? 'outcome' : 'flow',
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    source: nodes[index].id,
    target: node.id,
    label: 'next',
    confidence: 'EXTRACTED',
    detail: '',
  }));
  return {
    title: `Business Execution Brief — ${value.scope || 'scope'}`,
    subtitle: `${value.intent || 'QA'} · ${value.knowledge_health?.confidence || 'unknown confidence'}`,
    kind,
    metrics: [
      metric('Status', value.status || 'unknown', value.status === 'READY' ? 'good' : 'risk'),
      metric('Sources', value.knowledge_health?.source_count ?? 0),
      metric('Risks', value.risk_inventory?.length ?? 0, 'warn'),
      metric('Charters', value.exploratory_charters?.length ?? 0),
      metric('Unresolved', value.knowledge_health?.unresolved_count ?? 0, 'risk'),
    ],
    nodes,
    edges,
    sections: [
      {
        title: 'Ranked risks',
        items: (value.risk_inventory || []).map(risk => (
          `${risk.risk_id} [${risk.priority}] ${risk.category}: ${risk.hypothesis}`
        )),
      },
      {
        title: 'Exploratory charters',
        items: (value.exploratory_charters || []).map(charter => (
          `${charter.charter_id} [${charter.priority}] ${charter.mission}`
        )),
      },
      {
        title: 'Execution contract',
        items: [
          `Target: ${value.execution_contract?.target || 'unresolved'}`,
          `Role/Data: ${value.execution_contract?.role_data || 'unresolved'}`,
          `Expected: ${(value.execution_contract?.expected || []).join(' | ') || 'unresolved'}`,
          `Stop: ${value.execution_contract?.stop_condition || 'unresolved'}`,
        ],
      },
    ],
  };
}

function buildArchitectureModel(value) {
  const nodes = [];
  const edges = [];
  const nodeIds = new Map();

  function addNode(sourceId, label, meta, detail, community, tone) {
    const key = clean(sourceId);
    if (nodeIds.has(key)) return nodeIds.get(key);
    const id = safeId(key, nodes.length);
    nodeIds.set(key, id);
    nodes.push({
      id,
      sourceId: key,
      label: clean(label),
      meta: clean(meta),
      detail: clean(detail),
      community: clean(community || 'architecture'),
      tone,
    });
    return id;
  }

  for (const module of value.modules || []) {
    const moduleName = clean(module.name || `module-${nodes.length + 1}`);
    const moduleId = addNode(
      `module:${moduleName}`,
      moduleName,
      'module',
      `Static architecture module from ${value.repoPath || 'repository'}`,
      moduleName,
      'entry',
    );
    const groups = [
      ['controller', module.controllers],
      ['service', module.services],
      ['repository', module.repositories],
      ['gateway', module.gateways],
      ['guard', module.guards],
      ['middleware', module.middlewares],
      ['dto', module.dtos],
      ['entity', module.entities],
      ['file', module.otherFiles],
    ];
    for (const [kindName, items] of groups) {
      for (const item of items || []) {
        const file = clean(item.file || item.filePath || item.name);
        if (!file) continue;
        const itemId = addNode(
          `${kindName}:${file}`,
          path.basename(file),
          kindName,
          file,
          moduleName,
          kindName === 'controller' ? 'flow' : 'dependency',
        );
        edges.push({
          source: moduleId,
          target: itemId,
          label: `contains ${kindName}`,
          confidence: 'EXTRACTED',
          detail: file,
        });
      }
    }
    for (const integration of module.integrations || []) {
      const integrationName = clean(integration);
      if (!integrationName) continue;
      const integrationId = addNode(
        `integration:${integrationName}`,
        integrationName,
        'integration candidate',
        'Detected from static source patterns; runtime usage is not proven',
        'integrations',
        'dependency',
      );
      edges.push({
        source: moduleId,
        target: integrationId,
        label: 'may integrate',
        confidence: 'INFERRED',
        detail: 'Static architecture inference',
      });
    }
  }

  return {
    title: `Repository architecture — ${path.basename(value.repoPath || 'repository')}`,
    subtitle: 'Canonical QA-skill fallback · static source-derived architecture · runtime verification required',
    kind,
    metrics: [
      metric('Modules', value.totalModules ?? value.modules?.length ?? 0),
      metric('Files', value.totalFiles ?? 0),
      metric('Components', nodes.filter(node => node.meta !== 'module' && node.meta !== 'integration candidate').length),
      metric('Integrations', unique(value.globalIntegrations || []).length, 'warn'),
    ],
    nodes,
    edges,
    sections: [
      {
        title: 'Modules',
        items: (value.modules || []).map(module => (
          `${module.name}: ${(module.integrations || []).join(', ') || 'no integration candidate'}`
        )),
      },
      {
        title: 'Evidence boundary',
        items: [
          'Component membership is extracted from static repository structure',
          'Integration edges are inferred candidates',
          'This diagram is not runtime evidence or measured coverage',
        ],
      },
    ],
  };
}

function buildBusinessAnalysisModel(value) {
  const flowNodes = [];
  for (const module of value.modules || []) {
    for (const flow of module.flows || []) {
      flowNodes.push({
        id: safeId(flow.id, flowNodes.length),
        sourceId: clean(flow.id),
        label: clean(flow.name || flow.id),
        meta: clean(module.name),
        detail: [
          flow.actor ? `Actor: ${flow.actor}` : '',
          flow.entry_state ? `Entry: ${flow.entry_state}` : '',
          flow.exit_state ? `Exit: ${flow.exit_state}` : '',
          flow.status ? `Status: ${flow.status}` : '',
        ].filter(Boolean).join(' · '),
        community: clean(module.name || 'module'),
        tone: flow.status === 'verified' ? 'outcome' : 'flow',
      });
    }
  }
  const idMap = new Map(flowNodes.map(node => [node.sourceId, node.id]));
  const edges = (value.flow_links || [])
    .filter(link => idMap.has(clean(link.from_flow)) && idMap.has(clean(link.to_flow)))
    .map(link => ({
      source: idMap.get(clean(link.from_flow)),
      target: idMap.get(clean(link.to_flow)),
      label: clean(link.label || link.condition || 'continues'),
      confidence: 'EXTRACTED',
      detail: clean(link.data_handoff || link.condition),
    }));
  const questions = value.questions || [];
  return {
    title: `${value.project || 'Project'} — Business flow`,
    subtitle: `${value.scope || 'Scope'} · companion view derived from validated analysis JSON`,
    kind,
    metrics: [
      metric('Modules', value.modules?.length ?? 0),
      metric('Flows', flowNodes.length),
      metric('Links', edges.length),
      metric('Open Q&A', questions.filter(question => question.status === 'Open').length, 'warn'),
      metric('Blocked areas', (value.review_coverage || []).filter(area => area.status === 'blocked').length, 'risk'),
    ],
    nodes: flowNodes.slice(0, 80),
    edges: edges.slice(0, 160),
    sections: [
      {
        title: 'Business modules',
        items: (value.modules || []).map(module => (
          `${module.name}: ${module.purpose || 'No purpose supplied'}`
        )),
      },
      {
        title: 'Clarification priorities',
        items: questions
          .filter(question => question.status === 'Open')
          .slice(0, 20)
          .map(question => `${question.id} [${question.priority}] ${question.question}`),
      },
      {
        title: 'Review coverage',
        items: (value.review_coverage || []).map(area => `${area.area}: ${area.status}`),
      },
    ],
  };
}

function buildWhiteboxModel(value) {
  if (value.framework === 'nestjs') {
    const nodes = (value.components || []).map((component, index) => ({
      id: safeId(component.name, index),
      sourceId: clean(component.name),
      label: clean(component.name),
      meta: clean(component.kind),
      detail: `${clean(component.filePath)}:${component.line ?? ''}`,
      community: clean(component.kind || 'component'),
      tone: component.kind === 'controller' ? 'entry' : component.kind === 'provider' ? 'flow' : 'dependency',
    }));
    const idMap = new Map(nodes.map(node => [node.sourceId, node.id]));
    const edges = (value.injections || [])
      .filter(injection => idMap.has(clean(injection.from)) && idMap.has(clean(injection.to)))
      .map(injection => ({
        source: idMap.get(clean(injection.from)),
        target: idMap.get(clean(injection.to)),
        label: clean(injection.parameter || injection.token || 'injects'),
        confidence: injection.resolved ? 'EXTRACTED' : 'AMBIGUOUS',
        detail: clean(injection.token),
      }));
    return {
      title: 'Whitebox QA — NestJS dependency graph',
      subtitle: 'Static decorators and visible dependency-injection tokens · runtime configuration not proven',
      kind,
      metrics: [
        metric('Components', nodes.length),
        metric('Injections', value.injections?.length ?? 0),
        metric('Routes', value.routes?.length ?? 0),
        metric('Warnings', value.warnings?.length ?? 0, 'warn'),
      ],
      nodes,
      edges,
      sections: [
        {
          title: 'Routes',
          items: (value.routes || []).map(route => (
            `${route.httpMethod} ${route.path} -> ${route.handler}`
          )),
        },
        {
          title: 'Warnings',
          items: value.warnings || [],
        },
      ],
    };
  }

  const nodes = (value.nodes || []).map((node, index) => ({
    id: safeId(node.id, index),
    sourceId: clean(node.id),
    label: clean(node.functionName || node.id),
    meta: `${clean(node.className || value.language)} · depth ${node.depth ?? 0}`,
    detail: `${clean(node.filePath)}:${node.line ?? ''}`,
    community: `depth-${node.depth ?? 0}`,
    tone: node.depth === 0 ? 'entry' : 'flow',
  }));
  const idMap = new Map(nodes.map(node => [node.sourceId, node.id]));
  const edges = (value.edges || [])
    .filter(edge => idMap.has(clean(edge.from)) && idMap.has(clean(edge.to)))
    .map(edge => ({
      source: idMap.get(clean(edge.from)),
      target: idMap.get(clean(edge.to)),
      label: clean(edge.call),
      confidence: edge.resolution === 'resolved' ? 'EXTRACTED' : 'AMBIGUOUS',
      detail: `line ${edge.line ?? ''} · ${edge.resolution}`,
    }));
  return {
    title: `Whitebox QA — ${value.entrypoint || 'bounded call graph'}`,
    subtitle: `${value.language || 'source'} · source-derived-candidate · bounded static traversal`,
    kind,
    metrics: [
      metric('Nodes', nodes.length),
      metric('Edges', value.edges?.length ?? 0),
      metric('Max depth', value.limits?.maxDepth ?? 'unknown'),
      metric('Max nodes', value.limits?.maxNodes ?? 'unknown'),
      metric('Truncated', value.truncated ? 'yes' : 'no', value.truncated ? 'warn' : 'good'),
    ],
    nodes,
    edges,
    sections: [
      {
        title: 'Unresolved calls',
        items: (value.edges || [])
          .filter(edge => edge.resolution !== 'resolved')
          .map(edge => `${edge.call}: ${edge.resolution}`),
      },
      {
        title: 'Evidence boundary',
        items: [
          'This diagram represents bounded static reachability',
          'Resolved calls are not runtime coverage proof',
          'Coverage claims require a matching imported runtime report',
        ],
      },
    ],
  };
}

const model = kind === 'graphify-discovery'
  ? buildGraphifyModel(data)
  : kind === 'architecture-map'
    ? buildArchitectureModel(data)
  : kind === 'business-execution-brief'
    ? buildBriefModel(data)
    : kind === 'business-analysis'
      ? buildBusinessAnalysisModel(data)
      : buildWhiteboxModel(data);

if (!Array.isArray(model.nodes) || model.nodes.length === 0) {
  fail(`input produced an empty semantic diagram for kind ${kind}`);
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function truncate(value, max = 30) {
  const string = clean(value);
  return string.length <= max ? string : `${string.slice(0, max - 1)}…`;
}

function layoutNodes(nodes) {
  const groups = new Map();
  for (const node of nodes) {
    const key = clean(node.community || 'default');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }
  const orderedNodes = [...groups.values()].flat();
  const columnCount = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(orderedNodes.length))));
  const columnWidth = 300;
  const rowHeight = 118;
  return orderedNodes.map((node, index) => ({
    ...node,
    x: 90 + (index % columnCount) * columnWidth,
    y: 90 + Math.floor(index / columnCount) * rowHeight,
  }));
}

const positionedNodes = layoutNodes(model.nodes);
const positionById = new Map(positionedNodes.map(node => [node.id, node]));
const svgWidth = Math.max(
  1200,
  ...positionedNodes.map(node => node.x + 270),
);
const svgHeight = Math.max(
  720,
  ...positionedNodes.map(node => node.y + 110),
);

const edgeSvg = model.edges.map((edge, index) => {
  const source = positionById.get(edge.source);
  const target = positionById.get(edge.target);
  if (!source || !target) return '';
  const x1 = source.x + 230;
  const y1 = source.y + 34;
  const x2 = target.x;
  const y2 = target.y + 34;
  const middle = (x1 + x2) / 2;
  const confidence = ['EXTRACTED', 'INFERRED', 'AMBIGUOUS'].includes(edge.confidence)
    ? edge.confidence.toLowerCase()
    : 'ambiguous';
  return `<g class="edge-wrap ${confidence}" data-confidence="${confidence}">
    <path class="edge" d="M${x1},${y1} C${middle},${y1} ${middle},${y2} ${x2},${y2}" marker-end="url(#arrow)"/>
    <text class="edge-label" x="${middle}" y="${Math.min(y1, y2) - 6}" text-anchor="middle">${escapeHtml(truncate(edge.label, 22))}</text>
  </g>`;
}).join('\n');

const nodeSvg = positionedNodes.map(node => `<g class="node ${escapeHtml(node.tone)}" tabindex="0" role="button" aria-label="${escapeHtml(node.label)}" data-node-id="${escapeHtml(node.id)}" transform="translate(${node.x} ${node.y})">
  <rect width="230" height="68" rx="12"/>
  <text class="node-label" x="16" y="28">${escapeHtml(truncate(node.label, 30))}</text>
  <text class="node-meta" x="16" y="49">${escapeHtml(truncate(node.meta, 34))}</text>
</g>`).join('\n');

const metricsHtml = model.metrics.map(item => `<div class="metric ${escapeHtml(item.tone)}">
  <span>${escapeHtml(item.label)}</span>
  <strong>${escapeHtml(item.value)}</strong>
</div>`).join('\n');

const sectionsHtml = model.sections.map(section => `<section class="report-section">
  <h2>${escapeHtml(section.title)}</h2>
  <ul>${(section.items || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
</section>`).join('\n');

const scriptModel = JSON.stringify({
  nodes: positionedNodes.map(node => ({
    id: node.id,
    label: node.label,
    meta: node.meta,
    detail: node.detail,
  })),
}).replaceAll('<', '\\u003c');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="QA-skill render-intelligence-html">
<meta name="qa-diagram-node-count" content="${positionedNodes.length}">
<title>${escapeHtml(model.title)}</title>
<script>
  (function () {
    const saved = localStorage.getItem('qa-theme');
    const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  })();
</script>
<style>
  :root {
    --bg:#f7f7f3;--surface:#fff;--surface-2:#eef2f0;--ink:#17211d;--body:#3e4a45;
    --muted:#68766f;--line:#cbd5d0;--accent:#176b5b;--accent-soft:#dff1eb;
    --warn:#a45d08;--warn-soft:#fff0d7;--risk:#a53b3b;--risk-soft:#fde5e5;
    --shadow:0 10px 32px rgba(22,40,32,.12);--sans:system-ui,-apple-system,"Segoe UI",sans-serif;
    --mono:ui-monospace,"SFMono-Regular",Consolas,monospace;
  }
  html.dark {
    --bg:#111714;--surface:#1a231f;--surface-2:#24302b;--ink:#edf5f1;--body:#c6d1cc;
    --muted:#91a39a;--line:#38483f;--accent:#67c9b5;--accent-soft:#183d35;
    --warn:#f0b55c;--warn-soft:#493516;--risk:#f18b8b;--risk-soft:#482326;
    --shadow:0 12px 36px rgba(0,0,0,.35);
  }
  *{box-sizing:border-box}html{color-scheme:light}html.dark{color-scheme:dark}
  body{margin:0;background:var(--bg);color:var(--body);font-family:var(--sans);line-height:1.5}
  button{font:inherit}.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:16px;
    padding:14px 20px;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(12px);
    border-bottom:1px solid var(--line)}
  .title{min-width:0}.title h1{margin:0;color:var(--ink);font-size:clamp(18px,2vw,26px);line-height:1.2}
  .title p{margin:3px 0 0;color:var(--muted);font-family:var(--mono);font-size:11px}
  .spacer{flex:1}.controls{display:flex;gap:8px;flex-wrap:wrap}
  .control{border:1px solid var(--line);background:var(--surface);color:var(--body);border-radius:8px;
    min-width:38px;min-height:38px;padding:7px 10px;cursor:pointer}
  .control:hover,.control:focus-visible{border-color:var(--accent);outline:2px solid transparent}
  main{max-width:1800px;margin:auto;padding:18px}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px}
  .metric{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
  .metric span{display:block;color:var(--muted);font:11px var(--mono);text-transform:uppercase;letter-spacing:.07em}
  .metric strong{display:block;color:var(--ink);font-size:22px;margin-top:3px}.metric.warn{background:var(--warn-soft)}
  .metric.risk{background:var(--risk-soft)}.metric.good{background:var(--accent-soft)}
  .stage{height:min(72vh,820px);min-height:520px;position:relative;overflow:hidden;background:var(--surface);
    border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow)}
  .stage svg{width:100%;height:100%;display:block;cursor:grab}.stage svg.dragging{cursor:grabbing}
  .edge{fill:none;stroke:var(--muted);stroke-width:1.6}.edge-label{fill:var(--muted);font:10px var(--mono)}
  .edge-wrap.inferred .edge{stroke-dasharray:7 5;stroke:var(--warn)}
  .edge-wrap.ambiguous .edge{stroke-dasharray:2 5;stroke:var(--risk)}
  .node{cursor:pointer}.node rect{fill:var(--surface);stroke:var(--line);stroke-width:1.5}
  .node:hover rect,.node:focus-visible rect{stroke:var(--accent);stroke-width:2.5}
  .node.entry rect,.node.outcome rect{fill:var(--accent-soft);stroke:var(--accent)}
  .node-label{fill:var(--ink);font:600 14px var(--sans)}.node-meta{fill:var(--muted);font:10px var(--mono)}
  .zoom-status{position:absolute;left:12px;bottom:12px;background:var(--surface);border:1px solid var(--line);
    border-radius:8px;padding:6px 9px;font:11px var(--mono)}
  .detail{position:absolute;right:12px;bottom:12px;width:min(380px,calc(100% - 24px));background:var(--surface);
    border:1px solid var(--line);border-radius:12px;padding:16px;box-shadow:var(--shadow)}
  .detail[hidden]{display:none}.detail h2{margin:0 34px 5px 0;color:var(--ink);font-size:18px}
  .detail .meta{font:11px var(--mono);color:var(--accent)}.detail p{margin:10px 0 0}
  .close{position:absolute;right:10px;top:9px;border:0;background:transparent;color:var(--muted);
    font-size:22px;cursor:pointer;min-width:34px;min-height:34px}
  .report-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:16px}
  .report-section{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0}
  .report-section h2{margin:0 0 10px;color:var(--ink);font-size:16px}.report-section ul{margin:0;padding-left:20px}
  .report-section li{margin:7px 0;overflow-wrap:anywhere}
  .legend{position:absolute;left:12px;top:12px;display:flex;gap:8px;flex-wrap:wrap;background:var(--surface);
    border:1px solid var(--line);border-radius:9px;padding:7px 9px;font:10px var(--mono)}
  .legend span::before{content:"";display:inline-block;width:18px;border-top:2px solid var(--muted);margin-right:5px;vertical-align:middle}
  .legend .inferred::before{border-top-style:dashed;border-color:var(--warn)}
  .legend .ambiguous::before{border-top-style:dotted;border-color:var(--risk)}
  @media(max-width:760px){main{padding:10px}.topbar{align-items:flex-start;flex-wrap:wrap}.stage{min-height:440px}.legend{max-width:210px}}
  @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
</style>
</head>
<body>
<header class="topbar">
  <div class="title"><h1>${escapeHtml(model.title)}</h1><p>${escapeHtml(model.subtitle)}</p></div>
  <div class="spacer"></div>
  <div class="controls" aria-label="Diagram controls">
    <button class="control" id="zoomOut" type="button" aria-label="Zoom out">−</button>
    <button class="control" id="resetZoom" type="button">100%</button>
    <button class="control" id="zoomIn" type="button" aria-label="Zoom in">+</button>
    <button class="control" id="themeToggle" type="button">Theme</button>
  </div>
</header>
<main>
  <section class="metrics" aria-label="Summary metrics">${metricsHtml}</section>
  <section class="stage" id="stage" aria-label="Interactive relationship diagram">
    <svg id="diagram" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="${escapeHtml(model.title)} relationship diagram">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--muted)"/></marker></defs>
      <g id="svg-content">${edgeSvg}${nodeSvg}</g>
    </svg>
    <div class="legend" aria-label="Confidence legend"><span>Extracted</span><span class="inferred">Inferred</span><span class="ambiguous">Ambiguous</span></div>
    <output class="zoom-status" id="zoomStatus" aria-live="polite">100%</output>
    <aside class="detail" id="detail" hidden aria-live="polite">
      <button class="close" id="detailClose" type="button" aria-label="Close detail">×</button>
      <h2 id="detailTitle"></h2><div class="meta" id="detailMeta"></div><p id="detailText"></p>
    </aside>
  </section>
  <div class="report-grid">${sectionsHtml}</div>
</main>
<script>
  const MODEL=${scriptModel};
  const nodeById=new Map(MODEL.nodes.map(node=>[node.id,node]));
  const svg=document.getElementById('diagram');
  const content=document.getElementById('svg-content');
  const zoomStatus=document.getElementById('zoomStatus');
  let scale=1,tx=0,ty=0,dragging=false,startX=0,startY=0,moved=false;
  const applyTransform=()=>{content.setAttribute('transform','translate('+tx+' '+ty+') scale('+scale+')');zoomStatus.value=Math.round(scale*100)+'%';zoomStatus.textContent=zoomStatus.value};
  const clampScale=value=>Math.min(3,Math.max(.35,value));
  function zoomAt(next,cx,cy){const old=scale;scale=clampScale(next);const ratio=scale/old;tx=cx-(cx-tx)*ratio;ty=cy-(cy-ty)*ratio;applyTransform()}
  svg.addEventListener('wheel',event=>{event.preventDefault();const rect=svg.getBoundingClientRect();zoomAt(scale*(event.deltaY<0?1.12:.89),event.clientX-rect.left,event.clientY-rect.top)},{passive:false});
  svg.addEventListener('pointerdown',event=>{dragging=true;moved=false;startX=event.clientX;startY=event.clientY;svg.setPointerCapture(event.pointerId);svg.classList.add('dragging')});
  svg.addEventListener('pointermove',event=>{if(!dragging)return;const dx=event.clientX-startX,dy=event.clientY-startY;if(Math.hypot(dx,dy)>5)moved=true;tx+=dx;ty+=dy;startX=event.clientX;startY=event.clientY;applyTransform()});
  svg.addEventListener('pointerup',()=>{dragging=false;svg.classList.remove('dragging')});
  document.getElementById('zoomIn').addEventListener('click',()=>zoomAt(scale*1.2,svg.clientWidth/2,svg.clientHeight/2));
  document.getElementById('zoomOut').addEventListener('click',()=>zoomAt(scale/1.2,svg.clientWidth/2,svg.clientHeight/2));
  document.getElementById('resetZoom').addEventListener('click',()=>{scale=1;tx=0;ty=0;applyTransform()});
  const detail=document.getElementById('detail');
  function showDetail(id){if(moved)return;const node=nodeById.get(id);if(!node)return;document.getElementById('detailTitle').textContent=node.label;document.getElementById('detailMeta').textContent=node.meta;document.getElementById('detailText').textContent=node.detail||'No additional detail';detail.hidden=false}
  document.querySelectorAll('.node').forEach(element=>{element.addEventListener('click',()=>showDetail(element.dataset.nodeId));element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();showDetail(element.dataset.nodeId)}})});
  document.getElementById('detailClose').addEventListener('click',()=>{detail.hidden=true});
  document.getElementById('themeToggle').addEventListener('click',()=>{const dark=!document.documentElement.classList.contains('dark');document.documentElement.classList.toggle('dark',dark);localStorage.setItem('qa-theme',dark?'dark':'light')});
  applyTransform();
</script>
</body>
</html>`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
fs.writeFileSync(temporaryPath, html, 'utf8');
fs.renameSync(temporaryPath, outputPath);
checkHtml(outputPath);
console.log(`[intelligence-html] generated ${outputPath}`);
