import { AztecAddress, BlockHeader, Fr, PublicKey } from '@aztec/circuits.js';
import { computeGlobalsHash } from '@aztec/circuits.js/abis';
import { SerialQueue } from '@aztec/foundation/fifo';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import {
  AztecNode,
  INITIAL_L2_BLOCK_NUM,
  KeyStore,
  L2BlockContext,
  L2BlockL2Logs,
  LogType,
  MerkleTreeId,
  TxHash,
} from '@aztec/types';
import { NoteProcessorCaughtUpStats } from '@aztec/types/stats';

import { DeferredNoteDao } from '../database/deferred_note_dao.js';
import { PxeDatabase } from '../database/index.js';
import { NoteDao } from '../database/note_dao.js';
import { NoteProcessor } from '../note_processor/index.js';

/**
 * The Synchronizer class manages the synchronization of note processors and interacts with the Aztec node
 * to obtain encrypted logs, blocks, and other necessary information for the accounts.
 * It provides methods to start or stop the synchronization process, add new accounts, retrieve account
 * details, and fetch transactions by hash. The Synchronizer ensures that it maintains the note processors
 * in sync with the blockchain while handling retries and errors gracefully.
 */
export class Synchronizer {
  private runningPromise?: RunningPromise;
  private noteProcessors: NoteProcessor[] = [];
  private running = false;
  private initialSyncBlockNumber = INITIAL_L2_BLOCK_NUM - 1;
  private log: DebugLogger;
  private noteProcessorsToCatchUp: NoteProcessor[] = [];

  constructor(private node: AztecNode, private db: PxeDatabase, private jobQueue: SerialQueue, logSuffix = '') {
    this.log = createDebugLogger(logSuffix ? `aztec:pxe_synchronizer_${logSuffix}` : 'aztec:pxe_synchronizer');
  }

  /**
   * Starts the synchronization process by fetching encrypted logs and blocks from a specified position.
   * Continuously processes the fetched data for all note processors until stopped. If there is no data
   * available, it retries after a specified interval.
   *
   * @param limit - The maximum number of encrypted, unencrypted logs and blocks to fetch in each iteration.
   * @param retryInterval - The time interval (in ms) to wait before retrying if no data is available.
   */
  public async start(limit = 1, retryInterval = 1000) {
    if (this.running) {
      return;
    }
    this.running = true;

    await this.jobQueue.put(() => this.initialSync());
    this.log('Initial sync complete');
    this.runningPromise = new RunningPromise(() => this.sync(limit), retryInterval);
    this.runningPromise.start();
    this.log('Started loop');
  }

  protected async initialSync() {
    // fast forward to the latest block
    const [latestBlockNumber, latestBlockHeader] = await Promise.all([
      this.node.getBlockNumber(),
      this.node.getBlockHeader(),
    ]);
    this.initialSyncBlockNumber = latestBlockNumber;
    await this.db.setBlockData(latestBlockNumber, latestBlockHeader);
  }

  /**
   * Fetches encrypted logs and blocks from the Aztec node and processes them for all note processors.
   * If needed, catches up note processors that are lagging behind the main sync, e.g. because we just added a new account.
   *
   * Uses the job queue to ensure that
   * - sync does not overlap with pxe simulations.
   * - one sync is running at a time.
   *
   * @param limit - The maximum number of encrypted, unencrypted logs and blocks to fetch in each iteration.
   * @returns a promise that resolves when the sync is complete
   */
  protected sync(limit: number) {
    return this.jobQueue.put(async () => {
      let moreWork = true;
      // keep external this.running flag to interrupt greedy sync
      while (moreWork && this.running) {
        if (this.noteProcessorsToCatchUp.length > 0) {
          // There is a note processor that needs to catch up. We hijack the main loop to catch up the note processor.
          moreWork = await this.workNoteProcessorCatchUp(limit);
        } else {
          // No note processor needs to catch up. We continue with the normal flow.
          moreWork = await this.work(limit);
        }
      }
    });
  }

  /**
   * Fetches encrypted logs and blocks from the Aztec node and processes them for all note processors.
   *
   * @param limit - The maximum number of encrypted, unencrypted logs and blocks to fetch in each iteration.
   * @returns true if there could be more work, false if we're caught up or there was an error.
   */
  protected async work(limit = 1): Promise<boolean> {
    const from = this.getSynchedBlockNumber() + 1;
    try {
      // Possibly improve after https://github.com/AztecProtocol/aztec-packages/issues/3870
      let encryptedLogs = await this.node.getLogs(from, limit, LogType.ENCRYPTED);
      if (!encryptedLogs.length) {
        return false;
      }

      let unencryptedLogs = await this.node.getLogs(from, limit, LogType.UNENCRYPTED);
      if (!unencryptedLogs.length) {
        return false;
      }

      // Note: If less than `limit` encrypted logs is returned, then we fetch only that number of blocks.
      const blocks = await this.node.getBlocks(from, encryptedLogs.length);
      if (!blocks.length) {
        return false;
      }

      if (blocks.length !== encryptedLogs.length) {
        // "Trim" the encrypted logs to match the number of blocks.
        encryptedLogs = encryptedLogs.slice(0, blocks.length);
      }

      if (blocks.length !== unencryptedLogs.length) {
        // "Trim" the unencrypted logs to match the number of blocks.
        unencryptedLogs = unencryptedLogs.slice(0, blocks.length);
      }

      // attach logs to blocks
      blocks.forEach((block, i) => {
        block.attachLogs(encryptedLogs[i], LogType.ENCRYPTED);
        block.attachLogs(unencryptedLogs[i], LogType.UNENCRYPTED);
      });

      // Wrap blocks in block contexts & only keep those that match our query
      const blockContexts = blocks.filter(block => block.number >= from).map(block => new L2BlockContext(block));

      // Update latest tree roots from the most recent block
      const latestBlock = blockContexts[blockContexts.length - 1];
      await this.setBlockDataFromBlock(latestBlock);

      const logCount = L2BlockL2Logs.getTotalLogCount(encryptedLogs);
      this.log(`Forwarding ${logCount} encrypted logs and blocks to ${this.noteProcessors.length} note processors`);
      for (const noteProcessor of this.noteProcessors) {
        await noteProcessor.process(blockContexts, encryptedLogs);
      }
      return true;
    } catch (err) {
      this.log.error(`Error in synchronizer work`, err);
      return false;
    }
  }

  /**
   * Catch up a note processor that is lagging behind the main sync,
   * e.g. because we just added a new account.
   *
   * @param limit - the maximum number of encrypted, unencrypted logs and blocks to fetch in each iteration.
   * @returns true if there could be more work, false if we're caught up or there was an error.
   */
  protected async workNoteProcessorCatchUp(limit = 1): Promise<boolean> {
    const noteProcessor = this.noteProcessorsToCatchUp[0];
    const toBlockNumber = this.getSynchedBlockNumber();

    if (noteProcessor.status.syncedToBlock >= toBlockNumber) {
      // Note processor already synched, nothing to do
      this.noteProcessorsToCatchUp.shift();
      this.noteProcessors.push(noteProcessor);
      // could be more work if there are more note processors to catch up
      return true;
    }

    const from = noteProcessor.status.syncedToBlock + 1;
    // Ensuring that the note processor does not sync further than the main sync.
    limit = Math.min(limit, toBlockNumber - from + 1);

    if (limit < 1) {
      throw new Error(`Unexpected limit ${limit} for note processor catch up`);
    }

    try {
      let encryptedLogs = await this.node.getLogs(from, limit, LogType.ENCRYPTED);
      if (!encryptedLogs.length) {
        // This should never happen because this function should only be called when the note processor is lagging
        // behind main sync.
        throw new Error('No encrypted logs in processor catch up mode');
      }

      // Note: If less than `limit` encrypted logs is returned, then we fetch only that number of blocks.
      const blocks = await this.node.getBlocks(from, encryptedLogs.length);
      if (!blocks.length) {
        // This should never happen because this function should only be called when the note processor is lagging
        // behind main sync.
        throw new Error('No blocks in processor catch up mode');
      }

      if (blocks.length !== encryptedLogs.length) {
        // "Trim" the encrypted logs to match the number of blocks.
        encryptedLogs = encryptedLogs.slice(0, blocks.length);
      }

      const blockContexts = blocks.map(block => new L2BlockContext(block));

      const logCount = L2BlockL2Logs.getTotalLogCount(encryptedLogs);
      this.log(`Forwarding ${logCount} encrypted logs and blocks to note processor in catch up mode`);
      await noteProcessor.process(blockContexts, encryptedLogs);

      if (noteProcessor.status.syncedToBlock === toBlockNumber) {
        // Note processor caught up, move it to `noteProcessors` from `noteProcessorsToCatchUp`.
        this.log(`Note processor for ${noteProcessor.publicKey.toString()} has caught up`, {
          eventName: 'note-processor-caught-up',
          publicKey: noteProcessor.publicKey.toString(),
          duration: noteProcessor.timer.ms(),
          dbSize: this.db.estimateSize(),
          ...noteProcessor.stats,
        } satisfies NoteProcessorCaughtUpStats);
        this.noteProcessorsToCatchUp.shift();
        this.noteProcessors.push(noteProcessor);
      }
      return true;
    } catch (err) {
      this.log.error(`Error in synchronizer workNoteProcessorCatchUp`, err);
      return false;
    }
  }

  private async setBlockDataFromBlock(latestBlock: L2BlockContext) {
    const { block } = latestBlock;
    if (block.number < this.initialSyncBlockNumber) {
      return;
    }

    const globalsHash = computeGlobalsHash(latestBlock.block.globalVariables);
    const blockHeader = new BlockHeader(
      block.endNoteHashTreeSnapshot.root,
      block.endNullifierTreeSnapshot.root,
      block.endContractTreeSnapshot.root,
      block.endL1ToL2MessageTreeSnapshot.root,
      block.endArchiveSnapshot.root,
      Fr.ZERO, // todo: private kernel vk tree root
      block.endPublicDataTreeSnapshot.root,
      globalsHash,
    );

    await this.db.setBlockData(block.number, blockHeader);
  }

  /**
   * Stops the synchronizer gracefully, interrupting any ongoing sleep and waiting for the current
   * iteration to complete before setting the running state to false. Once stopped, the synchronizer
   * will no longer process blocks or encrypted logs and must be restarted using the start method.
   *
   * @returns A promise that resolves when the synchronizer has successfully stopped.
   */
  public async stop() {
    this.running = false;
    await this.runningPromise?.stop();
    this.log('Stopped');
  }

  /**
   * Add a new account to the Synchronizer with the specified private key.
   * Creates a NoteProcessor instance for the account and pushes it into the noteProcessors array.
   * The method resolves immediately after pushing the new note processor.
   *
   * @param publicKey - The public key for the account.
   * @param keyStore - The key store.
   * @param startingBlock - The block where to start scanning for notes for this accounts.
   * @returns A promise that resolves once the account is added to the Synchronizer.
   */
  public addAccount(publicKey: PublicKey, keyStore: KeyStore, startingBlock: number) {
    const predicate = (x: NoteProcessor) => x.publicKey.equals(publicKey);
    const processor = this.noteProcessors.find(predicate) ?? this.noteProcessorsToCatchUp.find(predicate);
    if (processor) {
      return;
    }

    this.noteProcessorsToCatchUp.push(new NoteProcessor(publicKey, keyStore, this.db, this.node, startingBlock));
  }

  /**
   * Checks if the specified account is synchronized.
   * @param account - The aztec address for which to query the sync status.
   * @returns True if the account is fully synched, false otherwise.
   * @remarks Checks whether all the notes from all the blocks have been processed. If it is not the case, the
   *          retrieved information from contracts might be old/stale (e.g. old token balance).
   * @throws If checking a sync status of account which is not registered.
   */
  public async isAccountStateSynchronized(account: AztecAddress) {
    const completeAddress = await this.db.getCompleteAddress(account);
    if (!completeAddress) {
      throw new Error(`Checking if account is synched is not possible for ${account} because it is not registered.`);
    }
    const findByPublicKey = (x: NoteProcessor) => x.publicKey.equals(completeAddress.publicKey);
    const processor = this.noteProcessors.find(findByPublicKey) ?? this.noteProcessorsToCatchUp.find(findByPublicKey);
    if (!processor) {
      throw new Error(
        `Checking if account is synched is not possible for ${account} because it is only registered as a recipient.`,
      );
    }
    return await processor.isSynchronized();
  }

  private getSynchedBlockNumber() {
    return this.db.getBlockNumber() ?? this.initialSyncBlockNumber;
  }

  /**
   * Checks whether all the blocks were processed (tree roots updated, txs updated with block info, etc.).
   * @returns True if there are no outstanding blocks to be synched.
   * @remarks This indicates that blocks and transactions are synched even if notes are not.
   * @remarks Compares local block number with the block number from aztec node.
   */
  public async isGlobalStateSynchronized() {
    const latest = await this.node.getBlockNumber();
    return latest <= this.getSynchedBlockNumber();
  }

  /**
   * Returns the latest block that has been synchronized by the synchronizer and each account.
   * @returns The latest block synchronized for blocks, and the latest block synched for notes for each public key being tracked.
   */
  public getSyncStatus() {
    const lastBlockNumber = this.getSynchedBlockNumber();
    return {
      blocks: lastBlockNumber,
      notes: Object.fromEntries(this.noteProcessors.map(n => [n.publicKey.toString(), n.status.syncedToBlock])),
    };
  }

  /**
   * Retry decoding any deferred notes for the specified contract address.
   * @param contractAddress - the contract address that has just been added
   */
  public reprocessDeferredNotesForContract(contractAddress: AztecAddress): Promise<void> {
    return this.jobQueue.put(() => this.#reprocessDeferredNotesForContract(contractAddress));
  }

  async #reprocessDeferredNotesForContract(contractAddress: AztecAddress): Promise<void> {
    const deferredNotes = await this.db.getDeferredNotesByContract(contractAddress);

    // group deferred notes by txHash to properly deal with possible duplicates
    const txHashToDeferredNotes: Map<TxHash, DeferredNoteDao[]> = new Map();
    for (const note of deferredNotes) {
      const notesForTx = txHashToDeferredNotes.get(note.txHash) ?? [];
      notesForTx.push(note);
      txHashToDeferredNotes.set(note.txHash, notesForTx);
    }

    // keep track of decoded notes
    const newNotes: NoteDao[] = [];
    // now process each txHash
    for (const deferredNotes of txHashToDeferredNotes.values()) {
      // to be safe, try each note processor in case the deferred notes are for different accounts.
      for (const processor of this.noteProcessors) {
        const decodedNotes = await processor.decodeDeferredNotes(
          deferredNotes.filter(n => n.publicKey.equals(processor.publicKey)),
        );
        newNotes.push(...decodedNotes);
      }
    }

    // now drop the deferred notes, and add the decoded notes
    await this.db.removeDeferredNotesByContract(contractAddress);
    await this.db.addNotes(newNotes);

    newNotes.forEach(noteDao => {
      this.log(
        `Decoded deferred note for contract ${noteDao.contractAddress} at slot ${
          noteDao.storageSlot
        } with nullifier ${noteDao.siloedNullifier.toString()}`,
      );
    });

    // now group the decoded notes by public key
    const publicKeyToNotes: Map<PublicKey, NoteDao[]> = new Map();
    for (const noteDao of newNotes) {
      const notesForPublicKey = publicKeyToNotes.get(noteDao.publicKey) ?? [];
      notesForPublicKey.push(noteDao);
      publicKeyToNotes.set(noteDao.publicKey, notesForPublicKey);
    }

    // now for each group, look for the nullifiers in the nullifier tree
    for (const [publicKey, notes] of publicKeyToNotes.entries()) {
      const nullifiers = notes.map(n => n.siloedNullifier);
      const relevantNullifiers: Fr[] = [];
      for (const nullifier of nullifiers) {
        // NOTE: this leaks information about the nullifiers I'm interested in to the node.
        const found = await this.node.findLeafIndex('latest', MerkleTreeId.NULLIFIER_TREE, nullifier);
        if (found) {
          relevantNullifiers.push(nullifier);
        }
      }
      await this.db.removeNullifiedNotes(relevantNullifiers, publicKey);
    }
  }
}
