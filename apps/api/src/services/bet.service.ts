import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const DATA_FILE = join(DATA_DIR, 'bet-metadata.json');

export interface BetMetadataRecord {
  chainId: number;
  betId: number;
  slug: string;
  conditionId: string;
  outcomeIndex: number;
  outcomeTokenId: string;
  isYesOutcome: boolean;
  marketQuestion: string;
  marketImage?: string;
  outcomePrice: string;
  createdAt: string;
  updatedAt: string;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readMetadata(): BetMetadataRecord[] {
  ensureDataDir();
  if (!existsSync(DATA_FILE)) return [];
  try {
    const raw = readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as BetMetadataRecord[];
  } catch {
    logger.warn('Failed to read bet metadata file');
    return [];
  }
}

function writeMetadata(records: BetMetadataRecord[]): void {
  ensureDataDir();
  writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
}

export function getBetMetadata(betId: number): BetMetadataRecord | undefined {
  return readMetadata().find((r) => r.betId === betId);
}

export function getBetMetadataByCondition(conditionId: string): BetMetadataRecord[] {
  return readMetadata().filter(
    (r) => r.conditionId.toLowerCase() === conditionId.toLowerCase()
  );
}

export function getAllBetMetadata(): BetMetadataRecord[] {
  return readMetadata();
}

export function saveBetMetadata(data: Omit<BetMetadataRecord, 'createdAt' | 'updatedAt'>): BetMetadataRecord {
  const records = readMetadata();
  const now = new Date().toISOString();

  // Upsert - update if betId exists, insert if not
  const existingIdx = records.findIndex((r) => r.betId === data.betId);
  const record: BetMetadataRecord = {
    ...data,
    createdAt: existingIdx >= 0 ? records[existingIdx]!.createdAt : now,
    updatedAt: now,
  };

  if (existingIdx >= 0) {
    records[existingIdx] = record;
  } else {
    records.push(record);
  }

  writeMetadata(records);
  logger.info({ betId: data.betId }, 'Bet metadata saved');
  return record;
}

export function deleteBetMetadata(betId: number): boolean {
  const records = readMetadata();
  const filtered = records.filter((r) => r.betId !== betId);
  if (filtered.length === records.length) return false;
  writeMetadata(filtered);
  return true;
}
