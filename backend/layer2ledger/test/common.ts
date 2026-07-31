import { Layer2Address } from "@openl2/pubkey-utils";

export function newLayer2Address(): Layer2Address {
	const address = new Layer2Address(
		"",
		"",
		"",
		new Uint8Array(),
		new Uint8Array(),
	);
	address.generateNewAddress();
	return address;
}
