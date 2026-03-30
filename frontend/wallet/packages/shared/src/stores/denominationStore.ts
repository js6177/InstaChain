import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Denomination = 'sats' | 'btc';

interface DenominationState {
    denomination: Denomination;
    toggleDenomination: () => void;
    setDenomination: (denomination: Denomination) => void;
}

export const useDenominationStore = create<DenominationState>()(
    persist(
        (set) => ({
            denomination: 'sats',
            toggleDenomination: () => set((state) => ({ denomination: state.denomination === 'sats' ? 'btc' : 'sats' })),
            setDenomination: (denomination) => set({ denomination }),
        }),
        {
            name: 'denomination-storage',
        }
    )
);

export const formatAmount = (sats: number | undefined | null, denomination: Denomination): string => {
    if (sats === undefined || sats === null) return "0";
    if (denomination === 'btc') {
        // Remove trailing zeroes after formatting to 8 decimals
        return (sats / 100000000).toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 }).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
    }
    return sats.toLocaleString('en-US');
};

export const parseAmountToSats = (amountInput: string, denomination: Denomination): number => {
    const raw = parseFloat(amountInput);
    if (isNaN(raw)) return NaN;
    if (denomination === 'btc') {
        return Math.floor(raw * 100000000);
    }
    return Math.floor(raw);
};
