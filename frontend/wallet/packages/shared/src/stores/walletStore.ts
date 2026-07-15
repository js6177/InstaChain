import { create } from 'zustand';
import type { OAuthUserType } from '@openl2/api-layer2oauthmanager';
import { Layer2Wallet, type Layer2Address } from '../wallet/wallet';
import { MNEUMONIC_WORD_COUNT, MNEUMONIC_WORDLIST } from '../wallet/wordlist';

interface WalletState {
    wallet: Layer2Wallet | null;
    mainAddress: Layer2Address | null;
    isLoaded: boolean;
    error: string | null;
    oauthUser: OAuthUserType | null;

    // Actions
    generateWallet: () => void;
    loadWalletFromMnemonic: (mnemonicWords: string[]) => void;
    setOAuthUser: (user: OAuthUserType | null) => void;
    logout: () => void;
    validateMnemonic: (mnemonicWords: string[]) => boolean;
}

export const useWalletStore = create<WalletState>((set, get) => ({
    wallet: null,
    mainAddress: null,
    isLoaded: false,
    error: null,
    oauthUser: null,

    generateWallet: () => {
        try {
            const newWallet = new Layer2Wallet();
            newWallet.generateNewMnemonic();
            newWallet.fromMnemonic(newWallet.mnemonic, 1);
            set({
                wallet: newWallet,
                mainAddress: newWallet.addresses.length > 0 ? newWallet.addresses[0] : null,
                isLoaded: true,
                error: null,
            });
        } catch (e: unknown) {
            set({ error: e instanceof Error ? e.message : "Failed to generate wallet" });
        }
    },

    loadWalletFromMnemonic: (mnemonicWords: string[]) => {
        try {
            if (!get().validateMnemonic(mnemonicWords)) {
                throw new Error("Invalid mnemonic phrase.");
            }
            const wallet = new Layer2Wallet();
            wallet.fromMnemonic(mnemonicWords, 1);
            set({
                wallet,
                mainAddress: wallet.addresses.length > 0 ? wallet.addresses[0] : null,
                isLoaded: true,
                error: null,
            });
        } catch (e: unknown) {
            set({ error: e instanceof Error ? e.message : "Failed to load wallet" });
        }
    },

    setOAuthUser: (user: OAuthUserType | null) => {
        set({ oauthUser: user });
    },

    logout: () => {
        set({
            wallet: null,
            mainAddress: null,
            isLoaded: false,
            error: null,
            oauthUser: null,
        });
    },

    validateMnemonic: (mnemonicWords: string[]) => {
        if (mnemonicWords.length !== MNEUMONIC_WORD_COUNT) {
            return false;
        }
        for (const word of mnemonicWords) {
            if (!MNEUMONIC_WORDLIST.includes(word)) {
                return false;
            }
        }
        return true;
    }
}));
