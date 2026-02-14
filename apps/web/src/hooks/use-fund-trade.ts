"use client";

import { useState, useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  type Address,
} from "viem";
import { polygon } from "viem/chains";
import { TradeEscrowAbi, ERC20Abi } from "@thesis/contracts";
import type { SwapQuote } from "@thesis/shared";
import { api } from "../lib/api";

type Step = "idle" | "fetching-quote" | "approve" | "buy" | "confirming" | "success";

interface FundTradeParams {
  escrowAddress: Address;
  funderContribution: bigint;
  sellToken: Address;
  buyToken: Address;
}

async function getSwapQuote(params: {
  sellToken: Address;
  buyToken: Address;
  sellAmount: string;
  taker: Address;
  slippageBps?: number;
}): Promise<SwapQuote> {
  const queryParams = new URLSearchParams({
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    taker: params.taker,
  });
  
  if (params.slippageBps) {
    queryParams.append("slippageBps", params.slippageBps.toString());
  }

  return api.get<SwapQuote>(`/swap/quote?${queryParams.toString()}`);
}

export function useFundTrade() {
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  const fundTrade = useCallback(
    async (params: FundTradeParams) => {
      const wallet = wallets.find((w) => w.walletClientType === "privy");
      if (!wallet) throw new Error("No Privy embedded wallet connected");

      setIsLoading(true);
      setError(null);

      try {
        const provider = await wallet.getEthereumProvider();
        const walletClient = createWalletClient({
          chain: polygon,
          transport: custom(provider),
        });

        const publicClient = createPublicClient({
          chain: polygon,
          transport: http(),
        });

        const [address] = await walletClient.getAddresses();

        // Step 1: Approve escrow to pull funder's contribution
        setStep("approve");
        const approveHash = await walletClient.writeContract({
          address: params.sellToken,
          abi: ERC20Abi,
          functionName: "approve",
          args: [params.escrowAddress, params.funderContribution],
          account: address,
        });

        console.log("Approve tx:", approveHash);
        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        // Step 2: Get swap quote from 0x API
        // Total swap amount = proposer (20%) + funder (80%) = funderContribution * 1.25
        setStep("fetching-quote");
        const totalSellAmount = (params.funderContribution * 5n) / 4n; // funder is 80%, total is 100%
        
        const quote = await getSwapQuote({
          sellToken: params.sellToken,
          buyToken: params.buyToken,
          sellAmount: totalSellAmount.toString(),
          taker: params.escrowAddress, // Escrow is the one making the swap
          slippageBps: 100, // 1% slippage
        });

        console.log("0x Quote received:", {
          sellAmount: quote.sellAmount,
          buyAmount: quote.buyAmount,
          minBuyAmount: quote.minBuyAmount,
          route: quote.route.fills.map(f => f.source).join(" -> "),
        });

        // Step 3: Execute buy with 0x quote
        setStep("buy");
        const buyHash = await walletClient.writeContract({
          address: params.escrowAddress,
          abi: TradeEscrowAbi,
          functionName: "buy",
          args: [
            BigInt(quote.minBuyAmount),
            quote.swapTarget,
            quote.swapCallData,
          ],
          account: address,
          gas: 2000000n,
        });

        console.log("Buy tx:", buyHash);

        setStep("confirming");
        await publicClient.waitForTransactionReceipt({ hash: buyHash });

        await queryClient.invalidateQueries({ queryKey: ["trades"] });
        await queryClient.invalidateQueries({ queryKey: ["userTrades"] });
        await queryClient.invalidateQueries({
          queryKey: ["trade", params.escrowAddress],
        });

        setStep("success");
        return buyHash;
      } catch (err) {
        console.error("Fund trade error:", err);
        setError(err instanceof Error ? err.message : "Failed to fund trade");
        setIsLoading(false);
        setStep("idle");
        throw err;
      }
    },
    [wallets, queryClient],
  );

  return {
    fundTrade,
    isLoading,
    step,
    error,
  };
}
