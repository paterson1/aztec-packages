/**
 * Rollup ABI for viem.
 */
export const RollupAbi = [
  {
    inputs: [],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [],
    name: 'InvalidProof',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'expected',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'actual',
        type: 'bytes32',
      },
    ],
    name: 'InvalidStateHash',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'blockNum',
        type: 'uint256',
      },
    ],
    name: 'L2BlockProcessed',
    type: 'event',
  },
  {
    inputs: [],
    name: 'VERIFIER',
    outputs: [
      {
        internalType: 'contract MockVerifier',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes',
        name: '_proof',
        type: 'bytes',
      },
      {
        internalType: 'bytes',
        name: '_l2Block',
        type: 'bytes',
      },
    ],
    name: 'process',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'rollupStateHash',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const RollupBytecode =
  '0x60a060405234801561001057600080fd5b5060405161001d9061004b565b604051809103906000f080158015610039573d6000803e3d6000fd5b506001600160a01b0316608052610058565b61019d806102cf83390190565b60805161025d6100726000396000604b015261025d6000f3fe608060405234801561001057600080fd5b50600436106100415760003560e01c806308c84e70146100465780631ab9c6031461008a5780637c39d130146100a1575b600080fd5b61006d7f000000000000000000000000000000000000000000000000000000000000000081565b6040516001600160a01b0390911681526020015b60405180910390f35b61009360005481565b604051908152602001610081565b6100b46100af36600461014c565b6100b6565b005b604051823560e01c9081907f655779015b9b95c7fd18f01ea4619ab4c31289bbe134ba85c5b20bcdeb1dabf390600090a250505050565b634e487b7160e01b600052604160045260246000fd5b60008083601f84011261011557600080fd5b50813567ffffffffffffffff81111561012d57600080fd5b60208301915083602082850101111561014557600080fd5b9250929050565b60008060006040848603121561016157600080fd5b833567ffffffffffffffff8082111561017957600080fd5b818601915086601f83011261018d57600080fd5b81358181111561019f5761019f6100ed565b604051601f8201601f19908116603f011681019083821181831017156101c7576101c76100ed565b816040528281528960208487010111156101e057600080fd5b82602086016020830137600060208483010152809750505050602086013591508082111561020d57600080fd5b5061021a86828701610103565b949790965093945050505056fea264697066735822122063bf5f2228c31f0838547369bdc2b91bb35be32ee80fa5c2eb53cd176b575a3464736f6c63430008120033608060405234801561001057600080fd5b5061017d806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c8063937f6a101461003b578063ea50d0e41461005a575b600080fd5b60405168496d2061206d6f636b60b81b81526020015b60405180910390f35b610072610068366004610082565b6001949350505050565b6040519015158152602001610051565b6000806000806040858703121561009857600080fd5b843567ffffffffffffffff808211156100b057600080fd5b818701915087601f8301126100c457600080fd5b8135818111156100d357600080fd5b8860208285010111156100e557600080fd5b60209283019650945090860135908082111561010057600080fd5b818701915087601f83011261011457600080fd5b81358181111561012357600080fd5b8860208260051b850101111561013857600080fd5b9598949750506020019450505056fea264697066735822122079065ece8684a52b261c9ab9f34e06d3a4e53f346b36185587fd3fe29e5c9cc764736f6c63430008120033';