import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenApiAjv, formatAjvErrors } from './ajv-validator.mjs';

const contractDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(contractDir, 'fixtures');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const manifest = await readJson(path.join(fixtureDir, 'manifest.json'));
const openapi = await readJson(path.join(contractDir, manifest.contract));
const validator = createOpenApiAjv(openapi);
const failures = [];

function resolvePointer(ref) {
  return ref.slice(2).split('/').reduce((value, token) => {
    const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
    return value?.[key];
  }, openapi);
}

function associatedSchemaName(fixture) {
  if (!fixture.operation) return fixture.schema;
  const { method, path: operationPath, status, body } = fixture.operation;
  const operation = openapi.paths?.[operationPath]?.[method.toLowerCase()];
  let schema;
  if (body === 'request') {
    schema = operation?.requestBody?.content?.['application/json']?.schema;
  } else {
    let response = operation?.responses?.[String(status)];
    if (response?.$ref) response = resolvePointer(response.$ref);
    schema = response?.content?.['application/json']?.schema;
  }
  if (!schema?.$ref?.startsWith('#/components/schemas/')) {
    throw new Error(`${fixture.file}: operation does not use a named component schema`);
  }
  return schema.$ref.split('/').at(-1);
}

for (const fixture of manifest.fixtures) {
  const value = await readJson(path.resolve(fixtureDir, fixture.file));
  const schemaName = associatedSchemaName(fixture);
  if (schemaName !== fixture.schema) {
    failures.push(`${fixture.file}: operation associates ${schemaName}, manifest declares ${fixture.schema}`);
  }
  const result = validator.validateSchema(schemaName, value);
  const expectedValid = fixture.valid !== false;
  if (result.valid !== expectedValid) {
    failures.push(
      `${fixture.file} -> ${schemaName}: expected valid=${expectedValid}, got valid=${result.valid}`
      + (result.errors.length > 0 ? `\n  ${formatAjvErrors(result.errors).replaceAll('\n', '\n  ')}` : '')
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`AJV 2020-12 contract fixtures valid (fixtures=${manifest.fixtures.length}).`);
}
