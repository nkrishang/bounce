'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, Check, X, Loader2, Plus, ExternalLink } from 'lucide-react';
import { useTokenList, type TokenInfo } from '@/hooks/use-token-list';
import { useVerifyToken, type VerificationStatus } from '@/hooks/use-verify-token';
import type { Address } from 'viem';

const MONAD_EXPLORER_URL = 'https://monadexplorer.com';

interface TokenSelectorProps {
  value: string;
  onChange: (address: string, token?: TokenInfo) => void;
  usdcAddress?: string;
}

export function TokenSelector({ value, onChange, usdcAddress }: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customAddress, setCustomAddress] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: tokens = [], isLoading: tokensLoading } = useTokenList();
  const { status, error, tokenData } = useVerifyToken(isCustomMode ? customAddress : undefined);

  const filteredTokens = useMemo(() => {
    const lowercaseSearch = search.toLowerCase();
    return tokens.filter(
      (token) =>
        token.address.toLowerCase() !== usdcAddress?.toLowerCase() &&
        (token.symbol.toLowerCase().includes(lowercaseSearch) ||
          token.name.toLowerCase().includes(lowercaseSearch) ||
          token.address.toLowerCase().includes(lowercaseSearch))
    );
  }, [tokens, search, usdcAddress]);

  const selectedToken = useMemo(() => {
    if (!value) return null;
    return tokens.find((t) => t.address.toLowerCase() === value.toLowerCase());
  }, [tokens, value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectToken = (token: TokenInfo) => {
    onChange(token.address, token);
    setIsOpen(false);
    setSearch('');
    setIsCustomMode(false);
  };

  const handleCustomSubmit = () => {
    if (status === 'valid' && customAddress) {
      onChange(customAddress);
      setIsOpen(false);
      setIsCustomMode(false);
      setCustomAddress('');
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <motion.button
        type="button"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all flex items-center justify-between gap-3"
      >
        {selectedToken ? (
          <div className="flex items-center gap-3">
            {selectedToken.logoURI ? (
              <img
                src={selectedToken.logoURI}
                alt={selectedToken.symbol}
                className="w-6 h-6 rounded-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                {selectedToken.symbol.charAt(0)}
              </div>
            )}
            <div className="text-left">
              <div className="font-medium">{selectedToken.symbol}</div>
              <div className="text-xs text-muted-foreground">{selectedToken.name}</div>
            </div>
          </div>
        ) : value && tokenData ? (
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
              {tokenData.symbol.charAt(0)}
            </div>
            <div className="text-left">
              <div className="font-medium">{tokenData.symbol}</div>
              <div className="text-xs text-muted-foreground">{tokenData.name}</div>
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">Select a token</span>
        )}
        <ChevronDown
          className={`w-5 h-5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </motion.button>

      {value && (
        <a
          href={`${MONAD_EXPLORER_URL}/address/${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="font-mono">{value.slice(0, 6)}...{value.slice(-4)}</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 bg-background border border-border rounded-lg shadow-xl z-50 overflow-hidden"
          >
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search tokens..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-muted border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {tokensLoading ? (
                <div className="p-4 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {filteredTokens.map((token) => (
                    <button
                      key={token.address}
                      type="button"
                      onClick={() => handleSelectToken(token)}
                      className="w-full px-4 py-3 flex items-center gap-3 transition-colors duration-75 hover:bg-[rgba(139,92,246,0.25)]"
                    >
                      {token.logoURI ? (
                        <img
                          src={token.logoURI}
                          alt={token.symbol}
                          className="w-8 h-8 rounded-full"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold">
                          {token.symbol.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 text-left">
                        <div className="font-medium">{token.symbol}</div>
                        <div className="text-xs text-muted-foreground">{token.name}</div>
                      </div>
                      {value.toLowerCase() === token.address.toLowerCase() && (
                        <Check className="w-4 h-4 text-primary" />
                      )}
                    </button>
                  ))}

                  {filteredTokens.length === 0 && !isCustomMode && (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No tokens found
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-3 border-t border-border">
              {!isCustomMode ? (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsCustomMode(true)}
                  className="w-full py-2 px-4 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center gap-2 text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Custom Token
                </motion.button>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="0x... (token contract address)"
                      value={customAddress}
                      onChange={(e) => setCustomAddress(e.target.value)}
                      className="w-full px-4 py-2 pr-10 rounded-lg bg-muted border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm font-mono"
                      autoFocus
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <VerificationIcon status={status} />
                    </div>
                  </div>

                  <AnimatePresence mode="wait">
                    {status === 'valid' && tokenData && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-3 rounded-lg bg-success/10 border border-success/20"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-success">{tokenData.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {customAddress.slice(0, 6)}...{customAddress.slice(-4)}
                          </span>
                        </div>
                      </motion.div>
                    )}

                    {status === 'invalid' && error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm"
                      >
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex gap-2">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setIsCustomMode(false);
                        setCustomAddress('');
                      }}
                      className="flex-1 py-2 px-4 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleCustomSubmit}
                      disabled={status !== 'valid'}
                      className="flex-1 py-2 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Confirm
                    </motion.button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VerificationIcon({ status }: { status: VerificationStatus }) {
  return (
    <AnimatePresence mode="wait">
      {status === 'verifying' && (
        <motion.div
          key="verifying"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
        >
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </motion.div>
      )}
      {status === 'valid' && (
        <motion.div
          key="valid"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
        >
          <Check className="w-4 h-4 text-success" />
        </motion.div>
      )}
      {status === 'invalid' && (
        <motion.div
          key="invalid"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
        >
          <X className="w-4 h-4 text-danger" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
