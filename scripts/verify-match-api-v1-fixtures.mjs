import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createMatchApiV1SchemaValidator,
  formatSchemaErrors,
} from "./match-api-v1-schema-validator.mjs";
import {
  assertCanonicalFixtureRelations,
  buildCanonicalChoiceMatrix,
} from "./match-api-v1-fixture-invariants.mjs";

const SOURCE_REPOSITORY = "https://github.com/overgoal/match_server";
const CONTRACT_SOURCE_REVISION = "9918cbc1beb502f0675895b9fbe64d77a96127dc";
const REPRODUCTION_SOURCE_REVISION = "b9d96f8e3d2e584d52329c4a90abdd770e3b88c7";
const EXPECTED_FIXTURE_MANIFEST_SHA256 =
  "5bc7905b27edca848ee9f6bc82b04e8fb9838c12f66dce36c6c659307d980008";
const EXPECTED_MIRROR_TREE_SHA256 =
  "c8e3c1ddfb73e9c2b89dbd288b48e657762dc7b06e2ab9a4c31571a2ee442eec";
const EXPECTED_REPRODUCTION_MANIFEST_SHA256 =
  "4c0b6a613961ea5c3ef2b068d17f3458598c5144dc6426fd35d4116436c06b3b";

function fixtureRootFromEnvironment() {
  if (!process.env.MATCH_API_V1_FIXTURE_ROOT) {
    return new URL("../tests/fixtures/match-api-v1/", import.meta.url);
  }

  return pathToFileURL(`${resolve(process.env.MATCH_API_V1_FIXTURE_ROOT)}/`);
}

function reproductionRootFromEnvironment() {
  if (!process.env.MATCH_API_V1_REPRODUCTION_ROOT) {
    return new URL("../tests/fixtures/reproductions/", import.meta.url);
  }

  return pathToFileURL(
    `${resolve(process.env.MATCH_API_V1_REPRODUCTION_ROOT)}/`,
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function collectFixtureFiles(root, relativePath = "") {
  const entries = await readdir(new URL(relativePath, root), {
    withFileTypes: true,
  });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = `${relativePath}${entry.name}`;
      if (entry.isFile()) return [path];
      if (entry.isDirectory()) return collectFixtureFiles(root, `${path}/`);
      return [];
    }),
  );

  return nested.flat();
}

function mirrorTreeDigest(fileHashes) {
  const digest = createHash("sha256");
  digest.update("match-api-v1-fixture-tree-v1\0");
  for (const [file, hash] of fileHashes) {
    digest.update(`${file}\0${hash}\n`);
  }
  return digest.digest("hex");
}

function resolvePointer(root, ref) {
  if (!ref.startsWith("#/")) {
    throw new Error(`Only local schema references are supported: ${ref}`);
  }

  return ref
    .slice(2)
    .split("/")
    .reduce((current, token) => {
      const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
      if (current === undefined || !(key in current)) {
        throw new Error(`Unresolved schema reference: ${ref}`);
      }
      return current[key];
    }, root);
}

function responseSchema(openapi, operation, status) {
  let response = operation.responses?.[String(status)];
  if (response?.$ref) response = resolvePointer(openapi, response.$ref);
  return response?.content?.["application/json"]?.schema;
}

function assertFixtureAssociation(openapi, fixture) {
  if (!fixture.operation) return;
  const { body, method, path, status } = fixture.operation;
  const operation = openapi.paths?.[path]?.[method.toLowerCase()];
  if (!operation) {
    throw new Error(`${fixture.file}: unknown operation ${method} ${path}`);
  }

  const schema =
    body === "request"
      ? operation.requestBody?.content?.["application/json"]?.schema
      : responseSchema(openapi, operation, status);
  const expectedRef = `#/components/schemas/${fixture.schema}`;
  if (schema?.$ref !== expectedRef) {
    throw new Error(
      `${fixture.file}: operation does not use ${fixture.schema}`,
    );
  }
}

function mirrorPathForContractFixture(file) {
  if (file.startsWith("../examples/scenes/")) {
    return `scenes/${file.split("/").at(-1)}`;
  }
  return file;
}

async function validateMirroredContract(fixtureRoot, reproduction) {
  const manifest = JSON.parse(
    await readFile(new URL("manifest.json", fixtureRoot), "utf8"),
  );
  if (manifest.contract !== "openapi.json") {
    throw new Error(
      "Match API v1 fixture manifest must use the mirrored OpenAPI document",
    );
  }
  const openapi = JSON.parse(
    await readFile(new URL(manifest.contract, fixtureRoot), "utf8"),
  );
  if (
    openapi.openapi !== "3.1.0" ||
    openapi.info?.["x-overgoal-contract-major"] !== 1
  ) {
    throw new Error("Mirrored Match API v1 OpenAPI metadata is invalid");
  }

  const validator = createMatchApiV1SchemaValidator(openapi);
  const choiceMatrix = buildCanonicalChoiceMatrix(openapi);
  const failures = [];
  for (const fixture of manifest.fixtures) {
    const mirrorPath = mirrorPathForContractFixture(fixture.file);
    try {
      assertFixtureAssociation(openapi, fixture);
      const value = JSON.parse(
        await readFile(new URL(mirrorPath, fixtureRoot), "utf8"),
      );
      const schema = openapi.components?.schemas?.[fixture.schema];
      if (!schema) throw new Error(`unknown schema ${fixture.schema}`);
      const { errors, valid } = validator.validate(fixture.schema, value);
      const expectedValid = fixture.valid !== false;
      if (valid !== expectedValid) {
        throw new Error(
          `${mirrorPath}: expected valid=${expectedValid}, got ${valid}; ${formatSchemaErrors(errors)}`,
        );
      }
      if (expectedValid) {
        assertCanonicalFixtureRelations({
          choiceMatrix,
          file: mirrorPath,
          schemaName: fixture.schema,
          value,
        });
      }
    } catch (error) {
      failures.push(
        `${fixture.file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // This separately sealed M0 packet preserves a historical engine defect and
  // is not a fixture for the current M1 response schema.
  try {
    assertCanonicalFixtureRelations({
      choiceMatrix,
      file: "self-pass-follow-up-response.json",
      schemaName: "MatchProgressResponse",
      value: reproduction,
    });
  } catch (error) {
    failures.push(
      `self-pass reproduction: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    reproduction.pending_action?.origin?.previous_outcome !==
      "KICK_TO_BETTER_OPEN_PLAY" ||
    reproduction.pending_action?.field_state?.carrier_player_id !==
      reproduction.pending_action?.field_state?.legend_player_id
  ) {
    failures.push(
      "self-pass reproduction does not preserve the recorded carrier case",
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `Match API v1 schema validation failed:\n${failures.join("\n")}`,
    );
  }
}

async function readSealedReproduction(reproductionRoot) {
  const manifestUrl = new URL("reproduction-manifest.json", reproductionRoot);
  const manifestContents = await readFile(manifestUrl);
  const manifest = JSON.parse(manifestContents);

  if (
    manifest.source?.repository !== SOURCE_REPOSITORY ||
    manifest.source?.revision !== REPRODUCTION_SOURCE_REVISION ||
    manifest.source?.packet_path !== "self-pass-follow-up-response.json"
  ) {
    throw new Error(
      "Match API v1 reproduction source provenance does not match its pinned source",
    );
  }

  const actualManifestDigest = sha256(manifestContents);
  if (actualManifestDigest !== EXPECTED_REPRODUCTION_MANIFEST_SHA256) {
    throw new Error(
      `Match API v1 reproduction-manifest digest mismatch: expected ${EXPECTED_REPRODUCTION_MANIFEST_SHA256}, received ${actualManifestDigest}`,
    );
  }

  const actualFiles = (await collectFixtureFiles(reproductionRoot))
    .filter((file) => file !== "reproduction-manifest.json")
    .sort();
  const manifestFiles = Object.keys(manifest.sha256 ?? {}).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(manifestFiles)) {
    throw new Error(
      "Match API v1 reproduction manifest does not cover exactly the reproduction files",
    );
  }

  for (const file of manifestFiles) {
    const contents = await readFile(new URL(file, reproductionRoot));
    const actualHash = sha256(contents);
    if (actualHash !== manifest.sha256[file]) {
      throw new Error(
        `Match API v1 reproduction hash mismatch for ${file}: expected ${manifest.sha256[file]}, received ${actualHash}`,
      );
    }
  }

  return JSON.parse(
    await readFile(
      new URL(manifest.source.packet_path, reproductionRoot),
      "utf8",
    ),
  );
}

const fixtureRoot = fixtureRootFromEnvironment();
const reproductionRoot = reproductionRootFromEnvironment();
const manifestUrl = new URL("fixture-manifest.json", fixtureRoot);
const manifestContents = await readFile(manifestUrl);
const manifest = JSON.parse(manifestContents);

if (
  manifest.source?.repository !== SOURCE_REPOSITORY ||
  manifest.source?.revision !== CONTRACT_SOURCE_REVISION ||
  manifest.source?.contract_path !== "contracts/match-api/v1"
) {
  throw new Error(
    "Match API v1 fixture source provenance does not match the pinned contract",
  );
}

const actualManifestDigest = sha256(manifestContents);
if (actualManifestDigest !== EXPECTED_FIXTURE_MANIFEST_SHA256) {
  throw new Error(
    `Match API v1 fixture-manifest digest mismatch: expected ${EXPECTED_FIXTURE_MANIFEST_SHA256}, received ${actualManifestDigest}`,
  );
}

const actualFiles = (await collectFixtureFiles(fixtureRoot))
  .filter((file) => file !== "fixture-manifest.json")
  .sort();
const manifestFiles = Object.keys(manifest.sha256).sort();

if (JSON.stringify(actualFiles) !== JSON.stringify(manifestFiles)) {
  throw new Error(
    "Match API v1 fixture manifest does not cover exactly the mirror files",
  );
}

const fileHashes = [];
for (const file of manifestFiles) {
  const contents = await readFile(new URL(file, fixtureRoot));
  const actualHash = sha256(contents);
  if (actualHash !== manifest.sha256[file]) {
    throw new Error(
      `Match API v1 fixture hash mismatch for ${file}: expected ${manifest.sha256[file]}, received ${actualHash}`,
    );
  }
  fileHashes.push([file, actualHash]);
}

const actualMirrorTreeDigest = mirrorTreeDigest(fileHashes);
if (actualMirrorTreeDigest !== EXPECTED_MIRROR_TREE_SHA256) {
  throw new Error(
    `Match API v1 mirror tree digest mismatch: expected ${EXPECTED_MIRROR_TREE_SHA256}, received ${actualMirrorTreeDigest}`,
  );
}

const reproduction = await readSealedReproduction(reproductionRoot);
await validateMirroredContract(fixtureRoot, reproduction);

console.log(
  `Match API v1 fixtures verified: ${manifestFiles.length} files from ${SOURCE_REPOSITORY}@${CONTRACT_SOURCE_REVISION}`,
);
