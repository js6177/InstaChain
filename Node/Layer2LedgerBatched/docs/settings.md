The Settings for the Layer2Ledger contains the following:

```
class SettingsLayer2Address(BaseModel):
    mneumonic: str
    private_key: str
    public_key: str

class Layer2LedgerAPIHandlerSettings(BaseModel):
    layer2ledger_node_id: str
    deposit_wallet_master_pubkey: str
    minimum_layer1_transaction_amount: int
    layer2bridge_signing_address: SettingsLayer2Address
    deposit_transaction_pubkey: str
    layer2bridge_signing_key_uses_functional_test_keys: bool
    onboarding_layer2_deposit_address: SettingsLayer2Address
```

Here is the purpose of each setting:

`layer2ledger_node_id`: a random id for the layer2ledger node. It is used as a nonce value when signing messages to prevent replay attacks (so that the signed message is only valid for the layer2ledger that it is intended for).

`deposit_wallet_master_pubkey`: The master public key of the layer1 deposit address (owned by Layer2Bridge), from which deposit addressea are generated from.

`minimum_layer1_transaction_amount`: The minimum amount (in satoshis) that a withdrawal request must be in order to be broadcasted by the Layer2Bridge.

`layer2bridge_signing_address`: The address that the Layer2Bridge will use in order to sign messages.

`deposit_transaction_pubkey`: A 'dummy' address that will be the value of the 'source' field of a deposit transaction. Since deposit transactions are from Layer1 to Layer2, there is no real 'source' address, only a 'destination' address.

`layer2bridge_signing_key_uses_functional_test_keys`: for simulating the Layer2Bridge in pytest unit tests.

`onboarding_layer2_deposit_address`: Old value, to be deleted








