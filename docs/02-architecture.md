# 2. Architecture - Dojo Game Starter Integration

## 🏗️ System Architecture Overview

The Dojo Game Starter implements a **layered architecture** that cleanly separates concerns while maintaining tight integration between React frontend and Dojo smart contracts. This design ensures scalability, maintainability, and excellent developer experience.

```
┌─────────────────────────────────────────────────────────────────┐
│                     REACT APPLICATION LAYER                     │
├─────────────────────────────────────────────────────────────────┤
│  🎨 UI Components    │  🎯 Game Actions  │  📊 Player Stats     │
│  - status-bar.tsx    │  - game-actions   │  - player-stats     │
│  - homescreen.tsx    │  - game-section   │  - progress bars    │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC LAYER                         │
├─────────────────────────────────────────────────────────────────┤
│  🔗 Custom Hooks     │  🏪 Zustand Store │  🎮 Game Context    │
│  - usePlayer         │  - Global State   │  - Game State       │
│  - useSpawnPlayer    │  - Optimistic UI  │  - Session Data     │
│  - useStarknetConnect│  - Persistence    │  - User Preferences │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INTEGRATION LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│  🌐 Providers        │  🔧 Configuration │  🎯 Contract Types  │
│  - DojoSdkProvider   │  - dojoConfig     │  - bindings.ts      │
│  - StarknetProvider  │  - manifest       │  - contracts.gen    │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BLOCKCHAIN LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│  ⚡ Starknet Network │  🎮 Dojo Engine   │  📊 Torii Indexer  │
│  - Transaction Layer │  - ECS Architecture│  - GraphQL Queries │
│  - Wallet Integration│  - Smart Contracts │  - Real-time Data  │
└─────────────────────────────────────────────────────────────────┘
```

## 🔧 Core Architecture Components

### 1. **Application Entry Point** (`main.tsx`)

The application bootstrap orchestrates the entire system initialization:

```typescript
// main.tsx - Complete initialization flow
async function main() {
  // 1. Initialize Dojo SDK
  const sdk = await init<SchemaType>({
    client: {
      toriiUrl: dojoConfig.toriiUrl,
      relayUrl: dojoConfig.relayUrl,
      worldAddress: dojoConfig.manifest.world.address,
    },
    domain: {
      name: "DojoGameStarter",
      version: "1.0",
      chainId: "KATANA",
      revision: "1",
    },
  });

  // 2. Render with nested providers
  createRoot(rootElement).render(
    <StrictMode>
      <DojoSdkProvider sdk={sdk} dojoConfig={dojoConfig} clientFn={setupWorld}>
        <StarknetProvider>
          <App />
        </StarknetProvider>
      </DojoSdkProvider>
    </StrictMode>
  );
}
```

**🎯 Key Responsibilities:**

- **Dojo SDK Initialization**: Connects to Torii indexer and Starknet network
- **Provider Hierarchy**: Establishes the context provider tree
- **Error Handling**: Graceful fallbacks if initialization fails
- **Type Safety**: Configures TypeScript integration with smart contracts

### 2. **Provider Layer Architecture**

#### **DojoSdkProvider** (Outer Provider)

- **Purpose**: Provides Dojo-specific functionality and client access
- **Scope**: Makes Dojo SDK available throughout the component tree
- **Key Features**: Contract interaction, entity querying, transaction handling

#### **StarknetProvider** (Inner Provider)

- **Purpose**: Handles Starknet blockchain connection and wallet integration
- **Configuration**: Network selection, RPC URLs, wallet connectors

```typescript
// starknet-provider.tsx - Environment-aware configuration
export default function StarknetProvider({ children }: PropsWithChildren) {
  const { VITE_PUBLIC_DEPLOY_TYPE } = import.meta.env;

  const getRpcUrl = () => {
    switch (VITE_PUBLIC_DEPLOY_TYPE) {
      case "mainnet": return "https://api.cartridge.gg/x/starknet/mainnet";
      case "sepolia": return "https://api.cartridge.gg/x/starknet/sepolia";
      default: return "https://api.cartridge.gg/x/starknet/sepolia";
    }
  };

  const provider = jsonRpcProvider({
    rpc: () => ({ nodeUrl: getRpcUrl() }),
  });

  return (
    <StarknetConfig
      autoConnect
      chains={VITE_PUBLIC_DEPLOY_TYPE === "mainnet" ? [mainnet] : [sepolia]}
      connectors={[cartridgeConnector]}
      provider={provider}
    >
      {children}
    </StarknetConfig>
  );
}
```

### 3. **Configuration Layer**

#### **Dojo Configuration** (`dojoConfig.ts`)

Centralizes all Dojo-related settings and network endpoints:

```typescript
export const dojoConfig = createDojoConfig({
  manifest,
  masterAddress: VITE_PUBLIC_MASTER_ADDRESS,
  rpcUrl: VITE_PUBLIC_NODE_URL || "https://api.cartridge.gg/x/starknet/sepolia",
  toriiUrl: VITE_PUBLIC_TORII || "https://api.cartridge.gg/x/myproject/torii",
});
```

#### **Cartridge Connector** (`cartridgeConnector.tsx`)

Configures the gaming-focused wallet integration:

```typescript
// Session policies for seamless gaming experience
const policies: SessionPolicies = {
  contracts: {
    [CONTRACT_ADDRESS_GAME]: {
      methods: [
        { name: "spawn_player", entrypoint: "spawn_player" },
        { name: "train", entrypoint: "train" },
        { name: "mine", entrypoint: "mine" },
        { name: "rest", entrypoint: "rest" },
      ],
    },
  },
};

const options: ControllerOptions = {
  chains: [{ rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia" }],
  defaultChainId: constants.StarknetChainId.SN_SEPOLIA,
  policies,
  theme: "full-starter-react",
  colorMode: "dark",
  namespace: "universe",
  slot: "full-starter-react",
};
```

### 4. **Contract Integration Layer**

#### **Type Definitions** (`bindings.ts`)

Provides TypeScript interfaces for all Dojo models:

```typescript
export interface Player {
  owner: string;
  experience: number;
  health: number;
  coins: number;
  creation_day: number;
}

export const schema: SchemaType = {
  universe: {
    Player: {
      owner: "",
      experience: 0,
      health: 0,
      coins: 0,
      creation_day: 0,
    },
  },
};
```

#### **Contract Functions** (`contracts.gen.ts`)

Auto-generated functions for smart contract interaction:

```typescript
export function setupWorld(provider: DojoProvider) {
  const game_train = async (snAccount: Account | AccountInterface) => {
    try {
      return await provider.execute(
        snAccount as any,
        build_game_train_calldata(),
        "universe",
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  return {
    game: {
      train: game_train,
      mine: game_mine,
      rest: game_rest,
      spawnPlayer: game_spawnPlayer,
    },
  };
}
```

## 🔄 Data Flow Architecture

### **Read Operations (Query Flow)**

```
1. Component Mount
   ↓
2. Custom Hook (usePlayer)
   ↓
3. GraphQL Query to Torii
   ↓
4. Blockchain Data Retrieved
   ↓
5. Zustand Store Updated
   ↓
6. Component Re-renders
```

### **Write Operations (Transaction Flow)**

```
1. User Action (Click "Train")
   ↓
2. Custom Hook (useTrainAction)
   ↓
3. Optimistic UI Update (Zustand)
   ↓
4. Component Re-renders (Instant)
   ↓
5. Transaction Sent to Blockchain
   ↓
6. Confirmation/Rollback
   ↓
7. Final State Update
```

## 🎯 Hook Architecture Pattern

The system uses a **layered hook pattern** for maximum reusability and separation of concerns:

### **Connection Hooks**

- `useStarknetConnect`: Wallet connection management
- `useDojoSDK`: Dojo client access and configuration

### **Data Hooks**

- `usePlayer`: Player data queries and state management
- `useSpawnPlayer`: Player initialization logic

### **Action Hooks**

- `useTrainAction`: Training action with optimistic updates
- `useMineAction`: Mining action with state management
- `useRestAction`: Rest action with health recovery

### **State Management Hooks**

- Custom Zustand selectors for optimized re-renders
- Computed properties for derived state

## 🚀 Performance Optimizations

### **1. Selective State Subscriptions**

```typescript
// Optimized selector pattern
const { player, coins } = useAppStore((state) => ({
  player: state.player,
  coins: state.player?.coins || 0,
}));
```

### **2. Optimistic Updates**

- Immediate UI feedback for better UX
- Background blockchain confirmation
- Automatic rollback on transaction failure

### **3. Provider Scoping**

- DojoSdkProvider for contract interactions
- StarknetProvider for wallet/network management
- Minimal context re-renders through proper provider hierarchy

## 🛡️ Error Handling Strategy

### **1. Layered Error Boundaries**

- Application-level error catching
- Component-level error recovery
- Hook-level error state management

### **2. Graceful Degradation**

- Fallback UI when blockchain unavailable
- Retry mechanisms for failed transactions
- User-friendly error messages

### **3. State Consistency**

- Transaction status tracking
- Rollback mechanisms for failed operations
- State validation and recovery

## 📈 Scalability Considerations

### **1. Modular Architecture**

- Each layer can be extended independently
- New game features require minimal changes to existing code
- Clean separation allows for easy testing

### **2. Hook Composability**

- Hooks can be combined for complex operations
- Reusable patterns across different game mechanics
- Consistent error handling and state management

### **3. Type Safety**

- End-to-end TypeScript integration
- Contract changes automatically propagate to frontend
- Compile-time error detection

---

This architecture provides a robust foundation for building complex onchain games while maintaining clean code organization and excellent developer experience. The layered approach ensures that each component has a single responsibility while working together seamlessly to create a smooth user experience.

**Next**: We'll dive into [**Core Files**](./03-core-files.md) to understand the implementation details of each architectural component.
