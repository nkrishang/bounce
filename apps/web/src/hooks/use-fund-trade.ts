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
import { TradeEscrowAbi, ERC20Abi, getChain, type ChainId } from "@thesis/contracts";
import type { SwapQuote } from "@thesis/shared";
import { api } from "../lib/api";
import { patchTradeInCache } from "@/lib/trade-cache";

type Step = "idle" | "fetching-quote" | "approve" | "buy" | "confirming" | "success";

const RPC_URLS: Record<number, string> = {
  137: process.env.NEXT_PUBLIC_POLYGON_RPC_URL || '',
  8453: process.env.NEXT_PUBLIC_BASE_RPC_URL || '',
  143: process.env.NEXT_PUBLIC_MONAD_RPC_URL || '',
};

interface FundTradeParams {
  chainId: ChainId;
  escrowAddress: Address;
  funderContribution: bigint;
  sellToken: Address;
  buyToken: Address;
}

async function getSwapQuote(chainId: number, params: {
  sellToken: Address;
  buyToken: Address;
  sellAmount: string;
  taker: Address;
  slippageBps?: number;
}): Promise<SwapQuote> {
  const queryParams = new URLSearchParams({
    chainId: chainId.toString(),
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

  const reset = useCallback(() => {
    setStep("idle");
    setIsLoading(false);
    setError(null);
  }, []);

  const fundTrade = useCallback(
    async (params: FundTradeParams) => {
      const wallet = wallets.find((w) => w.walletClientType === "privy");
      if (!wallet) throw new Error("No Privy embedded wallet connected");

      setIsLoading(true);
      setError(null);

      try {
        await wallet.switchChain(params.chainId);

        const provider = await wallet.getEthereumProvider();
        const walletClient = createWalletClient({
          chain: getChain(params.chainId),
          transport: custom(provider),
        });

        const publicClient = createPublicClient({
          chain: getChain(params.chainId),
          transport: http(RPC_URLS[params.chainId] || undefined),
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
        
        const quote = await getSwapQuote(params.chainId, {
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

        await api.post('/trades/refresh', {
          chainId: params.chainId,
          escrowAddress: params.escrowAddress,
        }).catch(() => {});

        setStep("success");

        // Delay optimistic patch so the modal's success effect fires before
        // the trade is removed from the OPEN list (which unmounts the modal).
        const proposerContribution = totalSellAmount - params.funderContribution;

        setTimeout(() => {
          patchTradeInCache(queryClient, params.escrowAddress, (trade) => ({
            ...trade,
            status: 'FUNDED',
            canBuy: false,
            state: {
              ...trade.state,
              buyPerformed: true,
              funder: address,
              funderContribution: params.funderContribution.toString(),
              proposerContribution: proposerContribution.toString(),
              totalSellIn: totalSellAmount.toString(),
            },
          }));
        }, 1000);

        queryClient.invalidateQueries({ queryKey: ["trades"] });
        queryClient.invalidateQueries({ queryKey: ["userTrades"] });
        queryClient.invalidateQueries({
          queryKey: ["trade", params.escrowAddress],
        });

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
    reset,
    isLoading,
    step,
    error,
  };
}
