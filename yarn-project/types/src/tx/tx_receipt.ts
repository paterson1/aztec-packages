import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

import { ContractData } from '../contract_data.js';
import { ExtendedNote } from '../notes/index.js';
import { PublicDataWrite } from '../public_data_write.js';
import { TxHash } from './tx_hash.js';

/**
 * Possible status of a transaction.
 */
export enum TxStatus {
  DROPPED = 'dropped',
  MINED = 'mined',
  PENDING = 'pending',
}

/**
 * Represents a transaction receipt in the Aztec network.
 * Contains essential information about the transaction including its status, origin, and associated addresses.
 */
export class TxReceipt {
  constructor(
    /**
     * A unique identifier for a transaction.
     */
    public txHash: TxHash,
    /**
     * The transaction's status.
     */
    public status: TxStatus,
    /**
     * Description of transaction error, if any.
     */
    public error: string,
    /**
     * The hash of the block containing the transaction.
     */
    public blockHash?: Buffer,
    /**
     * The block number in which the transaction was included.
     */
    public blockNumber?: number,
    /**
     * The deployed contract's address.
     */
    public contractAddress?: AztecAddress,
    /**
     * Information useful for testing/debugging, set when test flag is set to true in `waitOpts`.
     */
    public debugInfo?: DebugInfo,
  ) {}

  /**
   * Convert a Tx class object to a plain JSON object.
   * @returns A plain object with Tx properties.
   */
  public toJSON() {
    return {
      txHash: this.txHash.toString(),
      status: this.status.toString(),
      error: this.error,
      blockHash: this.blockHash?.toString('hex'),
      blockNumber: this.blockNumber,
      contractAddress: this.contractAddress?.toString(),
    };
  }

  /**
   * Convert a plain JSON object to a Tx class object.
   * @param obj - A plain Tx JSON object.
   * @returns A Tx class object.
   */
  public static fromJSON(obj: any) {
    const txHash = TxHash.fromString(obj.txHash);
    const status = obj.status as TxStatus;
    const error = obj.error;
    const blockHash = obj.blockHash ? Buffer.from(obj.blockHash, 'hex') : undefined;
    const blockNumber = obj.blockNumber ? Number(obj.blockNumber) : undefined;
    const contractAddress = obj.contractAddress ? AztecAddress.fromString(obj.contractAddress) : undefined;
    return new TxReceipt(txHash, status, error, blockHash, blockNumber, contractAddress);
  }
}

/**
 * Information useful for debugging/testing purposes included in the receipt when the debug flag is set to true
 * in `WaitOpts`.
 */
interface DebugInfo {
  /**
   * New commitments created by the transaction.
   */
  newCommitments: Fr[];
  /**
   * New nullifiers created by the transaction.
   */
  newNullifiers: Fr[];
  /**
   * New public data writes created by the transaction.
   */
  newPublicDataWrites: PublicDataWrite[];
  /**
   * New L2 to L1 messages created by the transaction.
   */
  newL2ToL1Msgs: Fr[];
  /**
   * New contracts leafs created by the transaction to be inserted into the contract tree.
   */
  newContracts: Fr[];
  /**
   * New contract data created by the transaction.
   */
  newContractData: ContractData[];
  /**
   * Notes created in this tx which belong to accounts which are registered in the PXE which was used to submit the
   * tx. You will not receive notes of accounts which are not registered in the PXE here even though they were
   * created in this tx.
   */
  visibleNotes: ExtendedNote[];
}
