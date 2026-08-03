import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const contractDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(contractDir, 'fixtures');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function findJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const resolved = path.join(directory, entry.name);
    return entry.isDirectory() ? findJsonFiles(resolved) : [resolved];
  }));
  return files.flat().filter((file) => file.endsWith('.json'));
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, expected) {
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expected === 'integer') return Number.isInteger(value);
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'null') return value === null;
  return typeof value === expected;
}

function resolvePointer(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Only local schema references are supported: ${ref}`);
  return ref.slice(2).split('/').reduce((current, token) => {
    const decoded = token.replaceAll('~1', '/').replaceAll('~0', '~');
    if (current === undefined || !(decoded in current)) throw new Error(`Unresolved schema reference: ${ref}`);
    return current[decoded];
  }, root);
}

export function validate(schema, value, root, location = '$') {
  const errors = [];
  if (schema === true || schema === undefined) return errors;
  if (schema === false) return [`${location}: value is forbidden by schema`];

  if (schema.$ref) {
    errors.push(...validate(resolvePointer(root, schema.$ref), value, root, location));
    const siblings = Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$ref'));
    if (Object.keys(siblings).length > 0) errors.push(...validate(siblings, value, root, location));
    return errors;
  }

  if (schema.allOf) {
    for (const branch of schema.allOf) errors.push(...validate(branch, value, root, location));
  }

  if (schema.if) {
    const conditionMatches = validate(schema.if, value, root, location).length === 0;
    if (conditionMatches && schema.then) errors.push(...validate(schema.then, value, root, location));
    if (!conditionMatches && schema.else) errors.push(...validate(schema.else, value, root, location));
  }

  if (schema.oneOf) {
    const branchErrors = schema.oneOf.map((branch) => validate(branch, value, root, location));
    const matches = branchErrors.filter((branch) => branch.length === 0).length;
    if (matches !== 1) {
      const closest = branchErrors.sort((left, right) => left.length - right.length)[0] || [];
      errors.push(`${location}: expected exactly one oneOf branch, matched ${matches}`);
      errors.push(...closest.slice(0, 3));
    }
  }

  if (schema.anyOf) {
    const branchErrors = schema.anyOf.map((branch) => validate(branch, value, root, location));
    if (!branchErrors.some((branch) => branch.length === 0)) {
      errors.push(`${location}: did not match any anyOf branch`);
      errors.push(...(branchErrors.sort((left, right) => left.length - right.length)[0] || []).slice(0, 3));
    }
  }

  if (schema.const !== undefined && !Object.is(value, schema.const)) {
    errors.push(`${location}: expected constant ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (schema.enum && !schema.enum.some((entry) => Object.is(value, entry))) {
    errors.push(`${location}: ${JSON.stringify(value)} is not in enum`);
  }

  if (schema.type) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expectedTypes.some((expected) => matchesType(value, expected))) {
      errors.push(`${location}: expected ${expectedTypes.join('|')}, got ${valueType(value)}`);
      return errors;
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${location}: ${value} is below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${location}: ${value} is above maximum ${schema.maximum}`);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${location}: string is shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${location}: string is longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${location}: string does not match ${schema.pattern}`);
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) errors.push(`${location}: invalid date-time`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${location}: expected at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${location}: expected at most ${schema.maxItems} items`);
    if (schema.prefixItems) {
      schema.prefixItems.forEach((itemSchema, index) => {
        if (index < value.length) errors.push(...validate(itemSchema, value[index], root, `${location}[${index}]`));
      });
    }
    if (schema.items && schema.items !== true) {
      value.forEach((item, index) => errors.push(...validate(schema.items, item, root, `${location}[${index}]`)));
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties || {};
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) errors.push(`${location}: missing required property ${required}`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (properties[key]) {
        errors.push(...validate(properties[key], child, root, `${location}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${location}: unexpected property ${key}`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        errors.push(...validate(schema.additionalProperties, child, root, `${location}.${key}`));
      }
    }
  }

  return errors;
}

function assertContractShape(openapi) {
  const expectedPaths = [
    '/health', '/live', '/ready', '/metrics', '/teams', '/team/{id}', '/createMatch', '/startMatch', '/resumeMatch',
    '/abandonMatch',
    '/processMatchAction', '/match/{id}', '/match/{id}/timeline',
    '/auth/v1/challenges', '/auth/v1/sessions', '/auth/v1/session',
    '/auth/v1/session/refresh', '/auth/v1/session/rotate', '/auth/v1/sessions/revoke-all',
    '/auth/v1/recoveries', '/auth/v1/recoveries/pending', '/auth/v1/recoveries/{id}/complete'
  ];
  const actualPaths = Object.keys(openapi.paths).sort();
  if (openapi.openapi !== '3.1.0') throw new Error(`Expected OpenAPI 3.1.0, got ${openapi.openapi}`);
  if (openapi.info?.['x-overgoal-contract-major'] !== 1) throw new Error('Match API major must be 1');
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths.sort())) {
    throw new Error(`Route inventory mismatch: ${actualPaths.join(', ')}`);
  }
  const operationIds = Object.values(openapi.paths).flatMap((item) =>
    Object.values(item).map((operation) => operation.operationId).filter(Boolean)
  );
  if (new Set(operationIds).size !== operationIds.length) throw new Error('operationId values must be unique');
}

function assertManifestAssociation(openapi, fixture) {
  if (!fixture.operation) return;
  const { method, path: operationPath, status, body } = fixture.operation;
  const operationKeys = Object.keys(fixture.operation).sort();
  const expectedKeys = (body === 'response' ? ['body', 'method', 'path', 'status'] : ['body', 'method', 'path']).sort();
  if (JSON.stringify(operationKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`${fixture.file}: operation association keys must be exactly ${expectedKeys.join(', ')}`);
  }
  if (!['DELETE', 'GET', 'POST'].includes(method)) throw new Error(`${fixture.file}: unsupported operation method ${method}`);
  if (body === 'response' && !Number.isInteger(status)) throw new Error(`${fixture.file}: response association requires an integer status`);
  const operation = openapi.paths?.[operationPath]?.[method.toLowerCase()];
  if (!operation) throw new Error(`${fixture.file}: unknown operation ${method} ${operationPath}`);

  let schema;
  if (body === 'request') {
    schema = operation.requestBody?.content?.['application/json']?.schema;
  } else if (body === 'response') {
    let response = operation.responses?.[String(status)];
    if (response?.$ref) response = resolvePointer(openapi, response.$ref);
    schema = response?.content?.['application/json']?.schema;
  } else {
    throw new Error(`${fixture.file}: operation body must be request or response`);
  }

  if (schema?.$ref) schema = resolvePointer(openapi, schema.$ref);
  if (schema !== openapi.components.schemas[fixture.schema]) {
    throw new Error(`${fixture.file}: ${method} ${operationPath} ${status ?? ''} ${body} is not associated with ${fixture.schema}`);
  }
}

function assertTimelineOrdering(value, file) {
  const timelines = [];
  if (Array.isArray(value.timeline)) timelines.push(value.timeline);
  if (Array.isArray(value.events)) timelines.push(value.events);
  for (const events of timelines) {
    for (let index = 1; index < events.length; index += 1) {
      const previous = events[index - 1];
      const current = events[index];
      if (current.event_id <= previous.event_id) throw new Error(`${file}: event_id must increase strictly`);
      if (current.minute < previous.minute) throw new Error(`${file}: timeline minute must not decrease`);
    }
  }
}

function assertLifecycle(value, file) {
  if (Number.isInteger(value.status)) return;
  const status = value.status || value.match?.match_status;
  if (!['NOT_STARTED', 'IN_PROGRESS', 'WAITING_FOR_DECISION', 'HALFTIME', 'FINISHED'].includes(status)) return;
  const minute = value.minute ?? value.match?.current_time;
  if (value.status && value.match?.match_status !== value.status) throw new Error(`${file}: response and match statuses differ`);
  if (value.minute !== undefined && value.match && value.match.current_time !== value.minute) throw new Error(`${file}: response and match minutes differ`);
  if (status === 'HALFTIME' && minute !== 45) throw new Error(`${file}: HALFTIME must be minute 45`);
  const terminalHandoff = value.full_time_handoff;
  const isAdministrative = terminalHandoff?.status === 'ABANDONED';
  if (status === 'FINISHED' && minute !== 90 && !isAdministrative) {
    throw new Error(`${file}: regulation FINISHED must be minute 90`);
  }
  if (status === 'FINISHED' && !terminalHandoff && value.match?.engine_version === 'match-engine/5') {
    throw new Error(`${file}: current-engine FINISHED requires full_time_handoff`);
  }
  if (status === 'HALFTIME' && !value.halftime_summary && value.match?.engine_version === 'match-engine/5') {
    throw new Error(`${file}: current-engine HALFTIME requires halftime_summary`);
  }
  if (status === 'WAITING_FOR_DECISION' && !value.pending_action) throw new Error(`${file}: waiting response requires pending_action`);
  if (status !== 'WAITING_FOR_DECISION' && value.pending_action) throw new Error(`${file}: non-waiting response cannot expose pending_action`);
  if (value.pending_action && value.pending_action.minute !== minute) throw new Error(`${file}: pending action minute must equal response minute`);
  if (value.pending_action && value.match?.pending_action?.id !== value.pending_action.id) {
    throw new Error(`${file}: response and match pending action identifiers differ`);
  }
}

function assertScene(value, file) {
  const scene = value.scene_type ? value : value.pending_action;
  if (!scene) return;
  if (scene.field_state?.action_type !== scene.scene_type) throw new Error(`${file}: field action_type must match scene_type`);
  if (scene.field_state_id !== scene.field_state?.id) throw new Error(`${file}: field_state_id must match embedded field state`);
  const randomScenes = new Set(['JUMPER', 'BRAWL', 'ARGUMENT_OPPONENT', 'ARGUMENT_TEAMMATE', 'BATHROOM']);
  if (randomScenes.has(scene.scene_type) && scene.field_state.scene_family !== 'RANDOM_EVENT') {
    throw new Error(`${file}: random scene must use RANDOM_EVENT family`);
  }
  const expectedChoices = sceneChoices.get(scene.scene_type);
  const actualChoices = scene.available_choices.map((choice) => choice.id);
  if (!expectedChoices || JSON.stringify(actualChoices) !== JSON.stringify(expectedChoices)) {
    throw new Error(`${file}: choices for ${scene.scene_type} differ from the contract`);
  }
}

const manifest = await readJson(path.join(fixtureDir, 'manifest.json'));
const openapi = await readJson(path.join(contractDir, manifest.contract));
assertContractShape(openapi);
if (JSON.stringify(manifest.response_headers) !== JSON.stringify({
  'Match-API-Version': '1',
  'Match-Auth-Profile': 'owner-v1',
})) {
  throw new Error('Fixture manifest must pin exact Match API response profile headers');
}
const sceneChoices = new Map(Object.values(openapi.components.schemas).flatMap((schema) => {
  const sceneExtension = schema.allOf?.find((branch) => branch['x-overgoal-choice-ids']);
  const sceneType = sceneExtension?.properties?.scene_type?.const;
  return sceneType ? [[sceneType, sceneExtension['x-overgoal-choice-ids']]] : [];
}));

const jsonFiles = await findJsonFiles(contractDir);
await Promise.all(jsonFiles.map(readJson));

const counts = new Map();
const seenScenes = new Set();
const seenFixtureFiles = new Set();
const failures = [];

for (const fixture of manifest.fixtures) {
  if (seenFixtureFiles.has(fixture.file)) failures.push(`${fixture.file}: duplicate manifest fixture path`);
  seenFixtureFiles.add(fixture.file);
  if (!fixture.operation && fixture.consumer !== 'scene-example') {
    failures.push(`${fixture.file}: request/response fixture is missing an operation association`);
  }
  try {
    assertManifestAssociation(openapi, fixture);
  } catch (error) {
    failures.push(error.message);
  }
  const file = path.resolve(fixtureDir, fixture.file);
  const value = await readJson(file);
  const schema = openapi.components?.schemas?.[fixture.schema];
  if (!schema) throw new Error(`Unknown schema ${fixture.schema} for ${fixture.file}`);
  const errors = validate(schema, value, openapi);
  const expectedValid = fixture.valid !== false;
  if (expectedValid && errors.length > 0) failures.push(`${fixture.file} -> ${fixture.schema}\n  ${errors.join('\n  ')}`);
  if (!expectedValid && errors.length === 0) failures.push(`${fixture.file} -> ${fixture.schema}\n  expected fixture to be rejected`);
  if (expectedValid) {
    assertTimelineOrdering(value, fixture.file);
    assertLifecycle(value, fixture.file);
    assertScene(value, fixture.file);
    if (value.scene_type) seenScenes.add(value.scene_type);
  }
  counts.set(fixture.consumer, (counts.get(fixture.consumer) || 0) + 1);
}

const expectedScenes = new Set(openapi.components.schemas.PlayableSceneType.enum);
const missingScenes = [...expectedScenes].filter((scene) => !seenScenes.has(scene));
if (missingScenes.length > 0) failures.push(`Missing scene examples: ${missingScenes.join(', ')}`);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  const summary = [...counts].map(([consumer, count]) => `${consumer}=${count}`).join(', ');
  console.log(`Match API v1 contract fixtures valid (${summary}; json-files=${jsonFiles.length}).`);
}
