import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import type { Proposal, ProposalStatus } from '@bounce/shared';
import { logger } from '../lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const DATA_FILE = join(DATA_DIR, 'proposals.json');

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readProposals(): Proposal[] {
  ensureDataDir();
  if (!existsSync(DATA_FILE)) {
    return [];
  }
  try {
    const raw = readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as Proposal[];
  } catch {
    logger.warn('Failed to read proposals file, returning empty array');
    return [];
  }
}

function writeProposals(proposals: Proposal[]): void {
  ensureDataDir();
  writeFileSync(DATA_FILE, JSON.stringify(proposals, null, 2));
}

export function getAllProposals(): Proposal[] {
  return readProposals();
}

export function getProposalById(id: string): Proposal | undefined {
  return readProposals().find((p) => p.id === id);
}

export function getProposalsBySafe(safe: string): Proposal[] {
  return readProposals().filter(
    (p) => p.safe.toLowerCase() === safe.toLowerCase()
  );
}

export function getProposalsByUser(address: string): Proposal[] {
  const lower = address.toLowerCase();
  return readProposals().filter(
    (p) =>
      p.proposer.toLowerCase() === lower ||
      (p.funder && p.funder.toLowerCase() === lower)
  );
}

export function createProposal(data: Omit<Proposal, 'id' | 'createdAt' | 'updatedAt'>): Proposal {
  const proposals = readProposals();
  const now = new Date().toISOString();
  const proposal: Proposal = {
    ...data,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  proposals.push(proposal);
  writeProposals(proposals);
  logger.info({ id: proposal.id, proposer: proposal.proposer }, 'Proposal created');
  return proposal;
}

export function updateProposal(id: string, updates: Partial<Proposal>): Proposal | null {
  const proposals = readProposals();
  const index = proposals.findIndex((p) => p.id === id);
  if (index === -1) return null;

  proposals[index] = {
    ...proposals[index]!,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  writeProposals(proposals);
  logger.info({ id, updates: Object.keys(updates) }, 'Proposal updated');
  return proposals[index]!;
}
