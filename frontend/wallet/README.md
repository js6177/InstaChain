# Installation & running

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run dev
```

# About
This is a web wallet that allows a user to:
- generate a new layer2 wallet
- deposit funds from layer1 to layer2
- withdraw funds from layer2 to layer1
- transfer funds between layer2 addresses

It also has an explorer, which allows the a user to:
- view a layer2 transaction info given the transaction_id
- view a list of layer2 transactions given an address's public key
- view a layer2 Address's balance
Any address/transaction can be viewed, as it is not just limited to the loaded wallet's addresses or transactions.

## UI 

## Tech stack
- React
- TypeScript
- Vite
- Tailwind CSS
- Orval
- Zustand
- TanStack Query

## Architecture

A layer2 address is a tuple of public and private keys, generated using the 'wallet.ts' package.
A layer2 wallet is a collection of layer2 addresses, with a field indicating the main address (the default address to be used for transactions). The wallet also has a mnemonic, which is a phrase that can be used to recover the wallet, and generate deterministically the first and all the subsequent addresses.

There are two state managers used to store most of the app's data:
- zustand: stores the UI (like theme, dark mode, etc) and the wallet data (addresses, mnemonic, etc.)
- tanstack query: stores the data fetched from the backend ( layer2ledger) like transactions, balances, etc.

### Layer2 Messaging
Most layer2 messages are signed by the wallet's private key in order to ensure the authenticity of the message. These messages contain the `node_id` field, which is used to identify the node processes the message.
At startup, the app will fetch the NodeInfo from the backend, and use the `node_id` to sign the messages.


### TanStack Query 

Below is a table that specifies what data is fetched/cached from the backend (as well as ids) along with the backend API route.

| Data | Id | API Route | Purpose |
| --- | --- | --- | --- |
| 'AdressBalance' | layer2_address_pubkey | '/get_balance' | Get the balance of a layer2 address |
| 'Transaction' | transaction_id | '/get_transaction' | Get a layer2 transaction info |
| 'Transactions' | layer2_address_pubkey | '/get_all_transactions' | Get all layer2 transactions of an layer2 address |
| 'DepositAddress' | layer2_address_pubkey | '/get_deposit_address' | Get the layer1 deposit address for a layer2 address |
| 'NodeInfo' | - | '/get_node_info' | Get the node info, to use node_id |


### UI

The app contains 3 main pages:
- 'wallet': A page that allows a user to generate (or open) a wallet, and interact with it (transfer/deposit/withdraw funds).
- 'explorer': A page that allows the user to find a Transaction or Address using the transaction id or address pubkey.
- 'about': A page that contains information about the project. 

#### Wallet page

The wallet page allows the user to create or open a wallet. If no wallet is loaded, the user is presented with a dialog box where they can generate a new or enter an existing mneumonic, then click the 'open' button to generate the wallet's keys. Once the wallet is generated, it's state is stored in zustand. The wallet info is then loaded into a UI card that displays the address and balance.
Below the wallet card is a list of the wallet's transactions. Each element in the list is an expandable item that contains the summary of the transctions (whether it is incoming or outgoing, source or destination address, transfer type, and amount with sign). If this item is expanded, it will display the entire details of the transaction in json format.
On the page are 3 'action' button that open dialog boxes to enable the user to send/receive funds:
- Deposit: Allows a user to get a layer1 deposit address for their layer2 address. (The user clicks the 'get' button)
- Withdraw: Allows a user to withdraw to a layer1 address. (The user enters the layer1 address and amount, and clicks the 'withdraw' button)
- Transfer: Allows a user to transfer to another layer2 address. (The user enters the layer2 address and amount, and clicks the 'transfer' button)

The route of the wallet page is '/wallet'

#### Explorer page

The explorer page is used to view addresses or transactions. It contains a search bar where the user can enter the transaction id or address pubkey. 
Once an address or transaction is found, it is displayed as follows:
- Address view: the address info is returned in the form of a card containing the address pubkey, address balance, and the transaction count. Below that, it will display a list of it's transactions. This is similar to the wallet page.
- Transaction view: Only the transaction is displayed as an expandable list item (again, similar to how it is displayed in the wallet page).

The transaction's source and destination address also have links that go to the address's page in the explorer. 

The explorer has the following routes:
| route | purpose |
| --- | --- |
| /explorer | explorer page |
| /search?q= | explorer page with search query |
| /explorer/address/[address_pubkey] | explorer page with address pubkey |
| /explorer/transaction/[transaction_id] | explorer page with the transaction |

### About page

The about page is a simple page that will contain information about the project. This will be filled in later.
