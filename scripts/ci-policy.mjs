import { isDeepStrictEqual } from "node:util";

export const EXPECTED_NODE_VERSION = "22.14.0";
export const EXPECTED_PNPM_VERSION = "10.24.0";
export const REQUIRED_CHECK = "client-quality";

export const EXPECTED_BRANCH_PROTECTION = {
  required_status_checks: {
    strict: true,
    contexts: [REQUIRED_CHECK],
  },
  enforce_admins: true,
  required_pull_request_reviews: {
    dismiss_stale_reviews: true,
    require_code_owner_reviews: false,
    required_approving_review_count: 1,
    require_last_push_approval: true,
  },
  restrictions: null,
  required_linear_history: false,
  allow_force_pushes: false,
  allow_deletions: false,
  block_creations: false,
  required_conversation_resolution: true,
  lock_branch: false,
  allow_fork_syncing: true,
};

const EXPECTED_PACKAGE_MANAGER =
  "pnpm@10.24.0+sha512.01ff8ae71b4419903b65c60fb2dc9d34cf8bb6e06d03bde112ef38f7a34d6904c424ba66bea5cdcf12890230bf39f9580473140ed9c946fef328b6e5238a345a";

const EXPECTED_STEPS = [
  {
    name: "Verify browser shards",
    run: 'test "$BROWSER_SHARD_RESULT" = "success"',
    env: { BROWSER_SHARD_RESULT: "${{ needs.client-browser.result }}" },
  },
  {
    name: "Checkout",
    uses: "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
  },
  {
    name: "Install pnpm",
    uses: "pnpm/action-setup@a7487c7e89a18df4991f7f222e4898a00d66ddda",
    with: { run_install: false },
  },
  {
    name: "Configure Node",
    uses: "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
    with: { "node-version": EXPECTED_NODE_VERSION, cache: "pnpm" },
  },
  {
    name: "Verify toolchain",
    run: 'test "$(node --version)" = "v22.14.0"\ntest "$(pnpm --version)" = "10.24.0"\n',
  },
  { name: "Install dependencies", run: "pnpm install --frozen-lockfile" },
  { name: "Verify CI policy", run: "pnpm ci:verify" },
  { name: "Policy mutation tests", run: "pnpm test:policy" },
  { name: "Verify Match API v1 fixtures", run: "pnpm test:fixtures" },
  { name: "Check formatting", run: "pnpm format:check" },
  { name: "Lint", run: "pnpm lint" },
  { name: "Typecheck", run: "pnpm typecheck" },
  { name: "Unit tests", run: "pnpm test:unit" },
  {
    name: "Install Chromium",
    run: "pnpm exec playwright install --with-deps chromium",
  },
  {
    name: "Browser stale-listener proof",
    run: "pnpm test:browser:stale-port",
  },
  {
    name: "Browser signal-cleanup proof",
    run: "pnpm test:browser:signal",
  },
  { name: "Production build", run: "pnpm build" },
];

const EXPECTED_BROWSER_STEPS = [
  {
    name: "Checkout",
    uses: "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
  },
  {
    name: "Install pnpm",
    uses: "pnpm/action-setup@a7487c7e89a18df4991f7f222e4898a00d66ddda",
    with: { run_install: false },
  },
  {
    name: "Configure Node",
    uses: "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
    with: { "node-version": EXPECTED_NODE_VERSION, cache: "pnpm" },
  },
  { name: "Install dependencies", run: "pnpm install --frozen-lockfile" },
  {
    name: "Install Chromium",
    run: "pnpm exec playwright install --with-deps chromium",
  },
  {
    name: "Browser shard",
    run: "pnpm test:browser",
    env: {
      OVERGOAL_PLAYWRIGHT_CASES_PER_PROCESS: 1,
      OVERGOAL_PLAYWRIGHT_SHARD_INDEX: "${{ matrix.shard }}",
      OVERGOAL_PLAYWRIGHT_SHARD_TOTAL: 8,
    },
  },
];

const EXPECTED_WORKFLOW = {
  name: "Client Quality",
  on: {
    pull_request: null,
    push: { branches: ["main"] },
  },
  permissions: { contents: "read" },
  concurrency: {
    group: "client-quality-${{ github.ref }}",
    "cancel-in-progress": true,
  },
  jobs: {
    "client-browser": {
      name: "client-browser-${{ matrix.shard }}-of-8",
      "runs-on": "ubuntu-24.04",
      "timeout-minutes": 20,
      strategy: {
        "fail-fast": false,
        matrix: { shard: [1, 2, 3, 4, 5, 6, 7, 8] },
      },
      steps: EXPECTED_BROWSER_STEPS,
    },
    [REQUIRED_CHECK]: {
      name: REQUIRED_CHECK,
      "runs-on": "ubuntu-24.04",
      "timeout-minutes": 30,
      needs: "client-browser",
      if: "${{ always() }}",
      steps: EXPECTED_STEPS,
    },
  },
};

function verifyExact(actual, expected, label) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${label} does not match the required CI policy`);
  }
}

export function verifyCiPolicy({
  workflow,
  protection,
  packageJson,
  nvmrc,
  npmrc,
  runtime,
}) {
  verifyExact(workflow, EXPECTED_WORKFLOW, "GitHub Actions workflow");
  verifyExact(
    protection,
    EXPECTED_BRANCH_PROTECTION,
    "Branch-protection specification",
  );
  verifyExact(
    packageJson.engines,
    { node: "22.x", pnpm: EXPECTED_PNPM_VERSION },
    "Package engines",
  );
  verifyExact(
    packageJson.packageManager,
    EXPECTED_PACKAGE_MANAGER,
    "Pinned package manager",
  );
  verifyExact(
    {
      bundle: packageJson.scripts?.["bundle:verify"],
      build: packageJson.scripts?.build,
      ci: packageJson.scripts?.["ci:verify"],
      format: packageJson.scripts?.["format:check"],
      lint: packageJson.scripts?.lint,
      policy: packageJson.scripts?.["test:policy"],
      fixtures: packageJson.scripts?.["test:fixtures"],
      browser: packageJson.scripts?.["test:browser"],
      stalePortBrowser: packageJson.scripts?.["test:browser:stale-port"],
      signalBrowser: packageJson.scripts?.["test:browser:signal"],
      typecheck: packageJson.scripts?.typecheck,
      unit: packageJson.scripts?.["test:unit"],
    },
    {
      bundle: "node scripts/verify-bundle.mjs",
      build: "pnpm typecheck && vite build && pnpm bundle:verify",
      ci: "node scripts/verify-ci-policy.mjs",
      format: "prettier --check .",
      lint: "eslint . --max-warnings 0",
      policy: "vitest run tests/ci-policy.test.mjs",
      fixtures: "node scripts/verify-match-api-v1-fixtures.mjs",
      browser: "env -u NO_COLOR node scripts/run-playwright.mjs",
      stalePortBrowser:
        "env -u NO_COLOR node scripts/verify-playwright-stale-port.mjs",
      signalBrowser:
        "env -u NO_COLOR node scripts/verify-playwright-signal-cleanup.mjs",
      typecheck: "tsc -b",
      unit: "vitest run tests",
    },
    "Required package scripts",
  );
  verifyExact(nvmrc.trim(), EXPECTED_NODE_VERSION, ".nvmrc");
  verifyExact(npmrc.trim(), "engine-strict=true", ".npmrc");
  verifyExact(runtime.node, `v${EXPECTED_NODE_VERSION}`, "Runtime Node");
  if (!runtime.pnpmUserAgent?.startsWith(`pnpm/${EXPECTED_PNPM_VERSION} `)) {
    throw new Error("Runtime pnpm does not match the required CI policy");
  }

  for (const step of workflow.jobs[REQUIRED_CHECK].steps) {
    if (step.uses && !/@[0-9a-f]{40}$/.test(step.uses)) {
      throw new Error(`Action is not pinned to an immutable SHA: ${step.uses}`);
    }
  }
}
