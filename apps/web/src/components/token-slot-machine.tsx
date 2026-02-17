'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface TokenSlotMachineProps {
  logos: string[];
}

const LOGO_SIZE = 56;
const GAP = 16;
const ITEM_HEIGHT = LOGO_SIZE + GAP;
const SCROLL_DURATION = 25;

export function TokenSlotMachine({ logos }: TokenSlotMachineProps) {
  const [col1, col2] = useMemo(() => {
    const mid = Math.ceil(logos.length / 2);
    return [logos.slice(0, mid), logos.slice(mid)];
  }, [logos]);

  if (logos.length < 4) return null;

  return (
    <>
      {/* Vertical layout on lg+ */}
      <div className="hidden lg:flex gap-4 justify-end overflow-hidden h-[480px] relative">
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#111113] to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#111113] to-transparent z-10 pointer-events-none" />

        <ScrollColumn logos={col1} direction="up" axis="vertical" />
        <ScrollColumn logos={col2} direction="down" axis="vertical" />
      </div>

      {/* Horizontal layout on smaller screens */}
      <div className="flex lg:hidden flex-col gap-4 overflow-hidden w-full h-[152px] relative">
        <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#111113] to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#111113] to-transparent z-10 pointer-events-none" />

        <ScrollColumn logos={col1} direction="up" axis="horizontal" />
        <ScrollColumn logos={col2} direction="down" axis="horizontal" />
      </div>
    </>
  );
}

function ScrollColumn({
  logos,
  direction,
  axis,
}: {
  logos: string[];
  direction: 'up' | 'down';
  axis: 'vertical' | 'horizontal';
}) {
  const tripled = useMemo(() => [...logos, ...logos, ...logos], [logos]);
  const listSize = logos.length * ITEM_HEIGHT;

  if (axis === 'horizontal') {
    return (
      <div className="relative h-[68px] overflow-hidden">
        <motion.div
          className="flex flex-row gap-4"
          animate={{
            x: direction === 'up' ? [0, -listSize] : [-listSize, 0],
          }}
          transition={{
            x: {
              duration: SCROLL_DURATION,
              repeat: Infinity,
              ease: 'linear',
            },
          }}
        >
          {tripled.map((logo, i) => (
            <div
              key={`${i}`}
              className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-[#1e1e22] border border-[#2a2a2e]/50"
            >
              <img
                src={logo}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative w-[72px] overflow-hidden">
      <motion.div
        className="flex flex-col gap-4"
        animate={{
          y: direction === 'up' ? [0, -listSize] : [-listSize, 0],
        }}
        transition={{
          y: {
            duration: SCROLL_DURATION,
            repeat: Infinity,
            ease: 'linear',
          },
        }}
      >
        {tripled.map((logo, i) => (
          <div
            key={`${i}`}
            className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-[#1e1e22] border border-[#2a2a2e]/50"
          >
            <img
              src={logo}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </motion.div>
    </div>
  );
}
