/**
 * The `@aztec/accounts/schnorr` export provides an account contract implementation that uses Schnorr signatures with a Grumpkin key for authentication, and a separate Grumpkin key for encryption.
 * This is the suggested account contract type for most use cases within Aztec.
 *
 * @packageDocumentation
 */
import { AccountManager, Salt } from '@aztec/aztec.js/account';
import { AccountWallet, getWallet } from '@aztec/aztec.js/wallet';
import { AztecAddress } from '@aztec/circuits.js';
import { CompleteAddress, GrumpkinPrivateKey, PXE } from '@aztec/types';

import { SchnorrAccountContract } from './account_contract.js';

export { SchnorrAccountContract };

export { SchnorrAccountContractArtifact } from './artifact.js';

/**
 * Creates an Account Manager that relies on a Grumpkin signing key for authentication.
 * @param pxe - An PXE server instance.
 * @param encryptionPrivateKey - Grumpkin key used for note encryption.
 * @param signingPrivateKey - Grumpkin key used for signing transactions.
 * @param saltOrAddress - Deployment salt or complete address if account contract is already deployed.
 */
export function getSchnorrAccount(
  pxe: PXE,
  encryptionPrivateKey: GrumpkinPrivateKey,
  signingPrivateKey: GrumpkinPrivateKey,
  saltOrAddress?: Salt | CompleteAddress,
): AccountManager {
  return new AccountManager(pxe, encryptionPrivateKey, new SchnorrAccountContract(signingPrivateKey), saltOrAddress);
}

/**
 * Gets a wallet for an already registered account using Schnorr signatures.
 * @param pxe - An PXE server instance.
 * @param address - Address for the account.
 * @param signingPrivateKey - Grumpkin key used for signing transactions.
 * @returns A wallet for this account that can be used to interact with a contract instance.
 */
export function getSchnorrWallet(
  pxe: PXE,
  address: AztecAddress,
  signingPrivateKey: GrumpkinPrivateKey,
): Promise<AccountWallet> {
  return getWallet(pxe, address, new SchnorrAccountContract(signingPrivateKey));
}
