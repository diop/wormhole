import { PublicKey, PublicKeyInitData } from "@solana/web3.js";
import { getPostMessageAccounts } from "./instructions";

export interface PostMessageCpiAccounts {
  payer: PublicKey;
  /**
   * seeds = ["Bridge"], seeds::program = wormholeProgram
   */
  wormholeConfig: PublicKey;
  wormholeMessage: PublicKey;
  /**
   * seeds = ["emitter"], seeds::program = cpiProgramId
   */
  wormholeEmitter: PublicKey;
  /**
   * seeds = ["Sequence", wormholeEmitter], seeds::program = wormholeProgram
   */
  wormholeSequence: PublicKey;
  /**
   * seeds = ["fee_collector"], seeds::program = wormholeProgram
   */
  wormholeFeeCollector: PublicKey;
  clock: PublicKey;
  rent: PublicKey;
  systemProgram: PublicKey;
}

/**
 * Generate accounts needed to perform `post_message` instruction
 * as cross-program invocation.
 *
 * @param cpiProgramId
 * @param wormholeProgramId
 * @param payer
 * @param message
 * @returns
 */
export function getPostMessageCpiAccounts(
  cpiProgramId: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  payer: PublicKeyInitData,
  message: PublicKeyInitData
): PostMessageCpiAccounts {
  const accounts = getPostMessageAccounts(
    wormholeProgramId,
    payer,
    cpiProgramId,
    message
  );
  return {
    payer: accounts.payer,
    wormholeConfig: accounts.bridge,
    wormholeMessage: accounts.message,
    wormholeEmitter: accounts.emitter,
    wormholeSequence: accounts.sequence,
    wormholeFeeCollector: accounts.feeCollector,
    clock: accounts.clock,
    rent: accounts.rent,
    systemProgram: accounts.systemProgram,
  };
}
