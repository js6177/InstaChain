# Layer2LedgerBatched design doc

## Overview of Components
Layer2LedgerBatched is a service that processes Layer2 transfers (transfers from a Layer2 address to a Layer2 address), deposits (from Layer1 to Layer2), and withdrawals (from Layer2 to Layer2). It accepts requests through a FastAPI ASGI server ran with uvicorn, and stores them in a postgreSQL database. In the context of this project, Layer1 refers to the bitcoin network, and Layer2 refers to this ledger in this project.
Layer2LedgerBatched consists of two standalone processes, Layer2LedgerAPIHandler and Layer2LedgerDbWriter, and two 3rd party services: Redis (redis-server) and postgreSQL (psql).

Layer2LedgerAPIHandler is responsible for accepting Transfer, Deposit, and Withdrawal requests through the FastAPI http endoints, verifying that the transactions are good, and pushing them to the redis instance. The Layer2LedgerDbWriter is responsible for getting all the transactions in the redis queue, and inserting them into the postgresql batched to maximize throughput.

A postgresql db callled "Layer2LedgerDB" will be the core database that stores the layer2 ledger and will have tables for the trasactions, deposits and withdrawal requests. The Layer2LedgerAPIHandler can only read but not write to this databse. The only service that writes to it is Layer2LedgerDbWriter.
There will be a redis service that is responsible for providing a distributed lock mechanism (to prevent double spending of funds processed by seperate uvicorn processes) called 'AddressLock' and for maintaing a list of Transactions (called 'PendingTransactions') that the Layer2LedgerDbWriter will fetch and batch insert into Layer2LedgerDB. This pending transactions list is known as 'Layer2LedgerMempool' and is similar to the layer1 mempool.

## Tech stack
Runtime: Python 3.12
Libraries:
fastapi - For the REST API
uvicorn - Deploying the REST API in production
asyncpg - For the async postgresql driver
sqlalchemy[asyncio] - ORM for postgresql models
redis[hiredis]  - redis driver
pydantic - Schema validation of the REST API and redis messages 
fastecdsa - generating layer2 addresses, verifying message signatures from layer2 addresses



# General concepts
## Address Format
A layer2 address is a secp256k1 keypair. The public key is set in the source and destination of a Layer2 Transfer, Deposit, and Withdrawal transaction, while the private key of the source address is used to sign the transaction to verify that it comes from the owner of that address. 
## Message Signatures

This is the following code to sign and verify a message in python using the base58 and fastecdsa libraries

```
def sign_message(message: str, priv_key_b58: str):
    """Signs a message with a private key and returns the signature."""
    priv_key_bytes = base58.b58decode(priv_key_b58)
    priv_key = int.from_bytes(priv_key_bytes, 'big')
    r, s = ecdsa.sign(message, priv_key, curve=curve.secp256k1, hashfunc=sha256)
    signature_bytes = r.to_bytes(32, 'big') + s.to_bytes(32, 'big')
    return base58.b58encode(signature_bytes).decode('utf-8')


def verify_message(message: str, signature_b58: str, public_key_b58: str):
    """Verifies a message signature with a public key."""
    signature_bytes = base58.b58decode(signature_b58)
    r = int.from_bytes(signature_bytes[:32], 'big')
    s = int.from_bytes(signature_bytes[32:], 'big')

    public_key_bytes = base58.b58decode(public_key_b58)
    x = int.from_bytes(public_key_bytes[:32], 'big')
    y = int.from_bytes(public_key_bytes[32:], 'big')
    public_key = Point(x, y, curve=curve.secp256k1)

    return ecdsa.verify((r, s), message, public_key, curve=curve.secp256k1, hashfunc=sha256)
```

And it's equivalent typescript implementation to sign/verify messages from the browser-based wallet using the @noble/hashes, @noble/secp256k1, and bs58 libraries 

```
async function signMessage(message: string, privKeyB58: string): Promise<string> {
    const messageHash = sha256(messageToUint8Array(message));
    const privKey = bs58.decode(privKeyB58);
    const signature = await secp.sign(messageHash, privKey);
    const signatureBytes = signature.toCompactRawBytes();
    return bs58.encode(Buffer.from(signatureBytes));
}

async function verifyMessage(message: string, signatureB58: string, publicKeyB58: string): Promise<boolean> {
    try {
        const messageHash = sha256(messageToUint8Array(message));
        const signatureBytes = bs58.decode(signatureB58);
        const publicKeyBytes = bs58.decode(publicKeyB58);

        const uncompressedPubKey = new Uint8Array(65);
        uncompressedPubKey[0] = 0x04;
        uncompressedPubKey.set(publicKeyBytes, 1);

        return secp.verify(signatureBytes, messageHash, uncompressedPubKey);
    } catch (error) {
        return false;
    }
}
```

# Folder Structure
The Layer2LedgerBatched project is a managed by the 'uv' tool and has the following folder structure

```
/src/ - the folder where all of the source code resides
    /layer2ledgerbatched/
        /docs/
        /common/ - folder that contains code common to both Layer2LedgerAPIHandler and Layer2LedgerDbWriter (such as redis connection logic and redis pydantic models)
            /redis/ - folder for managing redis connections and defining redis pydantic models
                /redis-models/
                /redis-driver/
            /db/ - folder that contain the sqlalchemy models andd rivers for the DB
                models.py - file that contains the sqlalchemy models of the DB
                session.py - file that contains the engine and session for connecting to the db
            /utils/ - files that contain utils and helper functions
            /config/
                config.py - Contains the pydantic model of the config.json and functions to read it
                shared-config.json - Shared configuration (DB, Redis connection strings)
        /Layer2LedgerAPIHandler/
            /api/ - folder the contain the routes and models of the FastAPI interface
                /routes/ - business logic that handles the FastAPI requests
                /models/ - Pydantic models that contain the request and response for the FastAPI
                    /requests/
                    /responses/
            /utils/ - files that contain utils and helper functions
            /config/ - folder for the config parser, pydantic model, and json file
                config.py - Contains the pydantic model of the config.json and functions to read it
                Layer2LedgerAPIHandler-config.json - Layer2LedgerAPIHandler configuration
            main.py - Entrypoint
        /Layer2LedgerDbWriter/
            /core/ - files that contain the core functionality, such as the main redis listening loop
            /utils/ - files that contain utils and helper functions
            /config/ - folder for the config parser, pydantic model, and json file
                config.py - Contains the pydantic model of the config.json and functions to read it
                Layer2LedgerAPIHandler-config.json - Layer2LedgerAPIHandler configuration
            main.py - Entrypoint 
/tests/ - folder for the unit tests and functional tests
/setup-scripts/ - folder that contains scripts for seting up the environment (like starting up redis and psql services or launching uvicorn instances) to run the Layer2LedgerAPIHandler and Layer2LedgerDbWriter
/docs/ - Documentation of this service
```

# Data flows:
## Transfer:

### Procedure:
The Layer2LedgerAPIHandler listens to incoming Transfer requests and verifies whether the request can be confirmed using the following logic:
- The Transfer requests's fields are valid
    - The source and destination address contain only alphanumeric characters
    - The amount is greater than 0
- The message is properly signed by the source address

If the above conditions are met, than the source and destination address are atomically locked using AddressLock, the redis server's distributed lock mechanism. Both addresses are sorted alphabetically in order to prevent deadlocks.

If the lock cannot be acquired, the function returns with an http error message saying "Address is part of another transactions that is being processed. Try again". If the lock can been acquired, then the function procedes with the following check:
- Another Transaction does not exist with the same transaction id
- The source address's balance is greater than the transfer amount

If this condition is met, the transfer is approved and is inserted into the redis server's PendingTransactions list. The http requests returns a success, with the transaction id's state being 'Confirmed, pending insertion into db'.

In a while loop the Layer2LedgerDbWriter fetches this (and many other) Transfer json from the redis PendingTransactions list and does the following:
- converts them into appropriate Transfer SQLAlchemy models 
- for each Transfer transaction, for both the source and destination addres, generates an atomically incrementing AddressBalance upsert statement
- batch inserts them. 

Once the transfers are successfully inserted, the Layer2LedgerDbWriter unlocks all source and destination addresses involved in the batch inserted transactions, and removes the inserted transactions from the PendingTransactions list in redis.

### DB models
The Transaction and Layer2AddressBalance are the only models that this flow uses

```
class Transaction(Base):
    __tablename__ = "transactions"

    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    amount: Mapped[int] = mapped_column(Integer)
    fee: Mapped[int] = mapped_column(Integer)
    source_address_pubkey: Mapped[str] = mapped_column(String, index=True)
    destination_address_pubkey: Mapped[str] = mapped_column(String, index=True)
    transaction_type: Mapped[int] = mapped_column(Integer)
    layer2_transaction_id: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    signature: Mapped[str] = mapped_column(String)
    signature_date: Mapped[int] = mapped_column(BigInteger)
    layer1_transaction_id: Mapped[str] = mapped_column(String)
    layer2_withdrawal_id: Mapped[str] = mapped_column(String)
```

```
class Layer2AddressBalance(Base):
    __tablename__ = "layer2_address_balance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    address: Mapped[str] = mapped_column(String, unique=True, index=True)
    balance: Mapped[int] = mapped_column(Integer)
    timestamp: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

### FastAPI models

Request

```
class Layer2TransferRequest(BaseModel):
    amount: int = None
    destination_address_public_key: str = None
    fee: int = None
    signature: str = None
    source_address_public_key: str = None
    transaction_id: str = None
```

Response

```
class CommonResponse(BaseModel):
    error_code: int = None
    error_message: str = None
```

## Deposit
### Procedure
The deposit action requires 2 seperate actions:
- Requesting a deposit address
- Depositing layer1 tokens to the deposit address.
First, the user calls the /GetDepositAddress API, passing in their layer2 address, and gets back a layer1 address that they can deposit to. One the user has this layer1 address, any funds sent to this address on the layer1 network get credited to its corresponding layer2 address. The layer2bridge sevice monitors this address, and after 3 confirmations (this can be configured), calls the /DepositConfirmed API so that the layer2ledger can credit the corresponding layer2 address.

#### GetDepositAddress
The layer2ledger listens to incoming `GetDepositAddressRequest` messages and validates them with the following:
- Makes sure the layer2_address_pubkey is alphanum
- The message is properly signed by the layer2_address_pubkey
If this check is successfull, it inserts a `DepositAddresses` sqlalchemy model into the postgresql db, and uses the result of the autoincrementing id as the index of the layer1 deposit address to generate. Once this index is acquired, it is used to generate a layer1 deposit address by calling the generate_btc_testnet_address function. The `DepositAddresses` address is then updated with the layer1 deposit address, and returned to the user in the form of `GetDepositAddressResponse` model.

#### DepositConfirmed
Once the user gets a layer1 deposit address and transfers funds to that address, the `Layer2Bridge` monitors that address for incoming transactions. Once a transaction reaches 3 confirmations, the `Layer2Bridge` calls the `/DepositConfirmed` API with a `DepositConfirmedRequest`. 
The API then does the following:
- The signature of the `DepositConfirmedRequest` is verifying to come from the `Layer2Bridge`
- The layer1_address is used to fetch the layer2_address from the `DepositAddresses` table
- A layer2 `Transaction` is generated to credit the layer2_address with the layer1_transaction_id be the deposit transaction's layer1 transaction id.
- The `Transaction` is the push to redis similar to the Transfer procedure

Once this `Transaction` is inserted into redis, the Layer2LedgerDbWriter fetches it from redis and inserts it into the postgresql db in the same loop as the regular layer2 transfers.

### DB models
This procedure inserts `DepositAddresses` and `Transaction` models 

### FastAPI models

This procedure accepts `GetDepositAddressRequest` and responds with `GetDepositAddressResponse` from the user
This procedure also accepts and `DepositConfirmedRequest` and responds with `DepositConfirmedResponse` from the layer2bridge