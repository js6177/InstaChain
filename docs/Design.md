# OpenL2 design doc

## Overview of the Project

OpenL2 is a performant, Bitcoin Layer2 scaling solution that enables faster and cheaper transactions, which can be settled on the main Bitcoin blockchain.


## Components

### Layer2Bridge
A service that connects to a Bitcoin node and the Layer2ledger. It monitors for Layer1 deposits and credits the corresponding Layer 2 address. It also processes withdrawal requests from Layer2, sending funds to the appropriate Layer1 address.

### Layer2LedgerBatched
This service manages the core Layer2 ledger. It handles transfers, deposits, and withdrawals within the Layer 2 network. It uses a high-performance, batched database writer to record transactions, and a Redis-based locking mechanism to prevent double-spending.

### Layer2OauthManager
A TypeScript-based service to manage user authentication via OAuth providers like Google and Twitter. It links a user's social identity to their Layer2 account address, so that it is possible to send L2 bitcoin between two social media accounts.

### Wallet-JS
A React-based frontend application that provides the user interface for the wallet. It allows users to create addresses, view balances, see transaction history, and execute transfers, deposits, and withdrawals.

### Wallet-server
A simple Node.js server that likely serves the static files for Wallet-JS and may act as a backend-for-frontend, proxying requests to other microservices.
