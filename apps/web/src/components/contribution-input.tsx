'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Coins, Wallet } from 'lucide-react';
import { formatUnits } from 'viem';
import { useWalletBalances } from '@/hooks/use-wallet';
import type { Address } from 'viem';

interface ContributionInputProps {
  value: string;
  onChange: (value: string) => void;
  address: Address | undefined;
}

const PRESET_PERCENTAGES = [
  { label: '5%', value: 0.05 },
  { label: '10%', value: 0.1 },
  { label: '50%', value: 0.5 },
] as const;

export function ContributionInput({ value, onChange, address }: ContributionInputProps) {
  const [isCustom, setIsCustom] = useState(true);
  const { data: balances, isLoading: balanceLoading } = useWalletBalances(address);
  const balanceRaw = balances?.[137] ?? '0';

  const balance = useMemo(() => {
    if (!balanceRaw || balanceRaw === '0') return 0;
    return parseFloat(formatUnits(BigInt(balanceRaw), 6));
  }, [balanceRaw]);

  const formattedBalance = useMemo(() => {
    return balance.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [balance]);

  const handlePresetClick = (percentage: number) => {
    const amount = (balance * percentage).toFixed(2);
    onChange(amount);
    setIsCustom(false);
  };

  const handleCustomClick = () => {
    setIsCustom(true);
    onChange('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (newValue === '' || parseFloat(newValue) >= 0) {
      onChange(newValue);
      setIsCustom(true);
    }
  };

  const activePreset = useMemo(() => {
    if (!value || isCustom) return null;
    const numValue = parseFloat(value);
    for (const preset of PRESET_PERCENTAGES) {
      const presetValue = (balance * preset.value).toFixed(2);
      if (presetValue === numValue.toFixed(2)) {
        return preset.value;
      }
    }
    return null;
  }, [value, balance, isCustom]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Coins className="w-4 h-4 text-muted-foreground" />
          Your Contribution (USDC)
        </label>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Wallet className="w-3.5 h-3.5" />
          {balanceLoading ? (
            <span className="animate-pulse">Loading...</span>
          ) : (
            <span>Balance: {formattedBalance} USDC</span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {PRESET_PERCENTAGES.map((preset) => (
          <motion.button
            key={preset.label}
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handlePresetClick(preset.value)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              activePreset === preset.value && !isCustom
                ? 'bg-primary text-primary-foreground'
                : 'bg-background border border-border hover:border-primary'
            }`}
          >
            {preset.label}
          </motion.button>
        ))}
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleCustomClick}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            isCustom
              ? 'bg-primary text-primary-foreground'
              : 'bg-background border border-border hover:border-primary'
          }`}
        >
          Custom
        </motion.button>
      </div>

      <div className="relative">
        <input
          type="number"
          placeholder="Enter amount"
          value={value}
          onChange={handleInputChange}
          min="0.01"
          step="0.01"
          className="w-full px-4 py-3 pr-16 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          required
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
          USDC
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>This is your 20% stake. You&apos;ll ask funders for 4x this amount.</span>
        {balance > 0 && value && parseFloat(value) > balance && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-danger font-medium"
          >
            Exceeds balance
          </motion.span>
        )}
      </div>
    </div>
  );
}
