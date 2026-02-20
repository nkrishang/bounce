export const ThesisFactoryV2Abi = [
  {
    type: 'function',
    name: 'deployGuard',
    inputs: [{ name: 'safe', type: 'address', internalType: 'address' }],
    outputs: [{ name: 'guard', type: 'address', internalType: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createThesis',
    inputs: [
      { name: 'proposer', type: 'address', internalType: 'address' },
      { name: 'funder', type: 'address', internalType: 'address' },
      { name: 'safe', type: 'address', internalType: 'address' },
      { name: 'totalCapital', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: 'settlement', type: 'address', internalType: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getSettlement',
    inputs: [{ name: 'safe', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
] as const;

export const ThesisManagerV2Abi = [
  {
    type: 'function',
    name: 'exchangeApprovalCap',
    inputs: [{ name: 'settlement', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isActive',
    inputs: [{ name: 'settlement', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
] as const;

export const ThesisSettlementV2Abi = [
  {
    type: 'function',
    name: 'proposer',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'funder',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'safe',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalCapital',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'distribute',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isDistributed',
    inputs: [],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
] as const;

export const ThesisGuardV2Abi = [
  {
    type: 'function',
    name: 'thesisManager',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
] as const;

export const PolySafeFactoryAbi = [
  {
    type: 'function',
    name: 'createProxy',
    inputs: [
      { name: 'owner', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: 'proxy', type: 'address', internalType: 'address' }],
    stateMutability: 'nonpayable',
  },
] as const;

export const GnosisSafeAbi = [
  {
    type: 'function',
    name: 'execTransaction',
    inputs: [
      { name: 'to', type: 'address', internalType: 'address' },
      { name: 'value', type: 'uint256', internalType: 'uint256' },
      { name: 'data', type: 'bytes', internalType: 'bytes' },
      { name: 'operation', type: 'uint8', internalType: 'uint8' },
      { name: 'safeTxGas', type: 'uint256', internalType: 'uint256' },
      { name: 'baseGas', type: 'uint256', internalType: 'uint256' },
      { name: 'gasPrice', type: 'uint256', internalType: 'uint256' },
      { name: 'gasToken', type: 'address', internalType: 'address' },
      { name: 'refundReceiver', type: 'address', internalType: 'address payable' },
      { name: 'signatures', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: 'success', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getTransactionHash',
    inputs: [
      { name: 'to', type: 'address', internalType: 'address' },
      { name: 'value', type: 'uint256', internalType: 'uint256' },
      { name: 'data', type: 'bytes', internalType: 'bytes' },
      { name: 'operation', type: 'uint8', internalType: 'uint8' },
      { name: 'safeTxGas', type: 'uint256', internalType: 'uint256' },
      { name: 'baseGas', type: 'uint256', internalType: 'uint256' },
      { name: 'gasPrice', type: 'uint256', internalType: 'uint256' },
      { name: 'gasToken', type: 'address', internalType: 'address' },
      { name: 'refundReceiver', type: 'address', internalType: 'address payable' },
      { name: 'nonce', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nonce',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'setGuard',
    inputs: [{ name: 'guard', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getOwners',
    inputs: [],
    outputs: [{ name: '', type: 'address[]', internalType: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isOwner',
    inputs: [{ name: 'owner', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getThreshold',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
