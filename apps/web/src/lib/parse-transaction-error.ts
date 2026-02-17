'use client';

import type { BaseError } from 'viem';

export interface ParsedError {
  title: string;
  message: string;
}

const CONTRACT_ERROR_MAP: Record<string, ParsedError> = {
  // Factory errors
  InvalidAddress: { title: 'Invalid Address', message: 'Invalid token address provided.' },
  InvalidAmount: { title: 'Invalid Amount', message: 'Invalid trade amount.' },
  InvalidExpirationTimestamp: { title: 'Invalid Expiration', message: 'Invalid expiration time.' },
  // Escrow errors
  AlreadyBought: { title: 'Already Funded', message: 'This trade has already been funded.' },
  AlreadySold: { title: 'Already Sold', message: 'This position has already been sold.' },
  AlreadyWithdrawn: { title: 'Already Withdrawn', message: 'Funds have already been withdrawn.' },
  InsufficientBalance: { title: 'Insufficient Balance', message: 'Insufficient token balance in the escrow.' },
  NotBoughtYet: { title: 'Not Funded', message: "The trade hasn't been funded yet." },
  NotSoldYet: { title: 'Not Sold', message: "The position hasn't been sold yet." },
  NothingToWithdraw: { title: 'Nothing to Withdraw', message: 'No funds available to withdraw.' },
  OnlyFunderOrProposer: { title: 'Unauthorized', message: 'Only the proposer or funder can perform this action.' },
  TradeExpired: { title: 'Trade Expired', message: 'This trade has expired.' },
  TradeNotExpired: { title: 'Trade Not Expired', message: "This trade hasn't expired yet." },
  SwapFailed: { title: 'Swap Failed', message: 'The swap failed. Please try again.' },
  InsufficientOutput: { title: 'Price Impact Too High', message: 'Price moved too much. Please try again with higher slippage.' },
};

export function parseTransactionError(error: unknown): ParsedError {
  if (!error) {
    return {
      title: 'Unknown Error',
      message: 'An unexpected error occurred.',
    };
  }

  const baseError = error as BaseError;
  const errorName = baseError?.name || '';

  // Viem BaseError types
  if (errorName === 'UserRejectedRequestError') {
    return {
      title: 'Transaction Cancelled',
      message: 'You cancelled the transaction.',
    };
  }

  if (errorName === 'ChainDisconnectedError') {
    return {
      title: 'Network Disconnected',
      message: 'Your wallet disconnected from the network. Please reconnect.',
    };
  }

  if (errorName === 'ProviderDisconnectedError') {
    return {
      title: 'Wallet Disconnected',
      message: 'Your wallet disconnected. Please reconnect and try again.',
    };
  }

  if (errorName === 'SwitchChainError') {
    return {
      title: 'Wrong Network',
      message: 'Failed to switch to the correct network. Please switch manually.',
    };
  }

  if (errorName === 'ContractFunctionExecutionError') {
    const revertError = baseError.walk?.((e) => {
      return (e as BaseError)?.name === 'ContractFunctionRevertedError';
    }) as BaseError | null;

    if (revertError) {
      const errorData = (revertError as any)?.data;
      if (errorData?.errorName && CONTRACT_ERROR_MAP[errorData.errorName]) {
        return CONTRACT_ERROR_MAP[errorData.errorName];
      }

      const reason = (revertError as any)?.reason;
      if (reason) {
        if (reason.toLowerCase().includes('insufficient')) {
          return {
            title: 'Insufficient Balance',
            message: "You don't have enough tokens for this transaction.",
          };
        }
        if (reason.toLowerCase().includes('allowance')) {
          return {
            title: 'Approval Required',
            message: 'Token spending approval is required before this transaction.',
          };
        }
        return {
          title: 'Transaction Failed',
          message: reason,
        };
      }

      if (revertError.shortMessage) {
        return {
          title: 'Transaction Failed',
          message: revertError.shortMessage,
        };
      }
    }

    return {
      title: 'Contract Error',
      message: baseError.shortMessage || 'The contract rejected this transaction.',
    };
  }

  if (errorName === 'TransactionExecutionError') {
    const cause = baseError.cause as BaseError | undefined;
    const causeName = cause?.name || '';

    if (causeName === 'InsufficientFundsError') {
      return {
        title: 'Insufficient Funds',
        message: "You don't have enough funds to cover gas fees.",
      };
    }

    if (causeName === 'NonceTooLowError') {
      return {
        title: 'Transaction Already Processed',
        message: 'This transaction was already processed. Please try again.',
      };
    }

    if (causeName === 'FeeCapTooLowError') {
      return {
        title: 'Gas Price Too Low',
        message: 'Gas prices have increased. Please try again.',
      };
    }

    return {
      title: 'Transaction Failed',
      message: baseError.shortMessage || 'The transaction could not be executed.',
    };
  }

  if (errorName === 'EstimateGasExecutionError') {
    return {
      title: 'Transaction Would Fail',
      message: 'Transaction would fail. The contract rejected this operation.',
    };
  }

  if (errorName === 'HttpRequestError') {
    return {
      title: 'Network Error',
      message: 'Network error. Please check your connection and try again.',
    };
  }

  if (baseError.shortMessage) {
    return {
      title: 'Transaction Failed',
      message: baseError.shortMessage,
    };
  }

  // Custom "Transaction reverted" error from sendAndConfirm utility
  if (error instanceof Error && error.message.startsWith('Transaction reverted')) {
    return {
      title: 'Transaction Reverted',
      message: 'The transaction was mined but failed on-chain. Please try again.',
    };
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Timeout errors
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return {
        title: 'Transaction Timeout',
        message: 'The transaction is taking longer than expected. It may still complete.',
      };
    }

    // API/network errors
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused') || msg.includes('failed to fetch')) {
      return {
        title: 'Network Error',
        message: 'Network error. Please check your connection and try again.',
      };
    }

    // Swap/liquidity errors
    if (msg.includes('liquidity') || msg.includes('no route') || msg.includes('insufficient liquidity')) {
      return {
        title: 'Insufficient Liquidity',
        message: 'Not enough liquidity for this trade. Try a smaller amount.',
      };
    }

    // Known application errors
    if (error.message.includes('Insufficient USDC balance')) {
      return {
        title: 'Insufficient Balance',
        message: "You don't have enough USDC for this transaction.",
      };
    }

    if (error.message.includes('No Privy embedded wallet')) {
      return {
        title: 'Wallet Not Ready',
        message: 'Your embedded wallet is not available. Please sign out and sign in again.',
      };
    }

    return {
      title: 'Error',
      message: error.message.length > 150 ? error.message.slice(0, 150) + '...' : error.message,
    };
  }

  return {
    title: 'Unknown Error',
    message: 'An unexpected error occurred. Please try again.',
  };
}
