from Layer2Ledger.config.config import config

if config.FULLNODE_SIGNING_KEY_USES_FUNCTIONAL_TEST_KEYS:
    FULLNODE_SIGNING_KEY_PUBKEY = config.Onboarding_Deposit_Address.public_key
else:
    FULLNODE_SIGNING_KEY_PUBKEY = config.FULLNODE_SIGNING_KEY_PUBKEY

# Public/priv keys of the layer2ledger, used for signing DEPOSIT transactions when a deposit from the fullnodehelper is received
ONBOARDING_DEPOSIT_SIGNING_KEY_PRIVKEY = config.ONBOARDING_DEPOSIT_SIGNING_KEY_PRIVKEY
ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY = config.ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY




