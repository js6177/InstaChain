import { create } from "zustand";
import { persist } from "zustand/middleware";

export const Denomination = {
	Sats: "sats",
	Btc: "btc",
} as const;

export type Denomination = (typeof Denomination)[keyof typeof Denomination];

interface DenominationState {
	denomination: Denomination;
	toggleDenomination: () => void;
	setDenomination: (denomination: Denomination) => void;
}

export const useDenominationStore = create<DenominationState>()(
	persist(
		(set) => ({
			denomination: Denomination.Sats,
			toggleDenomination: () =>
				set((state) => ({
					denomination:
						state.denomination === Denomination.Sats
							? Denomination.Btc
							: Denomination.Sats,
				})),
			setDenomination: (denomination) => set({ denomination }),
		}),
		{
			name: "denomination-storage",
		},
	),
);

export const formatAmount = (
	sats: number | null,
	denomination: Denomination,
): string => {
	if (sats === null) return "0";
	if (denomination === Denomination.Btc) {
		// Remove trailing zeroes after formatting to 8 decimals
		return (sats / 100000000)
			.toLocaleString("en-US", {
				minimumFractionDigits: 8,
				maximumFractionDigits: 8,
			})
			.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
	}
	return sats.toLocaleString("en-US");
};

export const parseAmountToSats = (
	amountInput: string,
	denomination: Denomination,
): number => {
	const raw = parseFloat(amountInput);
	if (Number.isNaN(raw)) return NaN;
	if (denomination === Denomination.Btc) {
		return Math.floor(raw * 100000000);
	}
	return Math.floor(raw);
};
