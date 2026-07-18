import { readFile } from "node:fs/promises";

import { parse } from "yaml";

import { REQUIRED_CHECK, verifyCiPolicy } from "./ci-policy.mjs";

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

verifyCiPolicy({
  workflow: parse(workflowText),
  protection: JSON.parse(protectionText),
  packageJson: JSON.parse(packageText),
  nvmrc,
  npmrc,
  runtime: {
    node: process.version,
    pnpmUserAgent: process.env.npm_config_user_agent,
  },
});

console.log(`CI policy verified: ${REQUIRED_CHECK}`);
