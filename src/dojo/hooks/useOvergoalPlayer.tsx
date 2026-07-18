import { useAccount } from "@starknet-react/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addAddressPadding } from "starknet";

import { OvergoalPlayer } from "../../lib/schema";
import useAppStore from "../../zustand/store";
import { dojoConfig } from "../dojoConfig";

interface UseOvergoalPlayerReturn {
  isFetched: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// Constants
const TORII_URL = dojoConfig.toriiUrl + "/graphql";
const OVERGOAL_PLAYER_QUERY = `
    query GetOvergoalPlayer($playerId: ContractAddress!) {
        fullStarterReactOvergoalPlayerModels(where: { player_id: $playerId }) {
            edges {
                node {
                    player_id
                    goal_currency
                    energy
                    speed
                    dribble
                    pass
                    vision
                    freekick
                    strength
                    profile_image
                    is_retired
                }
            }
            totalCount
        }
    }
`;

// Helper to convert hex values to numbers
const hexToNumber = (hexValue: string | number): number => {
  if (typeof hexValue === "number") return hexValue;

  if (typeof hexValue === "string" && hexValue.startsWith("0x")) {
    return parseInt(hexValue, 16);
  }

  if (typeof hexValue === "string") {
    return parseInt(hexValue, 10);
  }

  return 0;
};

// Function to fetch overgoal player data from GraphQL
const fetchOvergoalPlayerData = async (
  playerId: string,
): Promise<OvergoalPlayer | null> => {
  try {
    console.log("🔍 Fetching overgoal player with player_id:", playerId);

    const response = await fetch(TORII_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: OVERGOAL_PLAYER_QUERY,
        variables: { playerId },
      }),
    });

    const result = await response.json();
    console.log("📡 GraphQL response:", result);

    if (!result.data?.fullStarterReactOvergoalPlayerModels?.edges?.length) {
      console.log("❌ No overgoal player found in response");
      return null;
    }

    // Extract overgoal player data
    const rawPlayerData =
      result.data.fullStarterReactOvergoalPlayerModels.edges[0].node;
    console.log("📄 Raw overgoal player data:", rawPlayerData);

    // Convert hex values to numbers and create OvergoalPlayer object
    const overgoalPlayerData: OvergoalPlayer = {
      player_id: rawPlayerData.player_id,
      goal_currency: hexToNumber(rawPlayerData.goal_currency),
      energy: hexToNumber(rawPlayerData.energy),
      speed: hexToNumber(rawPlayerData.speed),
      dribble: hexToNumber(rawPlayerData.dribble),
      pass: hexToNumber(rawPlayerData.pass),
      vision: hexToNumber(rawPlayerData.vision),
      freekick: hexToNumber(rawPlayerData.freekick),
      strength: hexToNumber(rawPlayerData.strength),
      profile_image: rawPlayerData.profile_image || null,
      is_retired: Boolean(rawPlayerData.is_retired),
    };

    console.log(
      "✅ Overgoal player data after conversion:",
      overgoalPlayerData,
    );
    return overgoalPlayerData;
  } catch (error) {
    console.error("❌ Error fetching overgoal player:", error);
    throw error;
  }
};

// Main hook
export const useOvergoalPlayer = (): UseOvergoalPlayerReturn => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFetched, setIsFetched] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const { account } = useAccount();

  const setOvergoalPlayer = useAppStore((state) => state.setOvergoalPlayer);

  const userAddress = useMemo(
    () => (account ? addAddressPadding(account.address).toLowerCase() : ""),
    [account],
  );

  const refetch = useCallback(async () => {
    if (!userAddress) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const overgoalPlayerData = await fetchOvergoalPlayerData(userAddress);
      console.log("🎮 Overgoal player data fetched:", overgoalPlayerData);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      setIsFetched(true);

      const updatedOvergoalPlayer = useAppStore.getState().overgoalPlayer;
      console.log(
        "💾 Overgoal player in store after update:",
        updatedOvergoalPlayer,
      );
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Unknown error occurred");
      console.error("❌ Error in refetch:", error);
      setError(error);
      setOvergoalPlayer(null);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, setOvergoalPlayer]);

  useEffect(() => {
    if (userAddress) {
      console.log("🔄 Address changed, refetching overgoal player data");
      refetch();
    }
  }, [userAddress, refetch]);

  useEffect(() => {
    if (!account) {
      console.log("❌ No account, clearing overgoal player data");
      setOvergoalPlayer(null);
      setError(null);
      setIsLoading(false);
    }
  }, [account, setOvergoalPlayer]);

  return {
    isFetched,
    isLoading,
    error,
    refetch,
  };
};
