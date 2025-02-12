import { AztecAddress, Fr, Point, PublicKey, Vector } from '@aztec/circuits.js';
import { serializeToBuffer } from '@aztec/circuits.js/utils';
import { BufferReader, Note, TxHash } from '@aztec/types';

/**
 * A note that is intended for us, but we cannot decode it yet because the contract is not yet in our database.
 *
 * So keep the state that we need to decode it later.
 */
export class DeferredNoteDao {
  constructor(
    /** The public key associated with this note */
    public publicKey: PublicKey,
    /** The note as emitted from the Noir contract. */
    public note: Note,
    /** The contract address this note is created in. */
    public contractAddress: AztecAddress,
    /** The specific storage location of the note on the contract. */
    public storageSlot: Fr,
    /** The hash of the tx the note was created in. */
    public txHash: TxHash,
    /** The first nullifier emitted by the transaction */
    public txNullifier: Fr,
    /** New commitments in this transaction, one of which belongs to this note */
    public newCommitments: Fr[],
    /** The next available leaf index for the note hash tree for this transaction */
    public dataStartIndexForTx: number,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer(
      this.publicKey.toBuffer(),
      this.note.toBuffer(),
      this.contractAddress.toBuffer(),
      this.storageSlot.toBuffer(),
      this.txHash.toBuffer(),
      this.txNullifier.toBuffer(),
      new Vector(this.newCommitments),
      this.dataStartIndexForTx,
    );
  }
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new DeferredNoteDao(
      reader.readObject(Point),
      reader.readObject(Note),
      reader.readObject(AztecAddress),
      reader.readObject(Fr),
      reader.readObject(TxHash),
      reader.readObject(Fr),
      reader.readVector(Fr),
      reader.readNumber(),
    );
  }
}
