import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  PublicKey,
  PublicKeyInitData,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  isBytes,
  ParsedTokenTransferVaa,
  parseTokenTransferVaa,
  SignedVaa,
} from "../../vaa";
import { deriveClaimKey, derivePostedVaaKey } from "../wormhole";
import {
  deriveCustodyKey,
  deriveCustodySignerKey,
  deriveEndpointKey,
  deriveMintAuthorityKey,
  deriveRedeemerAccountKey,
  deriveTokenBridgeConfigKey,
  deriveWrappedMetaKey,
  deriveWrappedMintKey,
} from "./accounts";
import {
  getTransferNativeWithPayloadAccounts,
  getTransferWrappedWithPayloadAccounts,
} from "./instructions";

export interface TransferNativeWithPayloadCpiAccounts {
  payer: PublicKey;
  /**
   * seeds = ["config"], seeds::program = tokenBridgeProgram
   */
  tokenBridgeConfig: PublicKey;
  /**
   * Token account where tokens reside
   */
  fromTokenAccount: PublicKey;
  mint: PublicKey;
  /**
   * seeds = [mint], seeds::program = tokenBridgeProgram
   */
  tokenBridgeCustody: PublicKey;
  /**
   * seeds = ["authority_signer"], seeds::program = tokenBridgeProgram
   */
  tokenBridgeAuthoritySigner: PublicKey;
  /**
   * seeds = ["custody_signer"], seeds::program = tokenBridgeProgram
   */
  tokenBridgeCustodySigner: PublicKey;
  /**
   * seeds = ["Bridge"], seeds::program = wormholeProgram
   */
  wormholeConfig: PublicKey;
  wormholeMessage: PublicKey;
  /**
   * seeds = ["emitter"], seeds::program = tokenBridgeProgram
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
  tokenBridgeSender: PublicKey;
  rent: PublicKey;
  systemProgram: PublicKey;
  tokenProgram: PublicKey;
  wormholeProgram: PublicKey;
}

/**
 * Generate accounts needed to perform `transfer_wrapped_with_payload` instruction
 * as cross-program invocation.
 *
 * @param cpiProgramId
 * @param tokenBridgeProgramId
 * @param wormholeProgramId
 * @param payer
 * @param message
 * @param fromTokenAccount
 * @param mint
 * @returns
 */
export function getTransferNativeWithPayloadCpiAccounts(
  cpiProgramId: PublicKeyInitData,
  tokenBridgeProgramId: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  payer: PublicKeyInitData,
  message: PublicKeyInitData,
  fromTokenAccount: PublicKeyInitData,
  mint: PublicKeyInitData
): TransferNativeWithPayloadCpiAccounts {
  const accounts = getTransferNativeWithPayloadAccounts(
    tokenBridgeProgramId,
    wormholeProgramId,
    payer,
    message,
    fromTokenAccount,
    mint,
    cpiProgramId
  );
  return {
    payer: accounts.payer,
    tokenBridgeConfig: accounts.config,
    fromTokenAccount: accounts.from,
    mint: accounts.mint,
    tokenBridgeCustody: accounts.custody,
    tokenBridgeAuthoritySigner: accounts.authoritySigner,
    tokenBridgeCustodySigner: accounts.custodySigner,
    wormholeConfig: accounts.wormholeConfig,
    wormholeMessage: accounts.wormholeMessage,
    wormholeEmitter: accounts.wormholeEmitter,
    wormholeSequence: accounts.wormholeSequence,
    wormholeFeeCollector: accounts.wormholeFeeCollector,
    clock: accounts.clock,
    tokenBridgeSender: accounts.sender,
    rent: accounts.rent,
    systemProgram: accounts.systemProgram,
    tokenProgram: accounts.tokenProgram,
    wormholeProgram: accounts.wormholeProgram,
  };
}

export interface TransferWrappedWithPayloadCpiAccounts {
  payer: PublicKey;
  /**
   * seeds = ["config"], seeds::program = tokenBridgeProgram
   */
  tokenBridgeConfig: PublicKey;
  /**
   * Token account where tokens reside
   */
  fromTokenAccount: PublicKey;
  /**
   * Token account owner (usually cpiProgramId)
   */
  fromTokenAccountOwner: PublicKey;
  /**
   * seeds = ["wrapped", token_chain, token_address], seeds::program = tokenBridgeProgram
   */
  tokenBridgeWrappedMint: PublicKey;
  /**
   * seeds = ["meta", mint], seeds::program = tokenBridgeProgram
   */
  tokenBridgeWrappedMeta: PublicKey;
  /**
   * seeds = ["authority_signer"], seeds::program = tokenBridgeProgram
   */
  tokenBridgeAuthoritySigner: PublicKey;
  /**
   * seeds = ["Bridge"], seeds::program = wormholeProgram
   */
  wormholeConfig: PublicKey;
  wormholeMessage: PublicKey;
  /**
   * seeds = ["emitter"], seeds::program = tokenBridgeProgram
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
  /**
   * seeds = ["sender"], seeds::program = cpiProgramId
   */
  tokenBridgeSender: PublicKey;
  rent: PublicKey;
  systemProgram: PublicKey;
  tokenProgram: PublicKey;
  wormholeProgram: PublicKey;
}

/**
 * Generate accounts needed to perform `transfer_wrapped_with_payload` instruction
 * as cross-program invocation.
 *
 * @param cpiProgramId
 * @param tokenBridgeProgramId
 * @param wormholeProgramId
 * @param payer
 * @param message
 * @param fromTokenAccount
 * @param tokenChain
 * @param tokenAddress
 * @param [fromTokenAccountOwner]
 * @returns
 */
export function getTransferWrappedWithPayloadCpiAccounts(
  cpiProgramId: PublicKeyInitData,
  tokenBridgeProgramId: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  payer: PublicKeyInitData,
  message: PublicKeyInitData,
  fromTokenAccount: PublicKeyInitData,
  tokenChain: number,
  tokenAddress: Buffer | Uint8Array,
  fromTokenAccountOwner?: PublicKeyInitData
): TransferWrappedWithPayloadCpiAccounts {
  const accounts = getTransferWrappedWithPayloadAccounts(
    tokenBridgeProgramId,
    wormholeProgramId,
    payer,
    message,
    fromTokenAccount,
    fromTokenAccountOwner === undefined ? cpiProgramId : fromTokenAccountOwner,
    tokenChain,
    tokenAddress,
    cpiProgramId
  );
  return {
    payer: accounts.payer,
    tokenBridgeConfig: accounts.config,
    fromTokenAccount: accounts.from,
    fromTokenAccountOwner: accounts.fromOwner,
    tokenBridgeWrappedMint: accounts.mint,
    tokenBridgeWrappedMeta: accounts.wrappedMeta,
    tokenBridgeAuthoritySigner: accounts.authoritySigner,
    wormholeConfig: accounts.wormholeConfig,
    wormholeMessage: accounts.wormholeMessage,
    wormholeEmitter: accounts.wormholeEmitter,
    wormholeSequence: accounts.wormholeSequence,
    wormholeFeeCollector: accounts.wormholeFeeCollector,
    clock: accounts.clock,
    tokenBridgeSender: accounts.sender,
    rent: accounts.rent,
    systemProgram: accounts.systemProgram,
    tokenProgram: accounts.tokenProgram,
    wormholeProgram: accounts.wormholeProgram,
  };
}

export interface CompleteTransferNativeWithPayloadCpiAccounts {
  payer: PublicKey;
  /**
   * seeds = ["config"], seeds::program = tokenBridgeProgram
   */
  tokenBridgeConfig: PublicKey;
  /**
   * seeds = ["PostedVAA", vaa_hash], seeds::program = wormholeProgram
   */
  vaa: PublicKey;
  /**
   * seeds = [emitter_address, emitter_chain, sequence], seeds::program = tokenBridgeProgram
   */
  tokenBridgeClaim: PublicKey;
  /**
   * seeds = [emitter_chain, emitter_address], seeds::program = tokenBridgeProgram
   */
  tokenBridgeForeignEndpoint: PublicKey;
  /**
   * Token account to receive tokens
   */
  toTokenAccount: PublicKey;
  /**
   * seeds = ["redeemer"], seeds::program = cpiProgramId
   */
  tokenBridgeRedeemer: PublicKey;
  toFeesTokenAccount: PublicKey; // this shouldn't exist?
  /**
   * seeds = [mint], seeds::program = tokenBridgeProgram
   */
  tokenBridgeCustody: PublicKey;
  mint: PublicKey;
  /**
   * seeds = ["custody_signer"], seeds::program = tokenBridgeProgram
   */
  tokenBridgeCustodySigner: PublicKey;
  rent: PublicKey;
  systemProgram: PublicKey;
  tokenProgram: PublicKey;
  wormholeProgram: PublicKey;
}

/**
 * Generate accounts needed to perform `complete_native_with_payload` instruction
 * as cross-program invocation.
 *
 * Note: `toFeesTokenAccount` is the same as `toTokenAccount`. For your program,
 * you only need to pass your `toTokenAccount` into the complete transfer
 * instruction for the `toFeesTokenAccount`.
 *
 * @param cpiProgramId
 * @param tokenBridgeProgramId
 * @param wormholeProgramId
 * @param payer
 * @param vaa
 * @returns
 */
export function getCompleteTransferNativeWithPayloadCpiAccounts(
  cpiProgramId: PublicKeyInitData,
  tokenBridgeProgramId: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  payer: PublicKeyInitData,
  vaa: SignedVaa | ParsedTokenTransferVaa
): CompleteTransferNativeWithPayloadCpiAccounts {
  const parsed = isBytes(vaa) ? parseTokenTransferVaa(vaa) : vaa;
  const mint = new PublicKey(parsed.tokenAddress);
  const toTokenAccount = new PublicKey(parsed.to);
  return {
    payer: new PublicKey(payer),
    tokenBridgeConfig: deriveTokenBridgeConfigKey(tokenBridgeProgramId),
    vaa: derivePostedVaaKey(wormholeProgramId, parsed.hash),
    tokenBridgeClaim: deriveClaimKey(
      tokenBridgeProgramId,
      parsed.emitterAddress,
      parsed.emitterChain,
      parsed.sequence
    ),
    tokenBridgeForeignEndpoint: deriveEndpointKey(
      tokenBridgeProgramId,
      parsed.emitterChain,
      parsed.emitterAddress
    ),
    toTokenAccount,
    tokenBridgeRedeemer: deriveRedeemerAccountKey(cpiProgramId),
    toFeesTokenAccount: toTokenAccount,
    tokenBridgeCustody: deriveCustodyKey(tokenBridgeProgramId, mint),
    mint,
    tokenBridgeCustodySigner: deriveCustodySignerKey(tokenBridgeProgramId),
    rent: SYSVAR_RENT_PUBKEY,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    wormholeProgram: new PublicKey(wormholeProgramId),
  };
}

export interface CompleteTransferWrappedWithPayloadCpiAccounts {
  payer: PublicKey;
  /**
   * seeds = ["config"], seeds::program = tokenBridgeProgram
   */
  tokenBridgeConfig: PublicKey;
  /**
   * seeds = ["PostedVAA", vaa_hash], seeds::program = wormholeProgram
   */
  vaa: PublicKey;
  /**
   * seeds = [emitter_address, emitter_chain, sequence], seeds::program = tokenBridgeProgram
   */
  tokenBridgeClaim: PublicKey;
  /**
   * seeds = [emitter_chain, emitter_address], seeds::program = tokenBridgeProgram
   */
  tokenBridgeForeignEndpoint: PublicKey;
  /**
   * Token account to receive tokens
   */
  toTokenAccount: PublicKey;
  /**
   * seeds = ["redeemer"], seeds::program = cpiProgramId
   */
  tokenBridgeRedeemer: PublicKey;
  toFeesTokenAccount: PublicKey; // this shouldn't exist?
  /**
   * seeds = ["wrapped", token_chain, token_address], seeds::program = tokenBridgeProgram
   */
  tokenBridgeWrappedMint: PublicKey;
  /**
   * seeds = ["meta", mint], seeds::program = tokenBridgeProgram
   */
  tokenBridgeWrappedMeta: PublicKey;
  /**
   * seeds = ["mint_signer"], seeds::program = tokenBridgeProgram
   */
  tokenBridgeMintAuthority: PublicKey;
  rent: PublicKey;
  systemProgram: PublicKey;
  tokenProgram: PublicKey;
  wormholeProgram: PublicKey;
}

/**
 * Generate accounts needed to perform `complete_wrapped_with_payload` instruction
 * as cross-program invocation.
 *
 * Note: `toFeesTokenAccount` is the same as `toTokenAccount`. For your program,
 * you only need to pass your `toTokenAccount` into the complete transfer
 * instruction for the `toFeesTokenAccount`.
 *
 * @param cpiProgramId
 * @param tokenBridgeProgramId
 * @param wormholeProgramId
 * @param payer
 * @param vaa
 * @returns
 */
export function getCompleteTransferWrappedWithPayloadCpiAccounts(
  cpiProgramId: PublicKeyInitData,
  tokenBridgeProgramId: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  payer: PublicKeyInitData,
  vaa: SignedVaa | ParsedTokenTransferVaa
): CompleteTransferWrappedWithPayloadCpiAccounts {
  const parsed = isBytes(vaa) ? parseTokenTransferVaa(vaa) : vaa;
  const mint = deriveWrappedMintKey(
    tokenBridgeProgramId,
    parsed.tokenChain,
    parsed.tokenAddress
  );
  const toTokenAccount = new PublicKey(parsed.to);
  return {
    payer: new PublicKey(payer),
    tokenBridgeConfig: deriveTokenBridgeConfigKey(tokenBridgeProgramId),
    vaa: derivePostedVaaKey(wormholeProgramId, parsed.hash),
    tokenBridgeClaim: deriveClaimKey(
      tokenBridgeProgramId,
      parsed.emitterAddress,
      parsed.emitterChain,
      parsed.sequence
    ),
    tokenBridgeForeignEndpoint: deriveEndpointKey(
      tokenBridgeProgramId,
      parsed.emitterChain,
      parsed.emitterAddress
    ),
    toTokenAccount,
    tokenBridgeRedeemer: deriveRedeemerAccountKey(cpiProgramId),
    toFeesTokenAccount: toTokenAccount,
    tokenBridgeWrappedMint: mint,
    tokenBridgeWrappedMeta: deriveWrappedMetaKey(tokenBridgeProgramId, mint),
    tokenBridgeMintAuthority: deriveMintAuthorityKey(tokenBridgeProgramId),
    rent: SYSVAR_RENT_PUBKEY,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    wormholeProgram: new PublicKey(wormholeProgramId),
  };
}
