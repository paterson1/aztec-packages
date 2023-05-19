// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Constants} from "./Constants.sol";
import {DataStructures} from "./DataStructures.sol";

/**
 * @title Hash library
 * @author Aztec
 * @notice A small library of functions to compute hashes for data structures and convert to field elements
 */
library Hash {
  /**
   * @notice Computes the sha256 hash of the L1 to L2 message and converts it to a field element
   * @param _message - The L1 to L2 message to hash
   * @return The hash of the provided message as a field element
   */
  function sha256ToField(DataStructures.L1ToL2Msg memory _message) internal pure returns (bytes32) {
    return sha256ToField(
      abi.encode(
        _message.sender,
        _message.recipient,
        _message.content,
        _message.secretHash,
        _message.deadline,
        _message.fee
      )
    );
  }

  /**
   * @notice Computes the sha256 hash of the L2 to L1 message and converts it to a field element
   * @param _message - The L2 to L1 message to hash
   * @return The hash of the provided message as a field element
   */
  function sha256ToField(DataStructures.L2ToL1Msg memory _message) internal pure returns (bytes32) {
    return sha256ToField(abi.encode(_message.sender, _message.recipient, _message.content));
  }

  /**
   * @notice Computes the sha256 hash of the provided data and converts it to a field element
   * @dev Using modulo to convert the hash to a field element.
   * @param _data - The bytes to hash
   * @return The hash of the provided data as a field element
   */
  function sha256ToField(bytes memory _data) internal pure returns (bytes32) {
    return bytes32(uint256(sha256(_data)) % Constants.P);
  }
}
