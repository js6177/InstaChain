import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import {
  DEPOSIT_CONFIRMED_ROUTE,
  DEPOSIT_ROUTER_PREFIX,
  EXPLORER_ROUTER_PREFIX,
  GET_ALL_TRANSACTIONS_ROUTE,
  GET_BALANCE_ROUTE,
  GET_DEPOSIT_ADDRESS_ROUTE,
  GET_FEE_ROUTE,
  GET_NODE_INFO_ROUTE,
  GET_TRANSACTION_ROUTE,
  GET_WITHDRAWAL_REQUESTS_ROUTE,
  INFO_ROUTER_PREFIX,
  PUSH_TRANSACTION_ROUTE,
  REQUEST_WITHDRAWAL_ROUTE,
  TRANSFER_ROUTER_PREFIX,
  WITHDRAWAL_BROADCASTED_ROUTE,
  WITHDRAWAL_CONFIRMED_ROUTE,
  WITHDRAWAL_ROUTER_PREFIX,
} from './api-paths';
import {
  DepositConfirmedRequest,
  GetBalanceRequest,
  GetDepositAddressRequest,
  GetFeeRequest,
  GetTransactionRequest,
  GetTransactionsRequest,
  GetWithdrawalRequestsRequest,
  PushTransactionRequest,
  RequestWithdrawalRequest,
  WithdrawalBroadcastedRequest,
  WithdrawalConfirmedRequest,
} from './models/requests';
import {
  DepositConfirmedResponse,
  GetBalanceResponse,
  GetDepositAddressResponse,
  GetFeeResponse,
  GetNodeInfoResponse,
  GetTransactionResponse,
  GetTransactionsResponse,
  GetWithdrawalRequestsResponse,
  WithdrawalBroadcastedResponse,
  WithdrawalConfirmedResponse,
} from './models/responses';
import { CommonResponse } from './models/common';
import type { Layer2LedgerRouteHandlers } from './handlers';

export function createLayer2LedgerApp(handlers: Layer2LedgerRouteHandlers) {
  return new Elysia({ name: 'layer2ledger-api' })
    .use(cors())
    .get('/', () => handlers.health())
    .group(TRANSFER_ROUTER_PREFIX, (app) =>
      app.post(PUSH_TRANSACTION_ROUTE, ({ body }) => handlers.pushTransaction(body), {
        body: PushTransactionRequest,
        response: CommonResponse,
      }),
    )
    .group(DEPOSIT_ROUTER_PREFIX, (app) =>
      app
        .post(GET_DEPOSIT_ADDRESS_ROUTE, ({ body }) => handlers.getDepositAddress(body), {
          body: GetDepositAddressRequest,
          response: GetDepositAddressResponse,
        })
        .post(DEPOSIT_CONFIRMED_ROUTE, ({ body }) => handlers.depositConfirmed(body), {
          body: DepositConfirmedRequest,
          response: DepositConfirmedResponse,
        }),
    )
    .group(WITHDRAWAL_ROUTER_PREFIX, (app) =>
      app
        .post(REQUEST_WITHDRAWAL_ROUTE, ({ body }) => handlers.requestWithdrawal(body), {
          body: RequestWithdrawalRequest,
          response: CommonResponse,
        })
        .post(GET_WITHDRAWAL_REQUESTS_ROUTE, ({ body }) => handlers.getWithdrawalRequests(body), {
          body: GetWithdrawalRequestsRequest,
          response: GetWithdrawalRequestsResponse,
        })
        .post(WITHDRAWAL_BROADCASTED_ROUTE, ({ body }) => handlers.withdrawalBroadcasted(body), {
          body: WithdrawalBroadcastedRequest,
          response: WithdrawalBroadcastedResponse,
        })
        .post(WITHDRAWAL_CONFIRMED_ROUTE, ({ body }) => handlers.withdrawalConfirmed(body), {
          body: WithdrawalConfirmedRequest,
          response: WithdrawalConfirmedResponse,
        }),
    )
    .group(EXPLORER_ROUTER_PREFIX, (app) =>
      app
        .post(GET_BALANCE_ROUTE, ({ body }) => handlers.getBalance(body), {
          body: GetBalanceRequest,
          response: GetBalanceResponse,
        })
        .post(GET_TRANSACTION_ROUTE, ({ body }) => handlers.getTransaction(body), {
          body: GetTransactionRequest,
          response: GetTransactionResponse,
        })
        .post(GET_ALL_TRANSACTIONS_ROUTE, ({ body }) => handlers.getAllTransactions(body), {
          body: GetTransactionsRequest,
          response: GetTransactionsResponse,
        })
        .post(GET_FEE_ROUTE, ({ body }) => handlers.getFee(body), {
          body: GetFeeRequest,
          response: GetFeeResponse,
        }),
    )
    .group(INFO_ROUTER_PREFIX, (app) =>
      app.get(GET_NODE_INFO_ROUTE, () => handlers.getNodeInfo(), {
        response: GetNodeInfoResponse,
      }),
    );
}

export type Layer2LedgerApp = ReturnType<typeof createLayer2LedgerApp>;
