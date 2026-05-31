import { useState } from "react";
import { MNEUMONIC_WORD_COUNT, useWalletStore, useDenominationStore, formatAmount, parseAmountToSats, Denomination, LABELS, TEST_IDS } from "@wallet/shared";
import { buildGetDepositAddressMessage, buildTransferMessage, buildWithdrawalRequestMessage } from "openl2_messaging";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion } from "@/components/ui/accordion";
import { toast } from "sonner";
import { useAddressBalance, useTransactions, useDepositAddressMutation, useTransferMutation, useNodeInfo, useWithdrawMutation } from "../hooks/useLayer2Queries";
import { TransactionItem } from "../components/TransactionItem";
import { CopyableDisplay, FitTextMethod } from "../components/CopyableDisplay";
import { AmountInput } from "../components/AmountInput";
import { TwitterLoginWithOAuth2Login, GithubLoginWithOAuth2Login, GoogleLoginWithOAuth2Login, FacebookLoginWithOAuth2Login } from "../components/OAuth2LoginButton";
import { OAuthUserCard } from "../components/OAuthUserCard";

export function WalletPage() {
    const { isLoaded, wallet, mainAddress, generateWallet, loadWalletFromMnemonic, logout, validateMnemonic, setOAuthUser } = useWalletStore();
    const { denomination, toggleDenomination } = useDenominationStore();
    const [mnemonicInput, setMnemonicInput] = useState("");
    const [isMnemonicDialogOpen, setIsMnemonicDialogOpen] = useState(false);

    // Queries
    const { data: balance, isLoading: isBalanceLoading, refetch: refetchBalance } = useAddressBalance(mainAddress?.public_key_str_base58 || "");
    const { data: transactionsData, isLoading: isTransactionsLoading, refetch: refetchTransactions } = useTransactions(mainAddress?.public_key_str_base58 || "");
    const { data: nodeInfo, isLoading: isNodeInfoLoading } = useNodeInfo();

    const depositAddressMutation = useDepositAddressMutation();
    const transferMutation = useTransferMutation();
    const withdrawMutation = useWithdrawMutation();

    const [depositDialogOpen, setDepositDialogOpen] = useState(false);
    const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
    const [transferDialogOpen, setTransferDialogOpen] = useState(false);

    // Forms
    const [transferTo, setTransferTo] = useState("");
    const [transferAmount, setTransferAmount] = useState("");
    const [withdrawTo, setWithdrawTo] = useState("");
    const [withdrawAmount, setWithdrawAmount] = useState("");
    const [depositAddress, setDepositAddress] = useState("");
    const [saveSeedToLocalStorage, setSaveSeedToLocalStorage] = useState(false);
    const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
    const [isMnemonicHidden, setIsMnemonicHidden] = useState(false);
    const [isHideMnemonicDialogOpen, setIsHideMnemonicDialogOpen] = useState(false);

    const handleLoadFromLocalStorage = () => {
        const stored = localStorage.getItem("debug_mnemonic");
        if (stored) {
            setMnemonicInput(stored);
            toast.success("Mnemonic loaded from localStorage");
        } else {
            toast.error("No mnemonic found in localStorage");
        }
    };

    const handleGenerate = () => {
        generateWallet();
        // Since generateWallet is synchronous in the store, we can access the updated state
        // but it's safer to get it from the store directly or let the effect handle it.
        // For debugging, we can just grab it from the store instance.
        setTimeout(() => {
            const mnemonic = useWalletStore.getState().wallet?.mnemonic;
            if (saveSeedToLocalStorage && mnemonic) {
                localStorage.setItem("debug_mnemonic", mnemonic.join(" "));
                toast.info("Seed saved to localStorage");
            }
        }, 0);
        setIsGenerateDialogOpen(false);
        toast.success("New Wallet Generated!");
    };

    const handleRestore = () => {
        const words = mnemonicInput.trim().split(" ");
        if (words.length !== MNEUMONIC_WORD_COUNT) {
            toast.error(`Mnemonic phrase must be exactly ${MNEUMONIC_WORD_COUNT} words`);
            return;
        }
        try {
            if (!validateMnemonic(words)) {
                toast.error("Invalid mnemonic. Make sure words are valid.");
                return;
            }

            if (saveSeedToLocalStorage) {
                localStorage.setItem("debug_mnemonic", mnemonicInput.trim());
                toast.info("Seed saved to localStorage");
            }

            loadWalletFromMnemonic(words);
            setIsMnemonicDialogOpen(false);
            toast.success("Wallet loaded successfully!");
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to load wallet");
        }
    };

    const handleGetDepositAddress = async () => {
        if (!mainAddress) return;
        try {
            const nonce = crypto.randomUUID();
            const msg = buildGetDepositAddressMessage(nodeInfo?.node_info.node_id || "", nodeInfo?.node_info.asset_id || "", mainAddress.public_key_str_base58, nonce);
            const sig = await mainAddress.signMessage(msg);

            const addr = await depositAddressMutation.mutateAsync({
                layer2_address_pubkey: mainAddress.public_key_str_base58,
                nonce,
                signature: sig
            });
            setDepositAddress(addr || "");
            toast.success("Deposit address generated.");
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Error generating deposit address");
        }
    };

    const handleTransfer = async () => {
        if (!mainAddress) return;
        try {
            const amt = parseAmountToSats(transferAmount, denomination);
            if (isNaN(amt) || amt <= 0) {
                toast.error("Invalid amount");
                return;
            }
            // TODO: get fee from get_fee API
            const fee = 10;
            const nonce = crypto.randomUUID();
            const msg = buildTransferMessage(nodeInfo?.node_info.node_id || "", nodeInfo?.node_info.asset_id || "", mainAddress.public_key_str_base58, transferTo, amt, fee, nonce);
            const sig = await mainAddress.signMessage(msg);

            await transferMutation.mutateAsync({
                source_address_public_key: mainAddress.public_key_str_base58,
                destination_address_public_key: transferTo,
                amount: amt,
                fee: fee,
                transaction_id: nonce,
                signature: sig
            });

            toast.success("Transfer submitted!");
            setTransferDialogOpen(false);
            refetchBalance();
            refetchTransactions();
        } catch (e: unknown) {
            toast.error("Transfer failed: " + (e instanceof Error ? e.message : "Unknown error"));
        }
    };

    const handleWithdraw = async () => {
        if (!mainAddress) return;
        try {
            const amt = parseAmountToSats(withdrawAmount, denomination);
            if (isNaN(amt) || amt <= 0) {
                toast.error("Invalid amount");
                return;
            }
            if (!withdrawTo) {
                toast.error("Destination address is required");
                return;
            }

            const nonce = crypto.randomUUID();
            const msg = buildWithdrawalRequestMessage(
                nodeInfo?.node_info.node_id || "",
                nodeInfo?.node_info.asset_id || "",
                mainAddress.public_key_str_base58,
                withdrawTo,
                nonce,
                amt
            );
            const sig = await mainAddress.signMessage(msg);

            await withdrawMutation.mutateAsync({
                source_address_public_key: mainAddress.public_key_str_base58,
                layer1_withdrawal_address: withdrawTo,
                amount: amt,
                layer2_transaction_id: nonce,
                signature: sig
            });

            toast.success("Withdrawal requested!");
            setWithdrawDialogOpen(false);
            refetchBalance();
            refetchTransactions();
        } catch (e: unknown) {
            toast.error("Withdrawal failed: " + (e instanceof Error ? e.message : "Unknown error"));
        }
    };

    // Logout
    const handleLogout = () => {
        logout();
        toast.info("Wallet closed.");
    };

    if (!isLoaded) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-in fade-in duration-500">
                <div className="text-center space-y-2">
                    <h1 className="text-5xl font-extrabold tracking-tight text-logo-color">OpenL2 Web Wallet</h1>
                    <p className="text-muted-foreground text-lg max-w-lg mx-auto">Generate a new Layer2 wallet or restore an existing one to get started.</p>
                </div>
                <div className="flex flex-col items-center gap-6 mt-4 w-full max-w-sm">
                    <div className="flex gap-4 w-full justify-center">
                        <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
                            <DialogTrigger asChild>
                                <Button size="lg">Generate New Wallet</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Generate New Wallet</DialogTitle>
                                    <DialogDescription>
                                        This will create a new set of keys and a mnemonic phrase.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="py-4 space-y-4">
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            id="saveSeed"
                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                            checked={saveSeedToLocalStorage}
                                            onChange={(e) => setSaveSeedToLocalStorage(e.target.checked)}
                                        />
                                        <Label htmlFor="saveSeed" className="cursor-pointer">
                                            Store seed in localStorage (debug)
                                        </Label>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button onClick={handleGenerate}>Generate</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        <Dialog open={isMnemonicDialogOpen} onOpenChange={setIsMnemonicDialogOpen}>
                            <DialogTrigger asChild>
                                <Button size="lg" variant="outline" data-testid={TEST_IDS.RESTORE_WALLET_TRIGGER}>{LABELS.BUTTON_RESTORE_WALLET}</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>{LABELS.BUTTON_RESTORE_WALLET}</DialogTitle>
                                    <DialogDescription>
                                        Enter your {MNEUMONIC_WORD_COUNT}-word mnemonic phrase separated by spaces.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="py-2">
                                    <Label htmlFor="mnemonic" className="sr-only">Mnemonic Phase</Label>
                                    <Input
                                        id="mnemonic"
                                        data-testid={TEST_IDS.MNEMONIC_INPUT}
                                        placeholder="word1 word2 ... word12"
                                        value={mnemonicInput}
                                        onChange={(e) => setMnemonicInput(e.target.value)}
                                    />
                                </div>
                                <div className="flex items-center space-x-2 py-2">
                                    <input
                                        type="checkbox"
                                        id="saveSeedRestore"
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        checked={saveSeedToLocalStorage}
                                        onChange={(e) => setSaveSeedToLocalStorage(e.target.checked)}
                                    />
                                    <Label htmlFor="saveSeedRestore" className="cursor-pointer">
                                        Store seed in localStorage (debug)
                                    </Label>
                                </div>
                                <DialogFooter className="flex justify-between sm:justify-between items-center w-full">
                                    <Button variant="ghost" size="sm" onClick={handleLoadFromLocalStorage} className="text-xs">
                                        Load seed from localstorage
                                    </Button>
                                    <Button onClick={handleRestore} data-testid={TEST_IDS.RESTORE_WALLET_BUTTON}>{LABELS.BUTTON_RESTORE}</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="relative flex items-center py-2 w-full">
                        <div className="flex-grow border-t border-muted"></div>
                        <span className="flex-shrink-0 mx-4 text-muted-foreground text-sm uppercase tracking-wider font-medium">Or</span>
                        <div className="flex-grow border-t border-muted"></div>
                    </div>

                    <div className="flex flex-col gap-3 w-full">
                        <TwitterLoginWithOAuth2Login 
                            onSuccess={(data) => {
                                if (data?.user_keys?.l2_address_mneumonic) {
                                    if (data.user) setOAuthUser(data.user);
                                    loadWalletFromMnemonic(data.user_keys.l2_address_mneumonic.split(' '));
                                    toast.success("Logged in with Twitter successfully!");
                                } else {
                                    toast.error("Invalid keys received from server.");
                                }
                            }}
                            onError={(err) => toast.error(err)}
                        />
                        <GithubLoginWithOAuth2Login 
                            onSuccess={(data) => {
                                if (data?.user_keys?.l2_address_mneumonic) {
                                    if (data.user) setOAuthUser(data.user);
                                    loadWalletFromMnemonic(data.user_keys.l2_address_mneumonic.split(' '));
                                    toast.success("Logged in with Github successfully!");
                                } else {
                                    toast.error("Invalid keys received from server.");
                                }
                            }}
                            onError={(err) => toast.error(err)}
                        />
                        <GoogleLoginWithOAuth2Login 
                            onSuccess={(data) => {
                                if (data?.user_keys?.l2_address_mneumonic) {
                                    if (data.user) setOAuthUser(data.user);
                                    loadWalletFromMnemonic(data.user_keys.l2_address_mneumonic.split(' '));
                                    toast.success("Logged in with Google successfully!");
                                } else {
                                    toast.error("Invalid keys received from server.");
                                }
                            }}
                            onError={(err) => toast.error(err)}
                        />
                        <FacebookLoginWithOAuth2Login 
                            onSuccess={(data) => {
                                if (data?.user_keys?.l2_address_mneumonic) {
                                    if (data.user) setOAuthUser(data.user);
                                    loadWalletFromMnemonic(data.user_keys.l2_address_mneumonic.split(' '));
                                    toast.success("Logged in with Facebook successfully!");
                                } else {
                                    toast.error("Invalid keys received from server.");
                                }
                            }}
                            onError={(err) => toast.error(err)}
                        />
                    </div>
                </div>
            </div>
        );
    }

    const transactionsList = transactionsData?.transaction_groups?.flatMap(group => group.transactions) || [];
    const sortedTransactions = transactionsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return (
        <div className="flex flex-col gap-8 max-w-4xl mx-auto animate-in fade-in duration-500 pt-4 pb-12">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Your Wallet</h1>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">Close wallet</Button>
            </div>
            <OAuthUserCard />

            <Card className="border-2 shadow-sm">
                <CardHeader className="pb-4">
                    <CopyableDisplay
                        label="Main Address"
                        labelClassName="text-lg text-muted-foreground font-medium uppercase tracking-wider"
                        value={mainAddress?.public_key_str_base58}
                        fitTextInView={true}
                        fitTextInViewMethod={FitTextMethod.ShrinkTextFontSize}
                    />
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Available Balance</p>
                            <div className="text-5xl font-extrabold tracking-tight" data-testid={TEST_IDS.BALANCE_DISPLAY}>
                                {isBalanceLoading ? "..." : formatAmount(balance?.balance, denomination)} <button onClick={toggleDenomination} className="text-2xl text-muted-foreground font-normal hover:text-foreground transition-colors">{denomination}</button>
                            </div>
                        </div>

                        <div className="flex gap-2 w-full md:w-auto">
                            <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button className="flex-1 md:flex-none bg-green-600 hover:bg-green-700">{LABELS.BUTTON_DEPOSIT}</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Deposit to Layer2</DialogTitle>
                                        <DialogDescription>
                                            Generate a Layer1 BTC address to fund your Layer2 wallet.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4 space-y-4">
                                        <Button variant="secondary" className="w-full" onClick={handleGetDepositAddress} disabled={depositAddressMutation.isPending}>
                                            {depositAddressMutation.isPending ? LABELS.BUTTON_GENERATING : LABELS.BUTTON_GET_DEPOSIT_ADDRESS}
                                        </Button>
                                        {depositAddress && (
                                            <div className="p-4 bg-muted rounded border border-green-500/50 break-all font-mono text-center">
                                                {depositAddress}
                                            </div>
                                        )}
                                    </div>
                                </DialogContent>
                            </Dialog>

                            <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700">{LABELS.BUTTON_WITHDRAW}</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Withdraw to Layer1</DialogTitle>
                                        <DialogDescription>
                                            Withdraw funds to the Bitcoin network.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4 space-y-4">
                                        <AmountInput value={withdrawAmount} onChange={setWithdrawAmount} maxSatsValue={balance?.balance} />
                                        <div>
                                            <Label>Destination Layer1 Address</Label>
                                            <Input placeholder="btc..." value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)} />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleWithdraw} disabled={withdrawMutation.isPending}>
                                            {withdrawMutation.isPending ? LABELS.BUTTON_WITHDRAWING : LABELS.BUTTON_WITHDRAW}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button className="flex-1 md:flex-none">{LABELS.BUTTON_TRANSFER}</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Transfer</DialogTitle>
                                        <DialogDescription>
                                            Send funds instantly to another Layer2 address.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4 space-y-4">
                                        <div>
                                            <Label>Destination Layer2 Address</Label>
                                            <Input placeholder="Enter destination pubkey" value={transferTo} onChange={(e) => setTransferTo(e.target.value)} />
                                        </div>
                                        <AmountInput value={transferAmount} onChange={setTransferAmount} maxSatsValue={balance?.balance} />
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleTransfer} disabled={transferMutation.isPending}>
                                            {transferMutation.isPending ? LABELS.BUTTON_SENDING : LABELS.BUTTON_TRANSFER}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </CardContent>
                {!isMnemonicHidden && wallet?.mnemonic && (
                    <CardFooter className="bg-muted/10 pt-4 pb-4 px-6 border-t flex flex-col gap-2 items-end">
                        <div className="w-full flex justify-between text-xs text-muted-foreground">
                            <CopyableDisplay
                                label="Mnemonic Phrase:"
                                value={wallet?.mnemonic}
                                secret={true}
                                textClassName="font-mono text-[11px] leading-relaxed break-words"
                            />
                        </div>
                        <Dialog open={isHideMnemonicDialogOpen} onOpenChange={setIsHideMnemonicDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-7 text-xs">
                                    {LABELS.BUTTON_HIDE}
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>{LABELS.DIALOG_HIDE_MNEMONIC_TITLE}</DialogTitle>
                                    <DialogDescription>
                                        {LABELS.DIALOG_HIDE_MNEMONIC_DESC}
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsHideMnemonicDialogOpen(false)}>{LABELS.BUTTON_CANCEL}</Button>
                                    <Button variant="destructive" onClick={() => { setIsMnemonicHidden(true); setIsHideMnemonicDialogOpen(false); }}>{LABELS.BUTTON_HIDE_PERMANENTLY}</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </CardFooter>
                )}
            </Card>

            <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                    <h3 className="text-xl font-bold tracking-tight">{LABELS.HEADING_RECENT_TRANSACTIONS}</h3>
                    <Button variant="link" size="sm" onClick={() => { refetchTransactions(); refetchBalance(); }} disabled={isTransactionsLoading || isBalanceLoading}>
                        {isTransactionsLoading || isBalanceLoading ? LABELS.BUTTON_REFRESHING : LABELS.BUTTON_REFRESH}
                    </Button>
                </div>

                {isTransactionsLoading && (
                    <div className="text-center py-10 text-muted-foreground animate-pulse">
                        {LABELS.TEXT_LOADING_TRANSACTIONS}
                    </div>
                )}

                {!isTransactionsLoading && sortedTransactions.length === 0 && (
                    <div className="text-center py-10 bg-muted/30 rounded-lg border border-dashed">
                        <p className="text-muted-foreground">{LABELS.TEXT_NO_TRANSACTIONS}</p>
                    </div>
                )}

                {!isTransactionsLoading && sortedTransactions.length > 0 && (
                    <Accordion type="single" collapsible className="w-full">
                        {sortedTransactions.map((tx) => (
                            <TransactionItem
                                key={tx.layer2_transaction_id}
                                transaction={tx}
                                currentAddress={mainAddress?.public_key_str_base58}
                            />
                        ))}
                    </Accordion>
                )}
            </div>
        </div>
    );
}
