from layer2ledgerbatched.Layer2LedgerAPIHandler.config.config import settings

# Public key of the fullnode, used for verifying L1 transactions sent from the fullnodehelper
if settings.FULLNODE_SIGNING_KEY_USES_FUNCTIONAL_TEST_KEYS:
    FULLNODE_SIGNING_KEY_PUBKEY = settings.Onboarding_Deposit_Address.public_key
else:
    FULLNODE_SIGNING_KEY_PUBKEY = settings.FULLNODE_SIGNING_KEY_PUBKEY

# Public/priv keys of the layer2ledger, used for signing DEPOSIT transactions when a deposit from the fullnodehelper is received
ONBOARDING_DEPOSIT_SIGNING_KEY_PRIVKEY = settings.ONBOARDING_DEPOSIT_SIGNING_KEY_PRIVKEY
ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY = settings.ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY




