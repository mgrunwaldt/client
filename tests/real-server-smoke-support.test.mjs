import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  REAL_CLIENT_PORT,
  REAL_SMOKE_FIXTURE_ACK_FILE,
  REAL_SMOKE_FIXTURE_COMMAND_FILE,
  REAL_SMOKE_FIXTURE_VERSION,
  REAL_SERVER_PORT,
  assertPortsAvailable,
  createRealSmokeUnknownSceneCommand,
  parseRealSmokeFixtureAcknowledgement,
  parseRealSmokeFixtureCommand,
  parseServerStarted,
  publishRealSmokeFixtureCommand,
  validateRealServerRuntime,
  waitForRealSmokeFixtureAcknowledgement,
} from "../scripts/real-server-smoke-support.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("real Match API smoke support", () => {
  it("pins distinct non-3000 deployment origins", () => {
    expect(REAL_CLIENT_PORT).toBe(4176);
    expect(REAL_SERVER_PORT).toBe(3444);
    expect(REAL_CLIENT_PORT).not.toBe(REAL_SERVER_PORT);
    expect([REAL_CLIENT_PORT, REAL_SERVER_PORT]).not.toContain(3000);
  });

  it("fails closed without killing or reusing an occupied listener", async () => {
    const listener = createServer();
    const address = await listen(listener);
    if (!address || typeof address === "string") {
      throw new Error("Test listener did not receive a TCP port.");
    }
    try {
      await expect(assertPortsAvailable([address.port])).rejects.toThrow(
        /refusing to kill or reuse an unowned listener/u,
      );
      expect(listener.listening).toBe(true);
    } finally {
      await close(listener);
    }
    await expect(assertPortsAvailable([address.port])).resolves.toBeUndefined();
  });

  it("accepts only the exact HTTPS real-runtime startup diagnostic", () => {
    expect(
      parseServerStarted(
        '{"event":"server_started","host":"127.0.0.1","port":3444,"protocol":"https"}',
      ),
    ).toMatchObject({ event: "server_started", port: 3444 });
    expect(parseServerStarted("not json")).toBeNull();
    expect(() =>
      parseServerStarted(
        '{"event":"server_started","host":"127.0.0.1","port":3000,"protocol":"http"}',
      ),
    ).toThrow(/unexpected host, port, or protocol/u);
  });

  it("rejects a lookalike root and accepts the required real-runtime markers", async () => {
    const root = await mkdtemp(join(tmpdir(), "overgoal-server-root-test-"));
    temporaryDirectories.push(root);
    await Promise.all([
      mkdir(join(root, "scripts"), { recursive: true }),
      mkdir(join(root, "src/runtime"), { recursive: true }),
    ]);
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "match-server",
        engines: { node: process.version.slice(1) },
        scripts: { "start:local-demo": "node scripts/start-local-demo.mjs" },
      }),
    );
    await writeFile(
      join(root, "scripts/start-local-demo-server.mjs"),
      "startLocalDemoServer();\n",
    );
    await writeFile(
      join(root, "src/runtime/localDemo.js"),
      [
        "createProductionMatchRepository",
        "provisionLocalDemoIdentity",
        "createServerRuntime",
        "environment: 'LOCAL_CI'",
      ].join("\n"),
    );

    await expect(
      validateRealServerRuntime({
        serverRoot: root,
        serverNode: process.execPath,
      }),
    ).resolves.toMatchObject({
      root: await realpath(root),
      expectedNode: process.version.slice(1),
    });

    await writeFile(join(root, "src/runtime/localDemo.js"), "mock server\n");
    await expect(
      validateRealServerRuntime({
        serverRoot: root,
        serverNode: process.execPath,
      }),
    ).rejects.toThrow(/missing required marker/u);
  });

  it("uses a strict private filesystem protocol for an unknown-scene fixture", async () => {
    const stateDirectory = await mkdtemp(
      join(tmpdir(), "overgoal-real-smoke-fixture-test-"),
    );
    temporaryDirectories.push(stateDirectory);
    const command = createRealSmokeUnknownSceneCommand({
      commandId: "fixture_command_0001",
      expectedRevision: 7,
      matchId: "match_fixture_0001",
    });

    expect(parseRealSmokeFixtureCommand(command)).toMatchObject({
      commandId: command.command_id,
      expectedRevision: 7,
      matchId: "match_fixture_0001",
    });
    expect(() =>
      parseRealSmokeFixtureCommand({ ...command, unexpected: true }),
    ).toThrow(/unsupported fields/u);

    await publishRealSmokeFixtureCommand(stateDirectory, command);
    const persisted = JSON.parse(
      await (
        await import("node:fs/promises")
      ).readFile(join(stateDirectory, REAL_SMOKE_FIXTURE_COMMAND_FILE), "utf8"),
    );
    expect(persisted).toEqual(command);

    const acknowledgement = {
      action_id: "action_fixture_0001",
      command_id: command.command_id,
      match_id: command.match_id,
      revision: command.expected_revision,
      scene_type: command.scene_type,
      status: "APPLIED",
      version: REAL_SMOKE_FIXTURE_VERSION,
    };
    await writeFile(
      join(stateDirectory, REAL_SMOKE_FIXTURE_ACK_FILE),
      `${JSON.stringify(acknowledgement)}\n`,
      { mode: 0o600 },
    );
    await expect(
      waitForRealSmokeFixtureAcknowledgement(
        stateDirectory,
        command.command_id,
      ),
    ).resolves.toMatchObject({
      actionId: acknowledgement.action_id,
      commandId: command.command_id,
      revision: command.expected_revision,
    });
    expect(parseRealSmokeFixtureAcknowledgement(acknowledgement)).toMatchObject(
      { sceneType: command.scene_type },
    );
  });
});
