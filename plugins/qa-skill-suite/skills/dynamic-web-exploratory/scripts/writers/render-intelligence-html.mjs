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
  business-execution-brief  dynamic-web-exploratory Business Execution Brief
  graphify-discovery       normalized graphify-adapter artifact
  architecture-map         dynamic-web-exploratory static repository architecture map
  static-requirements-analysis        static-requirements-analysis hidden JSON source
  whitebox-call-graph      hybrid-source-coverage bounded call graph or NestJS graph
  qa-skill-catalog         recursive QA-skill catalog with skill branches`);
}

function fail(message, code = 2) {
  console.error(`[intelligence-html] BLOCKED: ${message}`);
  process.exit(code);
}

function checkHtml(filePath) {
  if (!fs.existsSync(filePath)) fail(`HTML file does not exist: ${filePath}`);
  const html = fs.readFileSync(filePath, 'utf8');
  const fullNodeCount = Number(
    html.match(/<meta name="qa-full-node-count" content="(\d+)">/)?.[1] || 0,
  );
  const fullEdgeCount = Number(
    html.match(/<meta name="qa-full-edge-count" content="(\d+)">/)?.[1] || 0,
  );
  const isSkillCatalog = /<meta name="qa-kind" content="qa-skill-catalog">/.test(html);
  const checks = {
    doctype: /^<!doctype html>/i.test(html),
    selfContained: !/<script[^>]+\bsrc=|<link[^>]+\bhref=/i.test(html),
    darkMode: /localStorage\.getItem\('qa-theme'\)/.test(html) && /html\.dark/.test(html),
    catalogLayout: /<meta name="qa-effective-html-layout" content="catalog-v2">/.test(html),
    trackpadPan: /transform\.x -= event\.deltaX/.test(html) && /event\.ctrlKey \|\| event\.metaKey/.test(html),
    gestureZoom: /gesturestart/.test(html) && /gesturechange/.test(html),
    pointerNodeDetail: /pressedNode/.test(html) && /if \(activateNode\) showDetail/.test(html),
    readableEdgeLabels: /class="edge-label"[^>]+transform=/.test(html) && /class="edge-label"[\s\S]*?<rect/.test(html),
    progressiveEdgeLabels: /\.edge-label\{opacity:0/.test(html) && /\.edge-wrap\.active \.edge-label/.test(html),
    routeNavigation: /data-route-id="all"/.test(html) && /focusNodeRoutes/.test(html) && /id="detailRoutes"/.test(html),
    capabilityDetails: /<h3>Làm được gì<\/h3>/.test(html) && /id="detailCapability"/.test(html) && /renderFlowFacts/.test(html),
    diagramLabel: /<svg[^>]+role="img"[^>]+aria-label=/i.test(html),
    panZoomGroup: /<g id="svg-content"/.test(html),
    dismissibleOverlay: /id="detailClose"/.test(html),
    reducedMotion: /prefers-reduced-motion/.test(html),
    nonEmptyDiagram: Number(
      html.match(/<meta name="qa-diagram-node-count" content="(\d+)">/)?.[1] || 0,
    ) > 0,
    fullProjectIndex: fullNodeCount === 0 || (
      /id="fullSearch"/.test(html)
      && /const FULL_INDEX=/.test(html)
      && fullEdgeCount >= 0
    ),
    skillCatalogDetails: !isSkillCatalog || (
      /id="detailBranches"/.test(html)
      && /id="detailInsights"/.test(html)
      && /id="detailResourceInfo"/.test(html)
      && /Full skill and branch index/.test(html)
    ),
    skillCatalogSourceRedaction: !isSkillCatalog || !/SKILL\.md/i.test(html),
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
  if (value.kind === 'qa-skill-catalog' && Array.isArray(value.skills)) {
    return 'qa-skill-catalog';
  }
  if (Array.isArray(value.risk_inventory) && value.business_context) {
    return 'business-execution-brief';
  }
  if (Array.isArray(value.modules) && Array.isArray(value.flow_links)) {
    return 'static-requirements-analysis';
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
  'static-requirements-analysis',
  'whitebox-call-graph',
  'qa-skill-catalog',
].includes(kind)) {
  fail(`unsupported input schema: ${kind}`);
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function publicCatalogText(value) {
  return clean(value).replace(/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.md\b/gi, 'source document');
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
  const contextNodes = value.contextSlice?.nodes || value.nodes || [];
  const contextCandidates = value.contextSlice?.candidates || value.candidates || [];
  const edgeNodeIds = unique(contextCandidates.flatMap(edge => [edge.sourceId, edge.targetId]));
  const preferredNodes = edgeNodeIds
    .map(id => nodeMap.get(id))
    .filter(Boolean);
  const nodePool = [...preferredNodes, ...contextNodes, ...(value.nodes || [])]
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
  const edges = contextCandidates
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
    fullIndex: {
      nodes: (value.nodes || []).map(node => ({
        id: clean(node.id),
        label: clean(node.label),
        meta: [
          clean(node.fileType),
          node.community !== null ? `community ${node.community}` : '',
          `degree ${node.degree ?? 0}`,
        ].filter(Boolean).join(' · '),
        detail: clean(node.source) || 'No source location',
      })),
      relations: (value.candidates || []).map(edge => ({
        source: clean(edge.source),
        target: clean(edge.target),
        relation: clean(edge.relation),
        confidence: clean(edge.confidence || 'AMBIGUOUS').toUpperCase(),
        sourceRef: clean(edge.sourceRef),
      })),
    },
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
        items: contextCandidates.slice(0, 16).map(edge => (
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
        capability: clean(module.purpose),
        actor: clean(flow.actor),
        entryState: clean(flow.entry_state),
        exitState: clean(flow.exit_state),
        status: clean(flow.status),
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
    .map((link, index) => ({
      id: `edge-${index + 1}`,
      source: idMap.get(clean(link.from_flow)),
      target: idMap.get(clean(link.to_flow)),
      label: clean(link.label || link.condition || 'continues'),
      confidence: 'EXTRACTED',
      detail: clean(link.data_handoff || link.condition),
    }));
  const modules = value.modules || [];
  const primaryNodes = new Set((modules[0]?.flows || []).map(flow => idMap.get(clean(flow.id))).filter(Boolean));
  const primaryEdges = edges.filter(edge => primaryNodes.has(edge.source) && primaryNodes.has(edge.target));
  const primaryIncoming = new Map([...primaryNodes].map(node => [node, 0]));
  const primaryOutgoing = new Map([...primaryNodes].map(node => [node, 0]));
  for (const edge of primaryEdges) {
    primaryIncoming.set(edge.target, (primaryIncoming.get(edge.target) || 0) + 1);
    primaryOutgoing.set(edge.source, (primaryOutgoing.get(edge.source) || 0) + 1);
  }
  const primaryRoots = [...primaryNodes].filter(node => primaryIncoming.get(node) === 0);
  const primarySinks = [...primaryNodes].filter(node => primaryOutgoing.get(node) === 0);
  function primaryPath(start, target) {
    if (!start || !target) return [];
    const queue = [{ node: start, path: [] }];
    const visited = new Set([start]);
    while (queue.length) {
      const current = queue.shift();
      if (current.node === target) return current.path;
      for (const edge of primaryEdges.filter(item => item.source === current.node)) {
        if (visited.has(edge.target)) continue;
        visited.add(edge.target);
        queue.push({ node: edge.target, path: [...current.path, edge] });
      }
    }
    return [];
  }
  const routes = modules.map((module, moduleIndex) => {
    const ownNodes = new Set((module.flows || []).map(flow => idMap.get(clean(flow.id))).filter(Boolean));
    const selectedEdges = new Map();
    const visibleNodes = new Set(ownNodes);
    for (const edge of edges) {
      const internal = ownNodes.has(edge.source) && ownNodes.has(edge.target);
      const bridge = moduleIndex > 0 && (ownNodes.has(edge.source) || ownNodes.has(edge.target));
      if (!internal && !bridge) continue;
      selectedEdges.set(edge.id, edge);
      visibleNodes.add(edge.source);
      visibleNodes.add(edge.target);
    }
    if (moduleIndex > 0) {
      const entryBridges = [...selectedEdges.values()].filter(edge => primaryNodes.has(edge.source) && ownNodes.has(edge.target));
      const exitBridges = [...selectedEdges.values()].filter(edge => ownNodes.has(edge.source) && primaryNodes.has(edge.target));
      for (const bridge of entryBridges) {
        for (const root of primaryRoots) {
          for (const edge of primaryPath(root, bridge.source)) selectedEdges.set(edge.id, edge);
        }
      }
      for (const bridge of exitBridges) {
        for (const sink of primarySinks) {
          for (const edge of primaryPath(bridge.target, sink)) selectedEdges.set(edge.id, edge);
        }
      }
      for (const edge of selectedEdges.values()) {
        visibleNodes.add(edge.source);
        visibleNodes.add(edge.target);
      }
    }
    return {
      id: `route-${moduleIndex + 1}`,
      label: clean(module.name).split('—')[0].trim() || `Module ${moduleIndex + 1}`,
      description: clean(module.purpose),
      nodes: [...visibleNodes],
      edges: [...selectedEdges.keys()],
    };
  });
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
    routes,
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

function buildSkillCatalogModel(value) {
  const groups = new Map((value.groups || []).map(group => [clean(group.id), group]));
  const skills = [...(value.skills || []), ...(value.auxiliary || [])];
  const nodeIds = new Map();
  const nodes = skills.map((skill, index) => {
    const id = safeId(`skill:${skill.name}`, index);
    nodeIds.set(clean(skill.name), id);
    const group = groups.get(clean(skill.group));
    const scope = skill.scope || `auxiliary:${skill.status || 'internal'}`;
    const branchCount = (skill.headings || []).length + (skill.operationalBranches || []).length + (skill.branches || []).length;
    const parentText = skill.parent ? `parent ${skill.parent}` : 'repository root';
    return {
      id,
      sourceId: clean(skill.name),
      label: clean(skill.name),
      meta: [group?.labelVi || skill.group || 'skill', scope, parentText].filter(Boolean).join(' · '),
      detail: [`${branchCount} indexed branch items`, publicCatalogText(skill.description)].filter(Boolean).join(' · '),
      capability: publicCatalogText(skill.vi?.summary || skill.description),
      actor: scope === 'public-root' ? 'Public skill' : scope === 'nested' ? `Nested skill under ${skill.parent}` : scope === 'bundled' ? `Bundled skill under ${skill.parent}` : clean(skill.status || 'auxiliary capability'),
      entryState: skill.parent ? `Entry via ${skill.parent}` : 'Entry at repository router',
      exitState: 'Returns to the configured skill flow',
      status: clean(skill.status || scope),
      scope,
      parent: clean(skill.parent),
      group: clean(skill.group),
      branchItems: [],
      advantages: (skill.vi?.advantages || []).map(publicCatalogText),
      limitations: (skill.vi?.limitations || []).map(publicCatalogText),
      resources: skill.resources || {},
      tone: scope === 'public-root' ? 'entry' : scope === 'nested' ? 'flow' : 'dependency',
    };
  });

  const skillByName = new Map(skills.map(skill => [clean(skill.name), skill]));
  const edgeRecords = [];
  const fullRelations = [];
  const addFullRelation = (source, target, relation, confidence = 'EXTRACTED', sourceRef = '') => {
    fullRelations.push({ source: clean(source), target: clean(target), relation: publicCatalogText(relation), confidence, sourceRef: '' });
  };

  (value.relationships || []).forEach((relation, index) => {
    const source = nodeIds.get(clean(relation.from));
    const target = nodeIds.get(clean(relation.to));
    if (!source || !target) return;
    const label = publicCatalogText(relation.labelVi || relation.label || relation.kind || 'handoff');
    edgeRecords.push({
      id: `relation-${index + 1}`,
      source,
      target,
      sourceName: clean(relation.from),
      targetName: clean(relation.to),
      label,
      flow: clean(relation.flow),
      confidence: 'EXTRACTED',
      detail: '',
    });
    addFullRelation(relation.from, relation.to, label, 'EXTRACTED');
  });

  for (const skill of skills) {
    if (!skill.parent || !nodeIds.has(clean(skill.parent))) continue;
    const parentEdgeId = `parent-${safeId(skill.name, 0)}`;
    edgeRecords.push({
      id: parentEdgeId,
      source: nodeIds.get(clean(skill.parent)),
      target: nodeIds.get(clean(skill.name)),
      sourceName: clean(skill.parent),
      targetName: clean(skill.name),
      label: 'contains nested skill',
      flow: 'skill-tree',
      confidence: 'EXTRACTED',
      detail: '',
    });
    addFullRelation(skill.parent, skill.name, 'contains nested skill', 'EXTRACTED');
  }

  const branchNodes = [];
  let branchIndex = 0;
  for (const skill of skills) {
    const sourceSkill = skillByName.get(clean(skill.name));
    const node = nodes.find(item => item.sourceId === clean(skill.name));
    if (!sourceSkill || !node) continue;
    const branchItems = [
      ...(sourceSkill.headings || []).map((heading, index) => ({
        key: `heading-${index + 1}`,
        kind: 'structure',
        level: heading.level,
        title: publicCatalogText(heading.title),
        summary: `Mục H${heading.level} trong skill ${sourceSkill.name}`,
        children: [],
      })),
      ...(sourceSkill.operationalBranches || []).map(branch => ({
        key: `operation-${branch.id}`,
        kind: 'operational',
        level: 2,
        title: publicCatalogText(branch.titleVi),
        summary: publicCatalogText(branch.summaryVi),
        children: (branch.childrenVi || []).map(publicCatalogText),
      })),
      ...(sourceSkill.headings?.length ? [] : (sourceSkill.branches || [])).map((title, index) => ({
        key: `auxiliary-${index + 1}`,
        kind: 'auxiliary',
        level: 2,
        title: publicCatalogText(title),
        summary: `Capability phụ trợ của ${sourceSkill.name}`,
        children: [],
      })),
    ];
    node.branchItems = branchItems;
    for (const item of branchItems) {
      branchIndex += 1;
      const branchId = safeId(`branch:${sourceSkill.name}:${item.key}`, branchIndex);
      const branchLabel = `${sourceSkill.name} · ${item.title}`;
      branchNodes.push({
        id: branchId,
        sourceId: branchId,
        label: branchLabel,
        meta: `${item.kind} · H${item.level} · ${sourceSkill.name}`,
        detail: [item.summary, ...(item.children || [])].filter(Boolean).join(' · '),
        capability: item.summary,
        actor: sourceSkill.name,
        entryState: `Branch of ${sourceSkill.name}`,
        exitState: `Returns to ${sourceSkill.name} flow`,
        status: item.kind,
        scope: 'branch',
        parent: sourceSkill.name,
        group: sourceSkill.group,
        branchItems: [],
        advantages: [],
        limitations: [],
        resources: {},
        tone: 'flow',
      });
      addFullRelation(sourceSkill.name, branchLabel, item.kind === 'operational' ? 'operational branch' : 'structure branch', 'EXTRACTED');
      for (const [childIndex, child] of (item.children || []).entries()) {
        const childId = safeId(`branch:${sourceSkill.name}:${item.key}:child:${childIndex + 1}`, branchIndex + childIndex + 1);
        const childLabel = `${sourceSkill.name} · ${item.title} · ${child}`;
        branchNodes.push({
          id: childId,
          sourceId: childId,
          label: childLabel,
          meta: `child branch · ${sourceSkill.name}`,
          detail: `Child of ${branchLabel}`,
          capability: `Nhánh con của ${item.title}`,
          actor: sourceSkill.name,
          entryState: branchLabel,
          exitState: `Returns to ${sourceSkill.name} flow`,
          status: 'child',
          scope: 'branch-child',
          parent: branchLabel,
          group: sourceSkill.group,
          branchItems: [],
          advantages: [],
          limitations: [],
          resources: {},
          tone: 'dependency',
        });
        addFullRelation(branchLabel, childLabel, 'contains child branch', 'EXTRACTED');
      }
    }
  }

  const skillRoutes = nodes
    .filter(node => ['public-root', 'nested', 'bundled'].includes(node.scope))
    .map((node, index) => {
      const related = edgeRecords.filter(edge => edge.source === node.id || edge.target === node.id);
      const relatedNodes = new Set([node.id]);
      for (const edge of related) {
        relatedNodes.add(edge.source);
        relatedNodes.add(edge.target);
      }
      return {
        id: `skill-route-${index + 1}`,
        label: node.label,
        description: node.capability,
        nodes: [...relatedNodes],
        edges: related.map(edge => edge.id),
      };
    });
  const workflowRoutes = (value.flows || []).map(flow => {
    const related = edgeRecords.filter(edge => edge.flow === clean(flow.id));
    const relatedNodes = new Set((flow.nodes || []).map(name => nodeIds.get(clean(name))).filter(Boolean));
    for (const edge of related) {
      relatedNodes.add(edge.source);
      relatedNodes.add(edge.target);
    }
    return {
      id: `flow-${clean(flow.id)}`,
      label: clean(flow.labelVi || flow.label || flow.id),
      description: clean(flow.summaryVi || flow.summary),
      nodes: [...relatedNodes],
      edges: related.map(edge => edge.id),
    };
  });

  const fullSkillNodes = nodes.map(node => ({
    label: node.label,
    meta: node.meta,
    detail: node.detail,
  }));
  const fullBranchNodes = branchNodes.map(node => ({
    label: node.label,
    meta: node.meta,
    detail: node.detail,
  }));
  const excluded = value.inventory?.excludedSkillFiles || [];
  const scopeItems = [
    `${value.summary?.publicSkillCount ?? nodes.filter(node => node.scope === 'public-root').length} public-root skill`,
    `${value.summary?.nestedSkillCount ?? nodes.filter(node => node.scope === 'nested').length} nested skill`,
    `${value.summary?.bundledSkillCount ?? nodes.filter(node => node.scope === 'bundled').length} bundled skill`,
    `${value.summary?.auxiliaryCount ?? (value.auxiliary || []).length} auxiliary capability`,
    `${excluded.length} excluded vendor skill surfaces`,
  ];

  return {
    title: 'QA-skill — full skill flow',
    subtitle: 'Recursive in-scope catalog · branch structure and handoff relationships are source-derived; public card details redact source filenames and links',
    kind,
    metrics: [
      metric('In-scope skills', value.summary?.skillCount ?? nodes.length, 'good'),
      metric('Branches', value.summary?.branchCount ?? branchNodes.length, 'warn'),
      metric('Operations', value.summary?.operationalBranchCount ?? 0),
      metric('Handoffs', value.summary?.relationshipCount ?? edgeRecords.length),
      metric('Excluded surfaces', excluded.length, excluded.length ? 'risk' : 'good'),
    ],
    nodes,
    edges: edgeRecords,
    routes: [...workflowRoutes, ...skillRoutes],
    sections: [
      { title: 'Inventory scope', items: scopeItems },
      {
        title: 'Skill tree',
        items: skills.map(skill => `${skill.parent ? `${skill.parent} → ` : ''}${skill.name}`),
      },
      {
        title: 'Branch coverage',
        items: skills.map(skill => `${skill.name}: ${(skill.headings || []).length} H2–H4 · ${(skill.operationalBranches || []).length + (skill.branches || []).length} operational/auxiliary`),
      },
      {
        title: 'Exclusion boundary',
        items: excluded.length
          ? [`${excluded.length} vendor development dependency skill surfaces hidden by scope contract`]
          : ['Không có vendor skill surface bị loại khỏi inventory'],
      },
    ],
    fullIndex: {
      title: 'Full skill and branch index',
      description: 'Search every retained skill, nested branch, child branch and handoff relation. Source filenames and links are intentionally omitted from this public view.',
      nodes: [...fullSkillNodes, ...fullBranchNodes],
      relations: fullRelations,
    },
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
      : kind === 'static-requirements-analysis'
        ? buildBusinessAnalysisModel(data)
        : kind === 'qa-skill-catalog'
          ? buildSkillCatalogModel(data)
        : buildWhiteboxModel(data);

model.edges = (model.edges || []).map((edge, index) => ({
  ...edge,
  id: edge.id || `edge-${index + 1}`,
}));
model.routes = model.routes || [];

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
  const label = truncate(edge.label, 22);
  const labelWidth = Math.max(54, Math.min(150, label.length * 6.2 + 18));
  const labelY = Math.abs(y1 - y2) < 1
    ? y1 - 48
    : (y1 + y2) / 2 + ((index % 5) - 2) * 11;
  const confidence = ['EXTRACTED', 'INFERRED', 'AMBIGUOUS'].includes(edge.confidence)
    ? edge.confidence.toLowerCase()
    : 'ambiguous';
  return `<g class="edge-wrap ${confidence}" data-edge-id="${escapeHtml(edge.id)}" data-source="${escapeHtml(edge.source)}" data-target="${escapeHtml(edge.target)}" data-confidence="${confidence}">
    <path class="edge" d="M${x1},${y1} C${middle},${y1} ${middle},${y2} ${x2},${y2}" marker-end="url(#arrow)"/>
    <g class="edge-label" transform="translate(${middle} ${labelY})">
      <rect x="${-labelWidth / 2}" y="-11" width="${labelWidth}" height="20" rx="6"/>
      <text x="0" y="3" text-anchor="middle">${escapeHtml(label)}</text>
    </g>
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

const routeChipsHtml = model.routes.map(route => (
  `<button class="route-chip" type="button" data-route-id="${escapeHtml(route.id)}" title="${escapeHtml(route.description)}">${escapeHtml(route.label)}</button>`
)).join('');

const sectionsHtml = model.sections.map(section => `<section class="report-section">
  <h2>${escapeHtml(section.title)}</h2>
  <ul>${(section.items || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
</section>`).join('\n');

const fullIndexHtml = model.fullIndex ? `<section class="full-index" aria-labelledby="fullIndexTitle">
  <div class="full-index-heading">
    <div>
      <h2 id="fullIndexTitle">${escapeHtml(model.fullIndex.title || 'Full project index')}</h2>
      <p>${escapeHtml(model.fullIndex.description || 'Search every retained node and relation. The canvas above is only a readable overview.')}</p>
    </div>
    <div class="full-index-counts">${model.fullIndex.nodes.length} nodes · ${model.fullIndex.relations.length} relations</div>
  </div>
  <label for="fullSearch">Search skill, branch, relation or confidence</label>
  <input id="fullSearch" type="search" autocomplete="off" placeholder="Type at least 2 characters">
  <output id="fullIndexStatus" class="full-index-status" aria-live="polite"></output>
  <div id="fullIndexResults" class="full-index-results"></div>
</section>` : '';

const scriptModel = JSON.stringify({
  nodes: positionedNodes.map(node => ({
    id: node.id,
    label: node.label,
    meta: node.meta,
    detail: node.detail,
    capability: node.capability || node.detail,
    actor: node.actor || '',
    entryState: node.entryState || '',
    exitState: node.exitState || '',
    status: node.status || '',
    scope: node.scope || '',
    parent: node.parent || '',
    group: node.group || '',
    branchItems: node.branchItems || [],
    advantages: node.advantages || [],
    limitations: node.limitations || [],
    resources: node.resources || {},
  })),
  edges: model.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
  })),
  routes: model.routes,
}).replaceAll('<', '\\u003c');
const fullIndexModel = JSON.stringify(model.fullIndex || {
  nodes: [],
  relations: [],
}).replaceAll('<', '\\u003c');
const fullIndexMeta = model.fullIndex
  ? `<meta name="qa-full-node-count" content="${model.fullIndex.nodes.length}">
<meta name="qa-full-edge-count" content="${model.fullIndex.relations.length}">`
  : '';

const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="QA-skill render-intelligence-html">
<meta name="qa-effective-html-layout" content="catalog-v2">
<meta name="qa-kind" content="${escapeHtml(kind)}">
<meta name="qa-diagram-node-count" content="${positionedNodes.length}">
${fullIndexMeta}
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
    --bg:#faf9f5;--surface:#fff;--surface-2:#f0eee6;--ink:#141413;--body:#3d3d3a;
    --muted:#77766f;--line:#d1cfc5;--line-soft:#e6e3da;--clay:#d97757;
    --clay-soft:rgba(217,119,87,.11);--olive:#788c5d;--olive-soft:rgba(120,140,93,.13);
    --blue:#5b7e96;--blue-soft:rgba(91,126,150,.12);--gold:#b58b42;--gold-soft:rgba(181,139,66,.12);
    --risk:#a95555;--risk-soft:rgba(169,85,85,.12);--shadow:0 16px 50px rgba(20,20,19,.09);
    --serif:ui-serif,Georgia,"Times New Roman",serif;--sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    --mono:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
  }
  html.dark {
    --bg:#141413;--surface:#1f1f1d;--surface-2:#2a2a28;--ink:#faf9f5;--body:#d1cfc5;
    --muted:#9c9a92;--line:#3d3d3a;--line-soft:#2a2a28;--clay:#e48a6e;
    --clay-soft:rgba(228,138,110,.15);--olive:#9db07c;--olive-soft:rgba(157,176,124,.16);
    --blue:#7fa3bc;--blue-soft:rgba(127,163,188,.16);--gold:#d4b36f;--gold-soft:rgba(212,179,111,.15);
    --risk:#e38d8d;--risk-soft:rgba(227,141,141,.14);--shadow:0 18px 60px rgba(0,0,0,.28);
  }
  *{box-sizing:border-box}html{background:var(--bg);color-scheme:light}html.dark{color-scheme:dark}
  body{margin:0;background:var(--bg);color:var(--body);font-family:var(--sans);-webkit-font-smoothing:antialiased}
  button,input{font:inherit}button{color:inherit}.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:16px;padding:13px 22px;border-bottom:1px solid var(--line-soft);background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(14px)}
  .brand{min-width:220px}.brand h1{margin:0;color:var(--ink);font:500 20px/1.1 var(--serif)}.brand p{margin:4px 0 0;color:var(--muted);font:10px var(--mono);letter-spacing:.08em;text-transform:uppercase}
  .tabs{display:flex;gap:5px}.tab,.theme,.icon-btn,.route-chip{border:1px solid var(--line);background:transparent;border-radius:999px;cursor:pointer}
  .tab{padding:7px 12px;font:11px var(--mono);letter-spacing:.04em}.tab.active{background:var(--ink);border-color:var(--ink);color:var(--bg)}
  .spacer{flex:1}.search-wrap{position:relative;min-width:min(340px,28vw)}.search-wrap input{width:100%;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);padding:9px 12px 9px 34px;outline:none}
  .search-wrap input:focus{border-color:var(--clay);box-shadow:0 0 0 3px var(--clay-soft)}.search-wrap span{position:absolute;left:12px;top:9px;color:var(--muted)}
  .theme,.icon-btn{padding:8px 11px;font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase}.route-chip{padding:6px 10px;color:var(--muted);font:10.5px var(--mono)}.route-chip.active{background:var(--clay-soft);border-color:var(--clay);color:var(--clay)}.page{padding:22px}.view{display:none}.view.active{display:block}
  .intro{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(360px,.7fr);gap:20px;margin-bottom:18px}.intro-copy,.stats-panel,.stage-shell,.report-section,.full-index{background:var(--surface);border:1px solid var(--line-soft);border-radius:15px}
  .intro-copy{padding:24px 26px}.eyebrow{margin:0 0 8px;color:var(--clay);font:10px var(--mono);letter-spacing:.11em;text-transform:uppercase}.intro h2{margin:0;color:var(--ink);font:500 clamp(27px,4vw,46px)/1.03 var(--serif);letter-spacing:-.035em;max-width:900px}.intro-copy>p:last-child{max-width:850px;margin:14px 0 0;line-height:1.65}
  .stats-panel{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));overflow:hidden}.metric{padding:18px;border-right:1px solid var(--line-soft)}.metric:last-child{border-right:0}.metric span{display:block;color:var(--muted);font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase}.metric strong{display:block;color:var(--ink);font:500 28px var(--serif);margin-top:3px}.metric.good{background:var(--olive-soft)}.metric.warn{background:var(--gold-soft)}.metric.risk{background:var(--risk-soft)}
  .stage-shell{overflow:hidden}.stage-tools{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:11px 13px;border-bottom:1px solid var(--line-soft)}.stage-tools .label{margin-right:4px;color:var(--muted);font:10px var(--mono);text-transform:uppercase;letter-spacing:.08em}.zoom-status{margin-left:auto;color:var(--muted);font:10px var(--mono)}
  .stage{height:min(72vh,780px);min-height:520px;position:relative;overflow:hidden;background-image:radial-gradient(var(--line-soft) .75px,transparent .75px);background-size:18px 18px;user-select:none;-webkit-user-select:none}.stage svg{width:100%;height:100%;display:block;cursor:grab;touch-action:none}.stage svg.dragging{cursor:grabbing}
  .edge{fill:none;stroke:var(--muted);stroke-width:1.35;opacity:.42;transition:opacity .16s,stroke .16s,stroke-width .16s}.edge-label{opacity:0;pointer-events:none;transition:opacity .16s}.edge-label rect{fill:var(--surface);stroke:var(--line-soft);stroke-width:1}.edge-label text{fill:var(--muted);font:9.5px var(--mono)}.edge-wrap:hover .edge{opacity:1;stroke:var(--clay);stroke-width:2}.edge-wrap:hover .edge-label,.edge-wrap.active .edge-label{opacity:1}
  .edge-wrap.inferred .edge{stroke-dasharray:7 5;stroke:var(--gold)}
  .edge-wrap.ambiguous .edge{stroke-dasharray:2 5;stroke:var(--risk)}
  .stage.flowing .node{opacity:.14}.stage.flowing .edge-wrap .edge{opacity:.05}.stage.flowing .edge-wrap.active .edge{opacity:1;stroke:var(--clay);stroke-width:2}.stage.flowing .edge-wrap.active .edge-label{opacity:1}.stage.flowing .node.active{opacity:1}.stage.flowing .node.active rect{stroke:var(--clay);stroke-width:2}
  .node{cursor:pointer;outline:none;transition:opacity .15s}.node rect{fill:var(--surface);stroke:var(--line);stroke-width:1.5;transition:stroke .15s}.node:hover rect,.node:focus rect,.node.selected rect{stroke:var(--clay);stroke-width:2}.node.entry rect{fill:var(--blue-soft);stroke:var(--blue)}.node.outcome rect{fill:var(--olive-soft);stroke:var(--olive)}
  .node-label{fill:var(--ink);font:600 14px var(--sans)}.node-meta{fill:var(--muted);font:10px var(--mono)}
  .stage-hint{position:absolute;left:12px;bottom:10px;padding:6px 9px;background:var(--surface);border:1px solid var(--line-soft);border-radius:7px;color:var(--muted);font:10px var(--mono);pointer-events:none}.legend{position:absolute;left:12px;top:12px;display:flex;gap:8px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line-soft);border-radius:9px;padding:7px 9px;font:10px var(--mono)}.legend span::before{content:"";display:inline-block;width:18px;border-top:2px solid var(--muted);margin-right:5px;vertical-align:middle}.legend .inferred::before{border-top-style:dashed;border-color:var(--gold)}.legend .ambiguous::before{border-top-style:dotted;border-color:var(--risk)}
  .details-head{max-width:850px;margin:5px 0 22px}.details-head h2{margin:0;color:var(--ink);font:500 38px var(--serif)}.details-head p{line-height:1.65}.report-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.report-section{padding:18px;min-width:0}.report-section h2{margin:0 0 10px;color:var(--ink);font:500 21px var(--serif)}.report-section ul{margin:0;padding-left:20px}.report-section li{margin:7px 0;overflow-wrap:anywhere;font-size:13px;line-height:1.55}
  .full-index{margin-top:16px;padding:18px}
  .full-index-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .full-index h2{margin:0;color:var(--ink);font:500 22px var(--serif)}.full-index p{margin:4px 0 14px;color:var(--muted)}.full-index-counts{font:12px var(--mono);color:var(--clay);padding-top:3px}
  .full-index label{display:block;margin-bottom:6px;color:var(--ink);font-weight:600}
  .full-index input{width:100%;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--ink);
    padding:10px 12px;font:14px var(--sans)}
  .full-index input:focus{outline:2px solid var(--clay);outline-offset:2px}
  .full-index-status{display:block;margin:9px 0;color:var(--muted);font:11px var(--mono)}
  .full-index-results{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:8px}
  .index-result{border:1px solid var(--line);border-radius:9px;padding:10px;background:var(--bg);min-width:0}
  .index-result strong{display:block;color:var(--ink);overflow-wrap:anywhere}
  .index-result span{display:block;color:var(--muted);font:11px var(--mono);overflow-wrap:anywhere;margin-top:3px}
  .drawer{position:fixed;z-index:40;top:0;right:0;width:min(680px,100vw);height:100vh;padding:22px;background:var(--surface);border-left:1px solid var(--line);box-shadow:var(--shadow);overflow:auto;transform:translateX(102%);transition:transform .22s ease}.drawer.open{transform:translateX(0)}.backdrop{position:fixed;z-index:35;inset:0;background:rgba(20,20,19,.32);opacity:0;pointer-events:none;transition:opacity .2s}.backdrop.open{opacity:1;pointer-events:auto}.drawer-close{position:sticky;top:0;float:right;z-index:2;background:var(--surface)}.drawer h2{margin:20px 45px 8px 0;color:var(--ink);font:500 32px var(--serif)}.drawer .meta{color:var(--clay);font:11px var(--mono)}.detail-block,.flow-facts,.detail-routes,.detail-branches,.detail-insights{margin-top:14px;padding:16px;border:1px solid var(--line-soft);border-radius:12px;background:var(--bg)}.detail-block h3,.flow-facts h3,.detail-routes h3,.detail-branches h3,.detail-insights h3{margin:0 0 10px;color:var(--ink);font:600 12px var(--sans)}.detail-block p{margin:0;line-height:1.65}.flow-facts dl{margin:0}.fact-row{display:grid;grid-template-columns:92px 1fr;gap:10px;padding:8px 0;border-top:1px solid var(--line-soft)}.fact-row:first-of-type{border-top:0}.fact-row[hidden]{display:none}.fact-row dt{color:var(--muted);font:10px var(--mono);text-transform:uppercase}.fact-row dd{margin:0;font-size:12.5px;line-height:1.5}.route-step{display:grid;grid-template-columns:54px 1fr;gap:8px;padding:8px 0;border-top:1px solid var(--line-soft);font-size:12px;line-height:1.45}.route-step:first-child{border-top:0}.route-direction{color:var(--clay);font:10px var(--mono);text-transform:uppercase}.branch-row{padding:9px 0;border-top:1px solid var(--line-soft)}.branch-row:first-child{border-top:0}.branch-row strong{display:block;color:var(--ink);font-size:12px}.branch-row small{display:block;margin-top:3px;color:var(--muted);font:10px var(--mono)}.branch-row p{margin:5px 0 0;font-size:12px;line-height:1.5}.branch-children{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 0;padding:0;list-style:none}.branch-children li{padding:4px 7px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font:9.5px var(--mono)}.insight-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.insight-columns h4{margin:0 0 6px;color:var(--ink);font-size:11px}.insight-columns ul{margin:0;padding-left:17px}.insight-columns li{padding:3px 0;font-size:12px;line-height:1.45}.drawer[aria-hidden="true"]{visibility:hidden}
  @media(max-width:900px){.topbar{align-items:flex-start;flex-wrap:wrap}.brand{flex:1}.tabs{order:3;width:100%;overflow:auto}.search-wrap{min-width:220px}.page{padding:13px}.intro{grid-template-columns:1fr}.stage{height:70vh}.stage-tools .zoom-status{display:none}}
  @media(max-width:560px){.search-wrap{order:4;width:100%}.intro-copy{padding:20px}.stats-panel{grid-template-columns:1fr}.metric{border-right:0;border-bottom:1px solid var(--line-soft)}.stage{min-height:480px}.legend{max-width:210px}}
  @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
</style>
</head>
<body>
<header class="topbar">
  <div class="brand"><h1>QA-skill</h1><p>Effective HTML · intelligence companion</p></div>
  <nav class="tabs" role="tablist" aria-label="Các chế độ xem">
    <button class="tab active" id="tab-diagram" role="tab" aria-selected="true" aria-controls="view-diagram" data-view="diagram">Sơ đồ</button>
    <button class="tab" id="tab-details" role="tab" aria-selected="false" aria-controls="view-details" data-view="details">Chi tiết</button>
  </nav>
  <div class="spacer"></div>
  <label class="search-wrap"><span aria-hidden="true">⌕</span><input id="globalSearch" type="search" placeholder="Tìm trong ${positionedNodes.length} node…" aria-label="Tìm kiếm node trong sơ đồ"></label>
  <button class="theme" id="themeToggle" type="button">Giao diện</button>
</header>
<main class="page">
  <section class="view active" id="view-diagram" role="tabpanel" aria-labelledby="tab-diagram">
    <div class="intro">
      <div class="intro-copy">
        <p class="eyebrow">${escapeHtml(model.kind)} · ${positionedNodes.length} node · ${model.edges.length} liên kết</p>
        <h2>${escapeHtml(model.title)}</h2>
        <p>${escapeHtml(model.subtitle)}</p>
      </div>
      <section class="stats-panel" aria-label="Summary metrics">${metricsHtml}</section>
    </div>
    <div class="stage-shell">
      <div class="stage-tools">
        <span class="label">Làm nổi bật</span>
        <button class="route-chip active" type="button" data-route-id="all">Tất cả</button>
        ${routeChipsHtml}
        <span class="label">Điều khiển</span>
        <button class="icon-btn" id="zoomOut" type="button" aria-label="Thu nhỏ sơ đồ">−</button>
        <button class="icon-btn" id="zoomIn" type="button" aria-label="Phóng to sơ đồ">+</button>
        <button class="icon-btn" id="resetZoom" type="button">Đặt lại</button>
        <output class="zoom-status" id="zoomStatus" aria-live="polite">100%</output>
      </div>
      <section class="stage" id="stage" aria-label="Interactive relationship diagram">
        <svg id="diagram" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="${escapeHtml(model.title)} relationship diagram">
          <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--muted)"/></marker></defs>
          <g id="svg-content">${edgeSvg}${nodeSvg}</g>
        </svg>
        <div class="legend" aria-label="Confidence legend"><span>Extracted</span><span class="inferred">Inferred</span><span class="ambiguous">Ambiguous</span></div>
        <div class="stage-hint">chọn chip: xem một route · bấm node: xem đường vào/ra · kéo/cuộn 2 ngón: di chuyển · chụm/xòe: zoom</div>
      </section>
    </div>
  </section>
  <section class="view" id="view-details" role="tabpanel" aria-labelledby="tab-details">
    <div class="details-head"><p class="eyebrow">Dữ liệu đã xác thực</p><h2>Chi tiết và phạm vi evidence</h2><p>HTML này là companion view. JSON nguồn vẫn là source of truth và mức evidence không được nâng cấp bởi lớp trình bày.</p></div>
    <div class="report-grid">${sectionsHtml}</div>
    ${fullIndexHtml}
  </section>
</main>
<div class="backdrop" id="backdrop"></div>
<aside class="drawer" id="detail" aria-hidden="true" aria-label="Chi tiết node">
  <button class="icon-btn drawer-close" id="detailClose" type="button">Đóng</button>
  <p class="eyebrow">Chi tiết node</p><h2 id="detailTitle"></h2><div class="meta" id="detailMeta"></div>
  <section class="detail-block"><h3>Làm được gì</h3><p id="detailCapability"></p></section>
  <section class="flow-facts" id="detailFacts"><h3>Thông tin flow</h3><dl>
    <div class="fact-row" id="factActor"><dt>Actor</dt><dd></dd></div>
    <div class="fact-row" id="factEntry"><dt>Điều kiện vào</dt><dd></dd></div>
    <div class="fact-row" id="factExit"><dt>Kết quả ra</dt><dd></dd></div>
    <div class="fact-row" id="factStatus"><dt>Trạng thái</dt><dd></dd></div>
  </dl></section>
  <section class="detail-branches"><h3>Nhánh đầy đủ</h3><div id="detailBranches"></div></section>
  <section class="detail-insights"><h3>Ưu điểm và hạn chế</h3><div id="detailInsights"></div></section>
  <section class="detail-block"><h3>Tài nguyên</h3><p id="detailResourceInfo"></p></section>
  <section class="detail-routes"><h3>Đường đi liên quan</h3><div id="detailRoutes"></div></section>
</aside>
<script>
  const MODEL=${scriptModel};
  const FULL_INDEX=${fullIndexModel};
  const nodeById=new Map(MODEL.nodes.map(node=>[node.id,node]));
  const svg=document.getElementById('diagram');
  const content=document.getElementById('svg-content');
  const zoomStatus=document.getElementById('zoomStatus');
  const stage=document.getElementById('stage');
  let transform={x:0,y:0,scale:1};
  let drag=null;
  let dragged=false;
  let pressedNode=null;
  function applyTransform(){content.setAttribute('transform','translate('+transform.x+' '+transform.y+') scale('+transform.scale+')');zoomStatus.value=Math.round(transform.scale*100)+'%';zoomStatus.textContent=zoomStatus.value}
  function zoomAt(next,px,py){const old=transform.scale;transform.x=px-(px-transform.x)*(next/old);transform.y=py-(py-transform.y)*(next/old);transform.scale=next;applyTransform()}
  function zoomBy(factor){const view=svg.viewBox.baseVal;const next=Math.min(2.5,Math.max(.55,transform.scale*factor));zoomAt(next,view.width/2,view.height/2)}
  function svgPoint(clientX,clientY){const rect=svg.getBoundingClientRect();const view=svg.viewBox.baseVal;const x=Number.isFinite(clientX)&&clientX>0?clientX:rect.left+rect.width/2;const y=Number.isFinite(clientY)&&clientY>0?clientY:rect.top+rect.height/2;return{x:(x-rect.left)*(view.width/rect.width),y:(y-rect.top)*(view.height/rect.height)}}
  stage.addEventListener('wheel',event=>{event.preventDefault();const rect=svg.getBoundingClientRect();const view=svg.viewBox.baseVal;const sx=view.width/rect.width;const sy=view.height/rect.height;if(event.ctrlKey || event.metaKey){event.stopPropagation();const point=svgPoint(event.clientX,event.clientY);const factor=Math.exp(-event.deltaY*.01);const next=Math.min(2.5,Math.max(.55,transform.scale*factor));zoomAt(next,point.x,point.y);return}const unit=event.deltaMode===1?16:event.deltaMode===2?rect.height:1;transform.x -= event.deltaX*unit*sx;transform.y -= event.deltaY*unit*sy;applyTransform()},{passive:false,capture:true});
  let gestureStartScale=1;
  stage.addEventListener('gesturestart',event=>{event.preventDefault();event.stopPropagation();gestureStartScale=transform.scale},{passive:false});
  stage.addEventListener('gesturechange',event=>{event.preventDefault();event.stopPropagation();const point=svgPoint(event.clientX,event.clientY);const gestureScale=Number.isFinite(event.scale)&&event.scale>0?event.scale:1;const next=Math.min(2.5,Math.max(.55,gestureStartScale*gestureScale));zoomAt(next,point.x,point.y)},{passive:false});
  stage.addEventListener('gestureend',event=>{event.preventDefault();event.stopPropagation()},{passive:false});
  svg.addEventListener('pointerdown',event=>{event.preventDefault();window.getSelection()?.removeAllRanges();pressedNode=event.target.closest?.('.node')||null;drag={x:event.clientX,y:event.clientY,tx:transform.x,ty:transform.y};dragged=false;try{svg.setPointerCapture(event.pointerId)}catch{}svg.classList.add('dragging')});
  svg.addEventListener('pointermove',event=>{if(!drag)return;event.preventDefault();const rect=svg.getBoundingClientRect();const view=svg.viewBox.baseVal;const dx=(event.clientX-drag.x)*(view.width/rect.width);const dy=(event.clientY-drag.y)*(view.height/rect.height);if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>5)dragged=true;transform.x=drag.tx+dx;transform.y=drag.ty+dy;applyTransform()});
  svg.addEventListener('pointerup',event=>{const activateNode=!dragged?pressedNode:null;pressedNode=null;drag=null;svg.classList.remove('dragging');if(dragged||activateNode){const stop=clickEvent=>{clickEvent.stopPropagation();svg.removeEventListener('click',stop,true)};svg.addEventListener('click',stop,true);setTimeout(()=>svg.removeEventListener('click',stop,true),80)}if (activateNode) showDetail(activateNode.dataset.nodeId,activateNode);try{svg.releasePointerCapture(event.pointerId)}catch{}});
  svg.addEventListener('pointercancel',()=>{pressedNode=null;drag=null;svg.classList.remove('dragging')});
  document.getElementById('zoomIn').addEventListener('click',()=>zoomBy(1.2));
  document.getElementById('zoomOut').addEventListener('click',()=>zoomBy(1/1.2));
  document.getElementById('resetZoom').addEventListener('click',()=>{transform={x:0,y:0,scale:1};applyTransform()});
  const detail=document.getElementById('detail');
  const backdrop=document.getElementById('backdrop');
  let detailTrigger=null;
  function applyRouteFocus(nodeIds,edgeIds,routeId=''){const nodes=new Set(nodeIds);const edges=new Set(edgeIds);const active=nodes.size>0||edges.size>0;stage.classList.toggle('flowing',active);document.querySelectorAll('.node').forEach(item=>item.classList.toggle('active',nodes.has(item.dataset.nodeId)));document.querySelectorAll('.edge-wrap').forEach(item=>item.classList.toggle('active',edges.has(item.dataset.edgeId)));document.querySelectorAll('.route-chip').forEach(chip=>chip.classList.toggle('active',routeId?chip.dataset.routeId===routeId:chip.dataset.routeId==='all'))}
  function showAllRoutes(){applyRouteFocus([],[],'all')}
  function focusNodeRoutes(id){const related=MODEL.edges.filter(edge=>edge.source===id||edge.target===id);const nodes=new Set([id]);for(const edge of related){nodes.add(edge.source);nodes.add(edge.target)}applyRouteFocus([...nodes],related.map(edge=>edge.id))}
  function renderRelatedRoutes(id){const container=document.getElementById('detailRoutes');container.replaceChildren();const related=MODEL.edges.filter(edge=>edge.source===id||edge.target===id);if(!related.length){container.textContent='Node này chưa có liên kết vào hoặc ra';return}for(const edge of related){const incoming=edge.target===id;const other=nodeById.get(incoming?edge.source:edge.target);const row=document.createElement('div');row.className='route-step';const direction=document.createElement('span');direction.className='route-direction';direction.textContent=incoming?'Đi từ':'Đi tới';const text=document.createElement('span');text.textContent=(other?.label||'Unknown')+' · '+edge.label;row.append(direction,text);container.append(row)}}
  function setFact(rowId,value){const row=document.getElementById(rowId);const available=Boolean(value);row.hidden=!available;if(available)row.querySelector('dd').textContent=value;return available}
  function renderFlowFacts(node){const visible=[setFact('factActor',node.actor),setFact('factEntry',node.entryState),setFact('factExit',node.exitState),setFact('factStatus',node.status)].some(Boolean);document.getElementById('detailFacts').hidden=!visible}
  function renderBranches(node){const container=document.getElementById('detailBranches');container.replaceChildren();const items=node.branchItems||[];if(!items.length){container.textContent='Node này không có nhánh cấu trúc riêng';return}for(const item of items){const row=document.createElement('div');row.className='branch-row';const title=document.createElement('strong');title.textContent='H'+(item.level||2)+' · '+(item.kind||'branch')+' · '+item.title;row.append(title);if(item.summary){const summary=document.createElement('p');summary.textContent=item.summary;row.append(summary)}if((item.children||[]).length){const children=document.createElement('ul');children.className='branch-children';for(const child of item.children){const childItem=document.createElement('li');childItem.textContent=child;children.append(childItem)}row.append(children)}container.append(row)}}
  function renderInsights(node){const container=document.getElementById('detailInsights');container.replaceChildren();const columns=document.createElement('div');columns.className='insight-columns';for(const [title,key] of [['Ưu điểm','advantages'],['Hạn chế','limitations']]){const section=document.createElement('section');const heading=document.createElement('h4');heading.textContent=title;section.append(heading);const list=document.createElement('ul');const values=node[key]||[];if(!values.length){const empty=document.createElement('li');empty.textContent='Không có dữ liệu riêng cho node này';list.append(empty)}else for(const value of values){const item=document.createElement('li');item.textContent=value;list.append(item)}section.append(list);columns.append(section)}container.append(columns)}
  function renderResources(node){const info=document.getElementById('detailResourceInfo');const resources=node.resources||{};info.textContent=[node.scope,node.parent?'parent '+node.parent:'',resources.scripts!==undefined?'scripts '+resources.scripts:'',resources.references!==undefined?'references '+resources.references:'',resources.assets!==undefined?'assets '+resources.assets:''].filter(Boolean).join(' · ')||'Không có metadata tài nguyên'}
  function showDetail(id,trigger){const node=nodeById.get(id);if(!node)return;detailTrigger=trigger||document.activeElement;focusNodeRoutes(id);document.querySelectorAll('.node').forEach(item=>item.classList.toggle('selected',item.dataset.nodeId===id));document.getElementById('detailTitle').textContent=node.label;document.getElementById('detailMeta').textContent=node.meta;document.getElementById('detailCapability').textContent=node.capability||node.detail||'Không có mô tả capability';renderFlowFacts(node);renderBranches(node);renderInsights(node);renderResources(node);renderRelatedRoutes(id);detail.classList.add('open');backdrop.classList.add('open');detail.setAttribute('aria-hidden','false');document.getElementById('detailClose').focus()}
  function closeDetail(){detail.classList.remove('open');backdrop.classList.remove('open');detail.setAttribute('aria-hidden','true');document.querySelectorAll('.node').forEach(item=>item.classList.remove('selected'));if(detailTrigger&&detailTrigger.isConnected)detailTrigger.focus()}
  document.querySelectorAll('.node').forEach(element=>{element.addEventListener('click',()=>showDetail(element.dataset.nodeId,element));element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();showDetail(element.dataset.nodeId,element)}})});
  document.querySelectorAll('.route-chip').forEach(chip=>chip.addEventListener('click',()=>{if(chip.dataset.routeId==='all'){showAllRoutes();return}const route=MODEL.routes.find(item=>item.id===chip.dataset.routeId);if(route)applyRouteFocus(route.nodes,route.edges,route.id)}));
  document.getElementById('detailClose').addEventListener('click',closeDetail);backdrop.addEventListener('click',closeDetail);document.addEventListener('keydown',event=>{if(event.key==='Escape')closeDetail()});
  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(item=>{item.classList.toggle('active',item===tab);item.setAttribute('aria-selected',item===tab?'true':'false')});document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id==='view-'+tab.dataset.view))}));
  const globalSearch=document.getElementById('globalSearch');
  globalSearch.addEventListener('input',()=>{const query=globalSearch.value.trim().toLocaleLowerCase('en-US');document.querySelectorAll('.node').forEach(element=>{const node=nodeById.get(element.dataset.nodeId);const matched=!query||(node.label+' '+node.meta+' '+node.detail).toLocaleLowerCase('en-US').includes(query);element.style.opacity=matched?'':'.12'})});
  globalSearch.addEventListener('keydown',event=>{if(event.key!=='Enter')return;const query=globalSearch.value.trim().toLocaleLowerCase('en-US');const match=MODEL.nodes.find(node=>(node.label+' '+node.meta+' '+node.detail).toLocaleLowerCase('en-US').includes(query));if(match)showDetail(match.id,globalSearch)});
  document.getElementById('themeToggle').addEventListener('click',()=>{const dark=!document.documentElement.classList.contains('dark');document.documentElement.classList.toggle('dark',dark);localStorage.setItem('qa-theme',dark?'dark':'light')});
  const fullSearch=document.getElementById('fullSearch');
  if(fullSearch){
    const results=document.getElementById('fullIndexResults');
    const status=document.getElementById('fullIndexStatus');
    const renderIndex=query=>{
      const needle=query.trim().toLocaleLowerCase('en-US');
      results.replaceChildren();
      if(needle.length<2){
        status.textContent='Full index ready: '+FULL_INDEX.nodes.length+' nodes and '+FULL_INDEX.relations.length+' relations';
        return;
      }
      const nodeMatches=FULL_INDEX.nodes.filter(node=>(node.label+' '+node.meta+' '+node.detail).toLocaleLowerCase('en-US').includes(needle));
      const relationMatches=FULL_INDEX.relations.filter(edge=>(edge.source+' '+edge.relation+' '+edge.target+' '+edge.confidence+' '+edge.sourceRef).toLocaleLowerCase('en-US').includes(needle));
      const shownNodes=nodeMatches.slice(0,40);
      const shownRelations=relationMatches.slice(0,40);
      for(const node of shownNodes){
        const item=document.createElement('div');item.className='index-result';
        const title=document.createElement('strong');title.textContent=node.label;
        const meta=document.createElement('span');meta.textContent=node.meta;
        const detailText=document.createElement('span');detailText.textContent=node.detail;
        item.append(title,meta,detailText);results.append(item);
      }
      for(const edge of shownRelations){
        const item=document.createElement('div');item.className='index-result';
        const title=document.createElement('strong');title.textContent=edge.source+' —'+edge.relation+'→ '+edge.target;
        const meta=document.createElement('span');meta.textContent=edge.confidence+(edge.sourceRef?' · '+edge.sourceRef:'');
        item.append(title,meta);results.append(item);
      }
      status.textContent='Showing '+shownNodes.length+' of '+nodeMatches.length+' matching nodes and '+shownRelations.length+' of '+relationMatches.length+' matching relations';
    };
    fullSearch.addEventListener('input',()=>renderIndex(fullSearch.value));
    renderIndex('');
  }
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
