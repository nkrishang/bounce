'use client';

import { useState } from 'react';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, ArrowRight, Globe, Loader2, MessageCircle } from 'lucide-react';
import { useTokenList, type TokenInfo } from '@/hooks/use-token-list';
import { TokenAvatar } from './token-avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { cn } from '@/lib/utils';

interface TrendingTokensTableProps {
  onBoostedBuy?: (token: TokenInfo) => void;
}

const CHAIN_META: Record<number, { logo: string; name: string }> = {
  137: { logo: '/logos/polygon-logo.svg', name: 'Polygon' },
  8453: { logo: '/logos/base-logo.svg', name: 'Base' },
  143: { logo: '/logos/monad-logo.svg', name: 'Monad' },
};

// ── Formatters ──────────────────────────────────────────────────────

function formatPrice(price: number | null | undefined): string {
  if (price == null) return '-';
  if (price < 0.0001) {
    const str = price.toFixed(20);
    const match = str.match(/^0\.0*[1-9]/);
    if (match) {
      const zeros = match[0].length - 3;
      const significant = price.toFixed(zeros + 4).slice(match[0].length - 1);
      return `$0.0${zeros > 0 ? String.fromCharCode(8320 + zeros) : ''}${significant}`;
    }
  }
  if (price < 1) return `$${price.toFixed(5)}`;
  if (price < 1000) return `$${price.toFixed(2)}`;
  return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatCompact(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return '-';
  const pct = value * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

function formatHolders(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

// ── Sub-components ──────────────────────────────────────────────────

function PctCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground">-</span>;
  const pct = value * 100;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums',
        pct >= 0
          ? 'text-success bg-success/10'
          : 'text-danger bg-danger/10'
      )}
    >
      {formatPct(value)}
    </span>
  );
}

function SocialLinks({ links }: { links: TokenInfo['socialLinks'] }) {
  if (!links) return null;
  const hasAny = links.website || links.twitter || links.telegram || links.discord;
  if (!hasAny) return null;

  return (
    <div className="flex items-center gap-1.5">
      {links.website && (
        <a href={links.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary transition-colors" title="Website">
          <Globe className="w-3.5 h-3.5" />
        </a>
      )}
      {links.twitter && (
        <a href={links.twitter} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary transition-colors" title="Twitter">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
      )}
      {links.telegram && (
        <a href={links.telegram} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary transition-colors" title="Telegram">
          <MessageCircle className="w-3.5 h-3.5" />
        </a>
      )}
      {links.discord && (
        <a href={links.discord} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary transition-colors" title="Discord">
          <MessageCircle className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

function SortableHeader({
  column,
  label,
  align = 'right',
}: {
  column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (desc?: boolean) => void };
  label: string;
  align?: 'left' | 'right';
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      className={cn(
        'inline-flex items-center gap-1 hover:text-foreground transition-colors -ml-1 px-1 py-0.5 rounded',
        align === 'right' && 'ml-auto',
        sorted && 'text-foreground'
      )}
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {label}
      {sorted === 'asc' ? (
        <ArrowUp className="w-3 h-3" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );
}

// ── Column definitions ──────────────────────────────────────────────

function createColumns(onBoostedBuy?: (token: TokenInfo) => void): ColumnDef<TokenInfo>[] {
  return [
    {
      id: 'chain',
      header: '',
      size: 48,
      enableSorting: false,
      cell: ({ row }) => {
        const chain = CHAIN_META[row.original.networkId];
        if (chain) {
          return (
            <img
              src={chain.logo}
              alt={chain.name}
              title={chain.name}
              className="w-7 h-7 object-contain"
            />
          );
        }
        return (
          <div
            className="w-6 h-6 rounded-full bg-muted-foreground/20 flex items-center justify-center text-[9px] font-bold text-muted-foreground"
            title={`Network ${row.original.networkId}`}
          >
            ?
          </div>
        );
      },
    },
    {
      accessorKey: 'name',
      header: 'Token',
      size: 240,
      enableSorting: false,
      cell: ({ row }) => {
        const token = row.original;
        const logoSrc = token.logoURI || token.imageThumbUrl;
        return (
          <div className="flex items-center gap-3">
            <TokenAvatar
              src={logoSrc}
              name={token.address}
              alt={token.symbol}
              size={36}
              rounded="full"
            />
            <div className="min-w-0">
              <span className="font-semibold text-sm text-foreground truncate block leading-tight">
                {token.name}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground font-medium">
                  {token.symbol}
                </span>
                <SocialLinks links={token.socialLinks} />
              </div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'priceUSD',
      header: ({ column }) => <SortableHeader column={column} label="Price" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm text-foreground tabular-nums">
          {formatPrice(row.original.priceUSD)}
        </span>
      ),
    },
    {
      accessorKey: 'change5m',
      header: ({ column }) => <SortableHeader column={column} label="5m" />,
      cell: ({ row }) => <PctCell value={row.original.change5m} />,
    },
    {
      accessorKey: 'change1h',
      header: ({ column }) => <SortableHeader column={column} label="1h" />,
      cell: ({ row }) => <PctCell value={row.original.change1h} />,
    },
    {
      accessorKey: 'change24h',
      header: ({ column }) => <SortableHeader column={column} label="24h" />,
      cell: ({ row }) => <PctCell value={row.original.change24h} />,
    },
    {
      accessorKey: 'volume24h',
      header: ({ column }) => <SortableHeader column={column} label="Volume" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm text-foreground/80 tabular-nums">
          {formatCompact(row.original.volume24h)}
        </span>
      ),
    },
    {
      accessorKey: 'marketCap',
      header: ({ column }) => <SortableHeader column={column} label="Mkt Cap" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm text-foreground/80 tabular-nums">
          {formatCompact(row.original.marketCap)}
        </span>
      ),
    },
    {
      accessorKey: 'holders',
      header: ({ column }) => <SortableHeader column={column} label="Holders" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm text-foreground/80 tabular-nums">
          {formatHolders(row.original.holders)}
        </span>
      ),
    },
    {
      id: 'trade',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const token = row.original;
        const isSupported = [137, 8453, 143].includes(token.networkId);
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isSupported) onBoostedBuy?.(token);
            }}
            disabled={!isSupported}
            className={cn(
              'group px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-300',
              'disabled:opacity-30 disabled:cursor-not-allowed',
              isSupported && 'animate-btn-glow hover:scale-[1.02] active:scale-[0.98]'
            )}
            style={isSupported ? {
              background: 'linear-gradient(135deg, rgba(236, 194, 94, 0.12), rgba(200, 169, 62, 0.06))',
              border: '1px solid rgba(236, 194, 94, 0.25)',
              color: '#C8A93E',
            } : undefined}
          >
            <span className="flex items-center gap-1.5">
              Boosted Buy
              {isSupported && <ArrowRight size={13} className="transition-transform duration-300 group-hover:translate-x-0.5" />}
            </span>
          </button>
        );
      },
    },
  ];
}

// ── Main component ──────────────────────────────────────────────────

export function TrendingTokensTable({ onBoostedBuy }: TrendingTokensTableProps) {
  const { data: tokens = [], isLoading, error } = useTokenList();
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = createColumns(onBoostedBuy);

  const table = useReactTable({
    data: tokens,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading tokens...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-24">
        <p className="text-danger text-sm">Failed to load trending tokens. Please try again.</p>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="text-center py-24 text-muted-foreground text-sm">
        No trending tokens found
      </div>
    );
  }

  return (
    <div>
      {/* Section header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Trending Tokens
          </h2>
          <span
            className="inline-flex items-center px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
            style={{
              color: '#C8A93E',
              borderColor: 'rgba(200, 169, 62, 0.3)',
              background: 'rgba(200, 169, 62, 0.08)',
            }}
          >
            For Believers
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Propose a trade. You put up 20% stake, Backers fund the rest.
        </p>
      </div>

    <div className="rounded-xl border border-dark-border bg-dark-surface/50 backdrop-blur-sm overflow-hidden">
      <Table className="min-w-[1100px]">
        <colgroup>
          <col className="w-[50px]" />
          <col className="w-[22%]" />
          <col className="w-[9%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[8%]" />
          <col className="w-[170px]" />
        </colgroup>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-white/[0.08] hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'bg-dark-surface/80 text-muted-foreground/80',
                    header.index > 1 && 'text-right'
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn(cell.column.getIndex() > 1 && 'text-right')}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
    </div>
  );
}
