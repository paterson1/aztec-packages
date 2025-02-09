import { mockTx } from '@aztec/types';

import { TxPool } from './tx_pool.js';

/**
 * Tests a TxPool implementation.
 * @param getTxPool - Gets a fresh TxPool
 */
export function describeTxPool(getTxPool: () => TxPool) {
  let pool: TxPool;

  beforeEach(() => {
    pool = getTxPool();
  });

  it('Adds txs to the pool', async () => {
    const tx1 = mockTx();

    await pool.addTxs([tx1]);
    const poolTx = pool.getTxByHash(await tx1.getTxHash());
    expect(await poolTx!.getTxHash()).toEqual(await tx1.getTxHash());
  });

  it('Removes txs from the pool', async () => {
    const tx1 = mockTx();

    await pool.addTxs([tx1]);
    await pool.deleteTxs([await tx1.getTxHash()]);

    const poolTx = pool.getTxByHash(await tx1.getTxHash());
    expect(poolTx).toBeFalsy();
  });

  it('Returns all transactions in the pool', async () => {
    const tx1 = mockTx(1);
    const tx2 = mockTx(2);
    const tx3 = mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const poolTxs = pool.getAllTxs();
    expect(poolTxs).toHaveLength(3);
    expect(poolTxs).toEqual(expect.arrayContaining([tx1, tx2, tx3]));
  });

  it('Returns all txHashes in the pool', async () => {
    const tx1 = mockTx(1);
    const tx2 = mockTx(2);
    const tx3 = mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const poolTxHashes = pool.getAllTxHashes();
    expect(poolTxHashes).toHaveLength(3);
    expect(poolTxHashes).toEqual(
      expect.arrayContaining([await tx1.getTxHash(), await tx2.getTxHash(), await tx3.getTxHash()]),
    );
  });
}
