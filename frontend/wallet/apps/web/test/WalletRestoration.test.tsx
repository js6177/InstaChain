import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { Layer2Wallet, useWalletStore, TEST_IDS } from '@openl2/wallet-shared'
import { TestKeysModel } from './test-keys.model'

test('wallet is restored from mnemonic', async () => {
    // 1. Load the mnemonic from the model that reads test.keys.json
    const testKeys = TestKeysModel.load();
    const mnemonicWords = testKeys.mnemonicWords;
    
    // 2. Initialize a new wallet
    const wallet = new Layer2Wallet();
    
    // 3. Restore the wallet from the mnemonic
    wallet.fromMnemonic(mnemonicWords);
    
    // 4. Verify the wallet state
    expect(wallet.mnemonic).toEqual(mnemonicWords);
    expect(wallet.addresses.length).toBeGreaterThan(0);
    
    const address = wallet.addresses[0];
    expect(address.public_key_str_base58).toBeDefined();
    expect(address.private_key_str_base58).toBeDefined();
    expect(address.generation_type).toBe('FROM_MNEMONIC');
    
    // 5. Verify deterministic generation (same mnemonic should result in same keys)
    const secondWallet = new Layer2Wallet();
    secondWallet.fromMnemonic(mnemonicWords);
    
    expect(secondWallet.addresses[0].public_key_str_base58).toBe(address.public_key_str_base58);
    expect(secondWallet.addresses[0].private_key_str_base58).toBe(address.private_key_str_base58);
    
    // 6. Verify that it's NOT an empty or random address
    expect(address.public_key_str_base58).not.toBe('');
    expect(address.private_key_str_base58).not.toBe('');
})

test('wallet store is restored from mnemonic', async () => {
    // 1. Load the mnemonic from the model that reads test.keys.json
    const testKeys = TestKeysModel.load();
    const mnemonicWords = testKeys.mnemonicWords;
    
    // 2. Load the wallet into the store
    const { loadWalletFromMnemonic, logout } = useWalletStore.getState();
    
    // Ensure we start clean
    logout();
    expect(useWalletStore.getState().isLoaded).toBe(false);
    
    // Restore
    loadWalletFromMnemonic(mnemonicWords);
    
    // 3. Verify the store state
    const state = useWalletStore.getState();
    expect(state.isLoaded).toBe(true);
    expect(state.wallet).not.toBeNull();
    expect(state.wallet?.mnemonic).toEqual(mnemonicWords);
    expect(state.mainAddress).not.toBeNull();
    expect(state.mainAddress?.public_key_str_base58).toBe(state.wallet?.addresses[0].public_key_str_base58);
    expect(state.error).toBeNull();
})

test('UI: wallet restoration through the UI', async () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    })

    const screen = await render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <App />
            </MemoryRouter>
        </QueryClientProvider>
    )

    const testKeys = TestKeysModel.load();
    const { logout } = useWalletStore.getState();
    logout(); // Start clean

    // Wait for the wallet landing page before interacting (ensures iframe content is ready)
    const welcomeText = screen.getByText(/OpenL2 Web Wallet/i)
    await expect.element(welcomeText).toBeVisible()

    // 1. Find and click "Restore Wallet" button using data-testid
    const restoreTrigger = screen.getByTestId(TEST_IDS.RESTORE_WALLET_TRIGGER)
    await expect.element(restoreTrigger).toBeVisible()
    await restoreTrigger.click()

    // 2. Enter mnemonic into the input field using data-testid
    const mnemonicInput = screen.getByTestId(TEST_IDS.MNEMONIC_INPUT)
    await expect.element(mnemonicInput).toBeVisible()
    await mnemonicInput.fill(testKeys.mnemonic)

    // 3. Click the "Restore" button using data-testid
    const restoreButton = screen.getByTestId(TEST_IDS.RESTORE_WALLET_BUTTON)
    await expect.element(restoreButton).toBeVisible()
    await restoreButton.click()

    // 4. Verify that we are now in the wallet view (balance should be visible)
    const balanceDisplay = screen.getByTestId(TEST_IDS.BALANCE_DISPLAY)
    await expect.element(balanceDisplay).toBeVisible()
    
    // 5. Check if the store is indeed loaded
    expect(useWalletStore.getState().isLoaded).toBe(true)
    expect(useWalletStore.getState().wallet?.mnemonic).toEqual(testKeys.mnemonicWords)
})
