import os 

#public keys of the fullnodehelper that monitors the btc node, used for verifying deposit and withdrawal events from btc node
FULLNODE_SIGNING_KEY_PUBKEY = os.environ.get('FULLNODE_SIGNING_KEY_PUBKEY')

#public/priv keys of the layer2ledger, used for signing DEPOSIT transactions when a deposit from the fullnodehelper is received
ONBOARDING_DEPOSIT_SIGNING_KEY_PRIVKEY = os.environ.get('ONBOARDING_DEPOSIT_SIGNING_KEY_PRIVKEY')
ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY = os.environ.get('ONBOARDING_DEPOSIT_SIGNING_KEY_PUBKEY')



