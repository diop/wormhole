import {
  Commitment,
  Connection,
  PublicKey,
  PublicKeyInitData,
  Transaction,
} from "@solana/web3.js";
import { MsgExecuteContract } from "@terra-money/terra.js";
import { Algodv2 } from "algosdk";
import { ethers, Overrides } from "ethers";
import { fromUint8Array } from "js-base64";
import { TransactionSignerPair, _submitVAAAlgorand } from "../algorand";
import { Bridge__factory } from "../ethers-contracts";
import { submitVAAOnInjective } from "./redeem";
import { Account as nearAccount, providers as nearProviders } from "near-api-js";
import BN from "bn.js";
import { createCreateWrappedInstruction } from "../solana/tokenBridge";
import { SignedVaa } from "../vaa";

export async function createWrappedOnEth(
  tokenBridgeAddress: string,
  signer: ethers.Signer,
  signedVAA: Uint8Array,
  overrides: Overrides & { from?: string | Promise<string> } = {}
): Promise<ethers.ContractReceipt> {
  const bridge = Bridge__factory.connect(tokenBridgeAddress, signer);
  const v = await bridge.createWrapped(signedVAA, overrides);
  const receipt = await v.wait();
  return receipt;
}

export async function createWrappedOnTerra(
  tokenBridgeAddress: string,
  walletAddress: string,
  signedVAA: Uint8Array
): Promise<MsgExecuteContract> {
  return new MsgExecuteContract(walletAddress, tokenBridgeAddress, {
    submit_vaa: {
      data: fromUint8Array(signedVAA),
    },
  });
}

export const createWrappedOnInjective = submitVAAOnInjective;

export async function createWrappedOnSolana(
  connection: Connection,
  bridgeAddress: PublicKeyInitData,
  tokenBridgeAddress: PublicKeyInitData,
  payerAddress: PublicKeyInitData,
  signedVaa: SignedVaa,
  commitment?: Commitment
): Promise<Transaction> {
  const transaction = new Transaction().add(
    createCreateWrappedInstruction(
      tokenBridgeAddress,
      bridgeAddress,
      payerAddress,
      signedVaa
    )
  );
  const { blockhash } = await connection.getLatestBlockhash(commitment);
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = new PublicKey(payerAddress);
  return transaction;
}

export async function createWrappedOnAlgorand(
  client: Algodv2,
  tokenBridgeId: bigint,
  bridgeId: bigint,
  senderAddr: string,
  attestVAA: Uint8Array
): Promise<TransactionSignerPair[]> {
  return await _submitVAAAlgorand(
    client,
    tokenBridgeId,
    bridgeId,
    attestVAA,
    senderAddr
  );
}

export async function createWrappedOnNear(
  client: nearAccount,
  tokenBridge: string,
  attestVAA: Uint8Array
): Promise<string> {
  // Could we just pass in the vaa already as hex?
  let vaa = Buffer.from(attestVAA).toString("hex");

  let res = await client.viewFunction(tokenBridge, "deposit_estimates", {});

  let result = await client.functionCall({
    contractId: tokenBridge,
    methodName: "submit_vaa",
    args: { vaa: vaa },
    attachedDeposit: new BN(res[1]),
    gas: new BN("150000000000000"),
  });

  result = await client.functionCall({
    contractId: tokenBridge,
    methodName: "submit_vaa",
    args: { vaa: vaa },
    attachedDeposit: new BN(res[1]),
    gas: new BN("150000000000000"),
  });

  return nearProviders.getTransactionLastResult(result);
}
