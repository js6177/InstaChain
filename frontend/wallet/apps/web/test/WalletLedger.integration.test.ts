import { beforeAll, describe, expect, it } from "vitest";

import {
	createRandomWallet,
	confirmLayer1Deposit,
	depositToAddress,
	expectDepositTransaction,
	expectTransferTransaction,
	expectWithdrawalTransaction,
	getAddressBalance,
	getAddressTransactions,
	getDepositAddress,
	getTransferFee,
	isLedgerIntegrationEnabled,
	loadBridgeConfig,
	seedWalletAddress,
	transferBetweenAddresses,
	waitForBalance,
	withdrawFromAddress,
} from "./ledger-integration-helpers";

const describeIntegration = describe.runIf(isLedgerIntegrationEnabled());

describeIntegration("Ledger API functional integration", () => {
	beforeAll(async () => {
		await loadBridgeConfig();
	});

	it("returns a layer1 testnet deposit address", async () => {
		const wallet = createRandomWallet();

		const depositAddress = await getDepositAddress(wallet);

		expect(depositAddress).toBeTruthy();
		expect(depositAddress.startsWith("tb1")).toBe(true);

		const secondDepositAddress = await getDepositAddress(wallet);
		expect(secondDepositAddress).not.toBe(depositAddress);
		expect(secondDepositAddress.startsWith("tb1")).toBe(true);
	});

	it("layer1 deposit to deposit address credits layer2 balance and records a deposit", async () => {
		const depositAmount = 30_000;
		const wallet = createRandomWallet();
		const address = wallet.addresses[0];

		expect(await getAddressBalance(address.public_key_str_base58)).toBe(0);

		const layer1DepositAddress = await getDepositAddress(wallet);
		expect(layer1DepositAddress.startsWith("tb1")).toBe(true);

		await confirmLayer1Deposit(layer1DepositAddress, depositAmount);
		await waitForBalance(address.public_key_str_base58, depositAmount);

		const balance = await getAddressBalance(address.public_key_str_base58);
		expect(balance).toBe(depositAmount);

		const transactions = await getAddressTransactions(
			address.public_key_str_base58,
		);
		expectDepositTransaction(
			transactions,
			depositAmount,
			address.public_key_str_base58,
		);
	});

	it("deposit credits address balance and records a deposit transaction", async () => {
		const depositAmount = 25_000;
		const wallet = createRandomWallet();
		const address = wallet.addresses[0];

		expect(await getAddressBalance(address.public_key_str_base58)).toBe(0);

		await depositToAddress(wallet, depositAmount);
		await waitForBalance(address.public_key_str_base58, depositAmount);

		const balance = await getAddressBalance(address.public_key_str_base58);
		expect(balance).toBe(depositAmount);

		const transactions = await getAddressTransactions(
			address.public_key_str_base58,
		);
		expectDepositTransaction(
			transactions,
			depositAmount,
			address.public_key_str_base58,
		);
	});

	it("transfer updates balances and transaction history for both addresses", async () => {
		const seedBalance = 500_000;
		const transferAmount = 10_000;
		const fee = await getTransferFee();

		const sourceWallet = createRandomWallet();
		const sourceAddress = sourceWallet.addresses[0];

		const destinationWallet = createRandomWallet();
		const destinationAddress = destinationWallet.addresses[0];

		await seedWalletAddress(
			sourceAddress.public_key_str_base58,
			seedBalance,
			false,
		);
		await waitForBalance(sourceAddress.public_key_str_base58, seedBalance);

		await transferBetweenAddresses(
			sourceAddress,
			destinationAddress.public_key_str_base58,
			transferAmount,
			fee,
		);

		await waitForBalance(
			sourceAddress.public_key_str_base58,
			seedBalance - transferAmount,
		);
		await waitForBalance(
			destinationAddress.public_key_str_base58,
			transferAmount,
		);

		const sourceBalance = await getAddressBalance(
			sourceAddress.public_key_str_base58,
		);
		const destinationBalance = await getAddressBalance(
			destinationAddress.public_key_str_base58,
		);

		expect(sourceBalance).toBe(seedBalance - transferAmount);
		expect(destinationBalance).toBe(transferAmount);

		const sourceTransactions = await getAddressTransactions(
			sourceAddress.public_key_str_base58,
		);
		const destinationTransactions = await getAddressTransactions(
			destinationAddress.public_key_str_base58,
		);

		expectTransferTransaction(
			sourceTransactions,
			transferAmount,
			sourceAddress.public_key_str_base58,
			destinationAddress.public_key_str_base58,
		);
		expectTransferTransaction(
			destinationTransactions,
			transferAmount,
			sourceAddress.public_key_str_base58,
			destinationAddress.public_key_str_base58,
		);
	});

	it("withdrawal debits address balance and records a withdrawal transaction", async () => {
		const seedBalance = 500_000;
		const withdrawAmount = 15_000;
		const layer1Destination = "tb1qintegrationtestwithdrawdestination000000000";

		const wallet = createRandomWallet();
		const sourceAddress = wallet.addresses[0];

		await seedWalletAddress(
			sourceAddress.public_key_str_base58,
			seedBalance,
			false,
		);
		await waitForBalance(sourceAddress.public_key_str_base58, seedBalance);

		await withdrawFromAddress(sourceAddress, layer1Destination, withdrawAmount);
		await waitForBalance(
			sourceAddress.public_key_str_base58,
			seedBalance - withdrawAmount,
		);

		const balance = await getAddressBalance(
			sourceAddress.public_key_str_base58,
		);
		expect(balance).toBe(seedBalance - withdrawAmount);

		const transactions = await getAddressTransactions(
			sourceAddress.public_key_str_base58,
		);
		expectWithdrawalTransaction(
			transactions,
			withdrawAmount,
			sourceAddress.public_key_str_base58,
		);
	});
});
