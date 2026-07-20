import { MockConnector } from "@starknet-react/core";
import { Account } from "starknet";

const authorizationKey = "overgoal.local-ci-wallet-authorized";
let connectorSingleton: MockConnector | null = null;
let connectorFixtureKey: string | null = null;

interface LocalCiWalletFixture {
  address: string;
  privateKey: string;
}

declare global {
  var __OVERGOAL_E2E_SWITCH_LOCAL_CI_WALLET__:
    | ((accountIndex: number) => string)
    | undefined;
}

export function createLocalCiConnector(
  encodedWallets: string | undefined,
  nodeUrl: string,
  chainId: bigint,
) {
  if (!encodedWallets) return null;
  const fixtureKey = `${chainId}:${nodeUrl}:${encodedWallets}`;
  if (connectorSingleton) {
    if (connectorFixtureKey !== fixtureKey) {
      throw new Error(
        "LOCAL_CI connector fixtures changed after initialization.",
      );
    }
    return connectorSingleton;
  }

  const fixtures = JSON.parse(encodedWallets) as LocalCiWalletFixture[];
  if (fixtures.length < 2) {
    throw new Error("LOCAL_CI browser auth requires two ephemeral wallets.");
  }
  const accounts = fixtures.map(
    ({ address, privateKey }) =>
      new Account({
        provider: { nodeUrl },
        address,
        signer: privateKey,
        cairoVersion: "1",
      }),
  );
  const connector = new MockConnector({
    accounts: { mainnet: accounts, sepolia: accounts },
    options: { id: "overgoal-local-ci", name: "LOCAL_CI Test Wallet" },
  });
  connector.switchChain(chainId);

  const connect = connector.connect.bind(connector);
  const disconnect = connector.disconnect.bind(connector);
  connector.connect = async () => {
    const connection = await connect();
    localStorage.setItem(authorizationKey, "true");
    return connection;
  };
  connector.ready = async () =>
    localStorage.getItem(authorizationKey) === "true";
  connector.disconnect = async () => {
    localStorage.removeItem(authorizationKey);
    await disconnect();
  };

  Object.defineProperty(globalThis, "__OVERGOAL_E2E_SWITCH_LOCAL_CI_WALLET__", {
    configurable: true,
    value: (accountIndex: number) => {
      const fixture = fixtures[accountIndex];
      if (!fixture) throw new Error("Unknown LOCAL_CI wallet index.");
      connector.switchAccount(accountIndex);
      return fixture.address;
    },
  });
  connectorSingleton = connector;
  connectorFixtureKey = fixtureKey;
  return connector;
}
