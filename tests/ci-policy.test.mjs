import { readFile } from "node:fs/promises";

import { parse } from "yaml";
import { beforeAll, describe, expect, it } from "vitest";

import { verifyCiPolicy } from "../scripts/ci-policy.mjs";

let baseline;

beforeAll(async () => {
  const [workflowText, protectionText, packageText, nvmrc, npmrc] =
    await Promise.all([
      readFile(
        new URL("../.github/workflows/client-quality.yml", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../.github/branch-protection.main.json", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../.nvmrc", import.meta.url), "utf8"),
      readFile(new URL("../.npmrc", import.meta.url), "utf8"),
    ]);

  baseline = {
    workflow: parse(workflowText),
    protection: JSON.parse(protectionText),
    packageJson: JSON.parse(packageText),
    nvmrc,
    npmrc,
    runtime: {
      node: process.version,
      pnpmUserAgent: process.env.npm_config_user_agent,
    },
  };
});

function leafPaths(value, path = []) {
  if (value === null || typeof value !== "object") return [path];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, [...path, key]),
  );
}

function mutateLeaf(target, path) {
  const parent = path.slice(0, -1).reduce((value, key) => value[key], target);
  const key = path.at(-1);
  const current = parent[key];

  if (typeof current === "boolean") parent[key] = !current;
  else if (typeof current === "number") parent[key] = current + 1;
  else if (typeof current === "string") parent[key] = `${current}-mutated`;
  else parent[key] = {};
}

function expectRejected(mutator) {
  const candidate = structuredClone(baseline);
  mutator(candidate);
  expect(() => verifyCiPolicy(candidate)).toThrow();
}

describe("CI policy contract", () => {
  it("accepts the committed policy", () => {
    expect(() => verifyCiPolicy(baseline)).not.toThrow();
  });

  it("rejects mutation of every workflow field", () => {
    for (const path of leafPaths(baseline.workflow)) {
      expectRejected((candidate) => mutateLeaf(candidate.workflow, path));
    }
  });

  it("rejects mutation of every branch-protection field", () => {
    for (const path of leafPaths(baseline.protection)) {
      expectRejected((candidate) => mutateLeaf(candidate.protection, path));
    }
  });

  it("rejects missing, extra, or mutable policy controls", () => {
    expectRejected((candidate) => {
      delete candidate.protection.required_conversation_resolution;
    });
    expectRejected((candidate) => {
      candidate.protection.required_status_checks.contexts.push("extra-check");
    });
    expectRejected((candidate) => {
      candidate.workflow.jobs["client-quality"].steps.pop();
    });
    expectRejected((candidate) => {
      candidate.workflow.jobs["client-quality"].steps[0].uses =
        "actions/checkout@v4";
    });
  });

  it("rejects every package, tool-file, and runtime pin mutation", () => {
    for (const path of [
      ["engines", "node"],
      ["engines", "pnpm"],
      ["packageManager"],
      ["scripts", "bundle:verify"],
      ["scripts", "build"],
      ["scripts", "ci:verify"],
      ["scripts", "format:check"],
      ["scripts", "lint"],
      ["scripts", "test:policy"],
      ["scripts", "test:browser"],
      ["scripts", "typecheck"],
      ["scripts", "test:unit"],
    ]) {
      expectRejected((candidate) => mutateLeaf(candidate.packageJson, path));
    }
    expectRejected((candidate) => {
      candidate.nvmrc = "22";
    });
    expectRejected((candidate) => {
      candidate.npmrc = "engine-strict=false\n";
    });
    expectRejected((candidate) => {
      candidate.runtime.node = "v23.10.0";
    });
    expectRejected((candidate) => {
      candidate.runtime.pnpmUserAgent = "pnpm/10.25.0 node/v22.14.0";
    });
  });
});
