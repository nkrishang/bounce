'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface CountdownTimerProps {
  expirationTimestamp: number;
  onExpire?: () => void;
}

export function CountdownTimer({ expirationTimestamp, onExpire }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = expirationTimestamp - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft('Expired');
        onExpire?.();
        return;
      }

      setIsUrgent(diff < 60);

      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expirationTimestamp, onExpire]);

  return (
    <motion.span
      animate={isUrgent && !isExpired ? { opacity: [1, 0.5, 1] } : {}}
      transition={{ duration: 0.5, repeat: Infinity }}
      className={isExpired ? 'text-danger' : isUrgent ? 'text-warning' : ''}
    >
      {timeLeft}
    </motion.span>
  );
}
