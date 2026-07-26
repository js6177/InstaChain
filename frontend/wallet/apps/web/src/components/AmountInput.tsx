import type * as React from "react";
import { useEffect, useRef } from "react";
import {
	useDenominationStore,
	Denomination,
	LABELS,
} from "@openl2/wallet-shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface AmountInputProps {
	value: string;
	onChange: (value: string) => void;
	maxSatsValue?: number;
}

export function AmountInput({
	value,
	onChange,
	maxSatsValue,
}: AmountInputProps): React.JSX.Element {
	const { denomination, toggleDenomination } = useDenominationStore();
	const prevDenomination = useRef(denomination);

	useEffect(() => {
		if (prevDenomination.current !== denomination) {
			if (value) {
				const num = parseFloat(value);
				if (!Number.isNaN(num)) {
					if (denomination === Denomination.Btc) {
						let btcStr = (num / 100_000_000).toFixed(8);
						btcStr = btcStr.replace(/\.?0+$/, "");
						onChange(btcStr === "" ? "0" : btcStr);
					} else {
						onChange(Math.round(num * 100_000_000).toString());
					}
				}
			}
			prevDenomination.current = denomination;
		}
	}, [denomination, value, onChange]);

	const handleSetMax = (): void => {
		if (maxSatsValue === undefined) return;
		if (denomination === Denomination.Sats) {
			onChange(maxSatsValue.toString());
		} else {
			let btcStr = (maxSatsValue / 100_000_000).toFixed(8);
			btcStr = btcStr.replace(/\.?0+$/, "");
			onChange(btcStr === "" ? "0" : btcStr);
		}
	};

	return (
		<div className="w-full">
			<div className="flex justify-between items-center mb-1">
				<Label>Amount ({denomination})</Label>
				<button
					onClick={toggleDenomination}
					className="text-xs text-muted-foreground hover:text-foreground uppercase"
					type="button"
				>
					{denomination} ⇄
				</button>
			</div>
			<div className="flex gap-2">
				<Input
					type="number"
					step={denomination === Denomination.Btc ? "0.00000001" : "1"}
					placeholder={LABELS.PLACEHOLDER_ENTER_AMOUNT}
					value={value}
					onChange={(e): void => onChange(e.target.value)}
				/>
				{maxSatsValue !== undefined && (
					<Button
						type="button"
						variant="secondary"
						onClick={handleSetMax}
						title={LABELS.TITLE_USE_MAX_BALANCE}
						className="px-3 shrink-0 uppercase text-xs font-semibold"
					>
						{LABELS.BUTTON_MAX}
					</Button>
				)}
			</div>
		</div>
	);
}
