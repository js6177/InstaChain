from config import get_config

#public keys of the fullnodehelper that monitors the btc node, used for verifying deposit and withdrawal events from btc node
FULLNODE_SIGNING_KEY_PUBKEY = get_config('FULLNODE_SIGNING_KEY_PUBKEY')

#public/priv keys of the layer2ledger, used for signing DEPOSIT transactions when a deposit from the fullnodehelper is received
ONBOARDING_DEPOSIT_SIGNING_KEY_PRIVKEY = get_config('ONBOARDING_DEPOSIT_SIGNING_KEY_PRIVKEY')
ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY = get_config('ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY')



