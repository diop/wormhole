import {
  AccountLayout,
  createCloseAccountInstruction,
  createInitializeAccountInstruction,
  createTransferInstruction,
  getMinimumBalanceForRentExemptMint,
  getMint,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  PublicKeyInitData,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { MsgExecuteContract } from "@terra-money/terra.js";
import { Algodv2 } from "algosdk";
import { ethers, Overrides } from "ethers";
import { fromUint8Array } from "js-base64";
import {
  Account as nearAccount,
  providers as nearProviders,
} from "near-api-js";
import BN from "bn.js";
import {
  TransactionSignerPair,
  _parseVAAAlgorand,
  _submitVAAAlgorand,
} from "../algorand";
import { Bridge__factory } from "../ethers-contracts";
import {
  CHAIN_ID_NEAR,
  CHAIN_ID_SOLANA,
  ChainId,
  MAX_VAA_DECIMALS,
  uint8ArrayToHex,
} from "../utils";
import { MsgExecuteContract as MsgExecuteContractInjective } from "@injectivelabs/sdk-ts";
import {
  createCompleteTransferNativeInstruction,
  createCompleteTransferWrappedInstruction,
} from "../solana/tokenBridge";
import { SignedVaa, parseTokenTransferVaa } from "../vaa";
import { getForeignAssetNear } from "./getForeignAsset";

export async function redeemOnEth(
  tokenBridgeAddress: string,
  signer: ethers.Signer,
  signedVAA: Uint8Array,
  overrides: Overrides & { from?: string | Promise<string> } = {}
) {
  const bridge = Bridge__factory.connect(tokenBridgeAddress, signer);
  const v = await bridge.completeTransfer(signedVAA, overrides);
  const receipt = await v.wait();
  return receipt;
}

export async function redeemOnEthNative(
  tokenBridgeAddress: string,
  signer: ethers.Signer,
  signedVAA: Uint8Array,
  overrides: Overrides & { from?: string | Promise<string> } = {}
) {
  const bridge = Bridge__factory.connect(tokenBridgeAddress, signer);
  const v = await bridge.completeTransferAndUnwrapETH(signedVAA, overrides);
  const receipt = await v.wait();
  return receipt;
}

export async function redeemOnTerra(
  tokenBridgeAddress: string,
  walletAddress: string,
  signedVAA: Uint8Array
) {
  return new MsgExecuteContract(walletAddress, tokenBridgeAddress, {
    submit_vaa: {
      data: fromUint8Array(signedVAA),
    },
  });
}

/**
 * Submits the supplied VAA to Injective
 * @param tokenBridgeAddress Address of Inj token bridge contract
 * @param walletAddress Address of wallet in inj format
 * @param signedVAA VAA with the attestation message
 * @returns Message to be broadcast
 */
export async function submitVAAOnInjective(
  tokenBridgeAddress: string,
  walletAddress: string,
  signedVAA: Uint8Array
): Promise<MsgExecuteContractInjective> {
  return MsgExecuteContractInjective.fromJSON({
    contractAddress: tokenBridgeAddress,
    sender: walletAddress,
    msg: {
      data: fromUint8Array(signedVAA),
    },
    action: "submit_vaa",
  });
}
export const redeemOnInjective = submitVAAOnInjective;

export async function redeemAndUnwrapOnSolana(
  connection: Connection,
  bridgeAddress: PublicKeyInitData,
  tokenBridgeAddress: PublicKeyInitData,
  payerAddress: PublicKeyInitData,
  signedVaa: SignedVaa,
  commitment?: Commitment
) {
  const parsed = parseTokenTransferVaa(signedVaa);
  const targetPublicKey = new PublicKey(parsed.to);
  const targetAmount = await getMint(connection, NATIVE_MINT, commitment).then(
    (info) =>
      parsed.amount * BigInt(Math.pow(10, info.decimals - MAX_VAA_DECIMALS))
  );
  const rentBalance = await getMinimumBalanceForRentExemptMint(connection);
  if (Buffer.compare(parsed.tokenAddress, NATIVE_MINT.toBuffer()) != 0) {
    return Promise.reject("tokenAddress != NATIVE_MINT");
  }
  const payerPublicKey = new PublicKey(payerAddress);
  const ancillaryKeypair = Keypair.generate();

  const completeTransferIx = createCompleteTransferNativeInstruction(
    tokenBridgeAddress,
    bridgeAddress,
    payerPublicKey,
    signedVaa
  );

  //This will create a temporary account where the wSOL will be moved
  const createAncillaryAccountIx = SystemProgram.createAccount({
    fromPubkey: payerPublicKey,
    newAccountPubkey: ancillaryKeypair.publicKey,
    lamports: rentBalance, //spl token accounts need rent exemption
    space: AccountLayout.span,
    programId: TOKEN_PROGRAM_ID,
  });

  //Initialize the account as a WSOL account, with the original payerAddress as owner
  const initAccountIx = await createInitializeAccountInstruction(
    ancillaryKeypair.publicKey,
    NATIVE_MINT,
    payerPublicKey
  );

  //Send in the amount of wSOL which we want converted to SOL
  const balanceTransferIx = createTransferInstruction(
    targetPublicKey,
    ancillaryKeypair.publicKey,
    payerPublicKey,
    targetAmount.valueOf()
  );

  //Close the ancillary account for cleanup. Payer address receives any remaining funds
  const closeAccountIx = createCloseAccountInstruction(
    ancillaryKeypair.publicKey, //account to close
    payerPublicKey, //Remaining funds destination
    payerPublicKey //authority
  );

  const { blockhash } = await connection.getLatestBlockhash(commitment);
  const transaction = new Transaction();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payerPublicKey;
  transaction.add(
    completeTransferIx,
    createAncillaryAccountIx,
    initAccountIx,
    balanceTransferIx,
    closeAccountIx
  );
  transaction.partialSign(ancillaryKeypair);
  return transaction;
}

export async function redeemOnSolana(
  connection: Connection,
  bridgeAddress: PublicKeyInitData,
  tokenBridgeAddress: PublicKeyInitData,
  payerAddress: PublicKeyInitData,
  signedVaa: SignedVaa,
  feeRecipientAddress?: PublicKeyInitData,
  commitment?: Commitment
) {
  const parsed = parseTokenTransferVaa(signedVaa);
  const createCompleteTransferInstruction =
    parsed.tokenChain == CHAIN_ID_SOLANA
      ? createCompleteTransferNativeInstruction
      : createCompleteTransferWrappedInstruction;
  const transaction = new Transaction().add(
    createCompleteTransferInstruction(
      tokenBridgeAddress,
      bridgeAddress,
      payerAddress,
      parsed,
      feeRecipientAddress
    )
  );
  const { blockhash } = await connection.getLatestBlockhash(commitment);
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = new PublicKey(payerAddress);
  return transaction;
}

/**
 * This basically just submits the VAA to Algorand
 * @param client AlgodV2 client
 * @param tokenBridgeId Token bridge ID
 * @param bridgeId Core bridge ID
 * @param vaa The VAA to be redeemed
 * @param acct Sending account
 * @returns Transaction ID(s)
 */
export async function redeemOnAlgorand(
  client: Algodv2,
  tokenBridgeId: bigint,
  bridgeId: bigint,
  vaa: Uint8Array,
  senderAddr: string
): Promise<TransactionSignerPair[]> {
  return await _submitVAAAlgorand(
    client,
    tokenBridgeId,
    bridgeId,
    vaa,
    senderAddr
  );
}

/**
 * This basically just submits the VAA to Near
 * @param client
 * @param tokenBridge Token bridge ID
 * @param vaa The VAA to be redeemed
 * @returns Transaction ID(s)
 */
export async function redeemOnNear(
  client: nearAccount,
  tokenBridge: string,
  vaa: Uint8Array
): Promise<String> {
  let p = _parseVAAAlgorand(vaa);

  if (p.ToChain !== CHAIN_ID_NEAR) {
    throw new Error("Not destined for NEAR");
  }

  let user = await client.viewFunction(tokenBridge, "hash_lookup", {
    hash: uint8ArrayToHex(p.ToAddress as Uint8Array),
  });

  if (!user[0]) {
    throw new Error(
      "Unregistered receiver (receiving account is not registered)"
    );
  }

  user = user[1];

  let token = await getForeignAssetNear(
    client,
    tokenBridge,
    p.FromChain as ChainId,
    p.Contract as string
  );

  if (token === "") {
    throw new Error("Unregistered token (this been attested yet?)");
  }

  if (
    (p.Contract as string) !==
    "0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    let bal = await client.viewFunction(token as string, "storage_balance_of", {
      account_id: user,
    });

    if (bal === null) {
      console.log("Registering ", user, " for ", token);
      bal = nearProviders.getTransactionLastResult(
        await client.functionCall({
          contractId: token as string,
          methodName: "storage_deposit",
          args: { account_id: user, registration_only: true },
          gas: new BN("100000000000000"),
          attachedDeposit: new BN("2000000000000000000000"), // 0.002 NEAR
        })
      );
    }

    if (
      p.Fee !== undefined &&
      Buffer.compare(
        p.Fee,
        Buffer.from(
          "0000000000000000000000000000000000000000000000000000000000000000",
          "hex"
        )
      ) !== 0
    ) {
      let bal = await client.viewFunction(
        token as string,
        "storage_balance_of",
        {
          account_id: client.accountId,
        }
      );

      if (bal === null) {
        console.log("Registering ", client.accountId, " for ", token);
        bal = nearProviders.getTransactionLastResult(
          await client.functionCall({
            contractId: token as string,
            methodName: "storage_deposit",
            args: { account_id: client.accountId, registration_only: true },
            gas: new BN("100000000000000"),
            attachedDeposit: new BN("2000000000000000000000"), // 0.002 NEAR
          })
        );
      }
    }
  }

  let result = await client.functionCall({
    contractId: tokenBridge,
    methodName: "submit_vaa",
    args: {
      vaa: uint8ArrayToHex(vaa),
    },
    attachedDeposit: new BN("100000000000000000000000"),
    gas: new BN("150000000000000"),
  });

  result = await client.functionCall({
    contractId: tokenBridge,
    methodName: "submit_vaa",
    args: {
      vaa: uint8ArrayToHex(vaa),
    },
    attachedDeposit: new BN("100000000000000000000000"),
    gas: new BN("150000000000000"),
  });

  return nearProviders.getTransactionLastResult(result);
}
