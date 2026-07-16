import { verifyMessage } from '@openl2/pubkey-utils';
import { NODE_ASSET_ID_HEX } from './constants';
import {
  buildDepositMessage,
  buildGetDepositAddressMessage,
  buildTransferMessage,
  buildWithdrawalBroadcastedMessage,
  buildWithdrawalConfirmedMessage,
  buildWithdrawalRequestMessage,
} from './messages';

export interface MessagingContext {
  nodeId: string;
  layer2BridgeSigningPublicKey: string;
}

export async function verifyGetDepositAddress(
  context: MessagingContext,
  sourcePubkey: string,
  nonce: string,
  signature: string,
): Promise<boolean> {
  const message = buildGetDepositAddressMessage(
    context.nodeId,
    NODE_ASSET_ID_HEX,
    sourcePubkey,
    nonce,
  );
  return verifyMessage(message, signature, sourcePubkey);
}

export async function verifyDeposit(
  context: MessagingContext,
  layer1TransactionId: string,
  layer1TransactionVout: number,
  layer1Address: string,
  amount: number,
  nonce: string,
  signature: string,
): Promise<boolean> {
  const message = buildDepositMessage(
    context.nodeId,
    layer1TransactionId,
    layer1TransactionVout,
    layer1Address,
    amount,
    nonce,
  );
  return verifyMessage(message, signature, context.layer2BridgeSigningPublicKey);
}

export async function verifyTransferMessage(
  context: MessagingContext,
  sourcePubkey: string,
  destinationAddressPubkey: string,
  amount: number,
  fee: number,
  nonce: string,
  signature: string,
): Promise<boolean> {
  const message = buildTransferMessage(
    context.nodeId,
    NODE_ASSET_ID_HEX,
    sourcePubkey,
    destinationAddressPubkey,
    amount,
    fee,
    nonce,
  );
  return verifyMessage(message, signature, sourcePubkey);
}

export async function verifyWithdrawalRequestMessage(
  context: MessagingContext,
  sourcePubkey: string,
  withdrawalAddress: string,
  nonce: string,
  amount: number,
  signature: string,
): Promise<boolean> {
  const message = buildWithdrawalRequestMessage(
    context.nodeId,
    NODE_ASSET_ID_HEX,
    sourcePubkey,
    withdrawalAddress,
    nonce,
    amount,
  );
  return verifyMessage(message, signature, sourcePubkey);
}

export async function verifyWithdrawalBroadcasted(
  context: MessagingContext,
  layer1TransactionId: string,
  layer1TransactionVout: number,
  layer1Address: string,
  amount: number,
  withdrawalId: string,
  signature: string,
): Promise<boolean> {
  const message = buildWithdrawalBroadcastedMessage(
    context.nodeId,
    layer1TransactionId,
    layer1TransactionVout,
    layer1Address,
    amount,
    withdrawalId,
  );
  return verifyMessage(message, signature, context.layer2BridgeSigningPublicKey);
}

export async function verifyWithdrawalConfirmed(
  context: MessagingContext,
  layer1TransactionId: string,
  layer1TransactionVout: number,
  layer1Address: string,
  amount: number,
  signature: string,
): Promise<boolean> {
  const message = buildWithdrawalConfirmedMessage(
    context.nodeId,
    layer1TransactionId,
    layer1TransactionVout,
    layer1Address,
    amount,
  );
  return verifyMessage(message, signature, context.layer2BridgeSigningPublicKey);
}
