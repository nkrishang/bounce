'use client';

import type { BaseError } from 'viem';

interface ParsedError {
  title: string;
  message: string;
}

export function parseTransactionError(error: unknown): ParsedError {
  if (!error) {
    return {
      title: 'Unknown Error',
      message: 'An unexpected error occurred.',
    };
  }

  const baseError = error as BaseError;
  const errorName = baseError?.name || '';

  if (errorName === 'UserRejectedRequestError') {
    return {
      title: 'Transaction Cancelled',
      message: 'You cancelled the transaction in your wallet.',
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
      const reason = (revertError as any)?.reason;
      if (reason) {
        if (reason.toLowerCase().includes('insufficient')) {
          return {
            title: 'Insufficient Balance',
            message: 'You don\'t have enough tokens for this transaction.',
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
        message: 'You don\'t have enough funds to cover gas fees.',
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

  if (baseError.shortMessage) {
    return {
      title: 'Transaction Failed',
      message: baseError.shortMessage,
    };
  }

  if (error instanceof Error) {
    const msg = error.message;
    
    if (msg.includes('No Privy embedded wallet')) {
      return {
        title: 'Wallet Not Ready',
        message: 'Your embedded wallet is not available. Please sign out and sign in again.',
      };
    }
    
    return {
      title: 'Error',
      message: msg.length > 100 ? msg.slice(0, 100) + '...' : msg,
    };
  }

  return {
    title: 'Unknown Error',
    message: 'An unexpected error occurred. Please try again.',
  };
}
