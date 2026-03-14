import { useState } from "react";
import { useWalletStore } from "@wallet/shared";
import { buildGetDepositAddressMessage, buildTransferMessage } from "openl2_messaging";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion } from "@/components/ui/accordion";
import { toast } from "sonner";
import { useAddressBalance, useTransactions, useDepositAddressMutation, useTransferMutation, useNodeInfo } from "../hooks/useLayer2Queries";
import { TransactionItem } from "../components/TransactionItem";

export function WalletPage() {
    const { isLoaded, wallet, mainAddress, generateWallet, loadWalletFromMnemonic, logout, validateMnemonic } = useWalletStore();
    const [mnemonicInput, setMnemonicInput] = useState("");
    const [isMnemonicDialogOpen, setIsMnemonicDialogOpen] = useState(false);

    // Queries
    const { data: balance, isLoading: isBalanceLoading, refetch: refetchBalance } = useAddressBalance(mainAddress?.public_key_str_base58 || "");
    const { data: transactionsData, isLoading: isTransactionsLoading, refetch: refetchTransactions } = useTransactions(mainAddress?.public_key_str_base58 || "");
    const { data: nodeInfo, isLoading: isNodeInfoLoading } = useNodeInfo();

    const depositAddressMutation = useDepositAddressMutation();
    const transferMutation = useTransferMutation();

    const [depositDialogOpen, setDepositDialogOpen] = useState(false);
    const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
    const [transferDialogOpen, setTransferDialogOpen] = useState(false);

    // Forms
    const [transferTo, setTransferTo] = useState("");
    const [transferAmount, setTransferAmount] = useState("");
    const [withdrawTo, setWithdrawTo] = useState("");
    const [withdrawAmount, setWithdrawAmount] = useState("");
    const [depositAddress, setDepositAddress] = useState("");

    const handleRestore = () => {
        const words = mnemonicInput.trim().split(" ");
        if (words.length !== 12) {
            toast.error("Mnemonic must be exactly 12 words");
            return;
        }
        try {
            if (!validateMnemonic(words)) {
                toast.error("Invalid mnemonic. Make sure words are valid.");
                return;
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
            const amt = parseFloat(transferAmount);
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

    // Logout
    const handleLogout = () => {
        logout();
        toast.info("Wallet closed.");
    };

    if (!isLoaded) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-in fade-in duration-500">
                <div className="text-center space-y-2">
                    <h1 className="text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-teal-400">OpenL2 Web Wallet</h1>
                    <p className="text-muted-foreground text-lg max-w-lg mx-auto">Generate a new Layer2 wallet or restore an existing one to get started.</p>
                </div>
                <div className="flex gap-4 mt-4">
                    <Button size="lg" onClick={() => {
                        generateWallet();
                        toast.success("New Wallet Generated!");
                    }}>
                        Generate New Wallet
                    </Button>

                    <Dialog open={isMnemonicDialogOpen} onOpenChange={setIsMnemonicDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="lg" variant="outline">Restore Wallet</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Restore Wallet</DialogTitle>
                                <DialogDescription>
                                    Enter your 12-word mnemonic phrase separated by spaces.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-2">
                                <Label htmlFor="mnemonic" className="sr-only">Mnemonic Phase</Label>
                                <Input
                                    id="mnemonic"
                                    placeholder="word1 word2 ... word12"
                                    value={mnemonicInput}
                                    onChange={(e) => setMnemonicInput(e.target.value)}
                                />
                            </div>
                            <DialogFooter>
                                <Button onClick={handleRestore}>Restore</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
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
                    <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
                        Securely interacting with Layer2
                    </p>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">Close wallet</Button>
            </div>

            <Card className="border-2 shadow-sm">
                <CardHeader className="bg-muted/50 pb-4">
                    <CardTitle className="text-lg text-muted-foreground font-medium uppercase tracking-wider">Main Address</CardTitle>
                    <CardDescription className="text-xl font-mono text-foreground break-all bg-background border p-3 rounded-md mt-2">
                        {mainAddress?.public_key_str_base58}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Available Balance</p>
                            <div className="text-5xl font-extrabold tracking-tight">
                                {isBalanceLoading ? "..." : (balance?.balance || 0)} <span className="text-2xl text-muted-foreground font-normal">sats</span>
                            </div>
                        </div>

                        <div className="flex gap-2 w-full md:w-auto">
                            <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button className="flex-1 md:flex-none bg-green-600 hover:bg-green-700">Deposit</Button>
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
                                            {depositAddressMutation.isPending ? "Generating..." : "Get Deposit Address"}
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
                                    <Button className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700">Withdraw</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Withdraw to Layer1</DialogTitle>
                                        <DialogDescription>
                                            Withdraw funds to the Bitcoin network.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4 space-y-4">
                                        <div>
                                            <Label>Amount (sats)</Label>
                                            <Input type="number" placeholder="Enter amount" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
                                        </div>
                                        <div>
                                            <Label>Destination Layer1 Address</Label>
                                            <Input placeholder="btc..." value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)} />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button disabled>Withdraw</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button className="flex-1 md:flex-none">Transfer</Button>
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
                                        <div>
                                            <Label>Amount (sats)</Label>
                                            <Input type="number" placeholder="Enter amount" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleTransfer} disabled={transferMutation.isPending}>
                                            {transferMutation.isPending ? "Sending..." : "Transfer"}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="bg-muted/10 pt-4 pb-4 px-6 border-t flex justify-between text-xs text-muted-foreground">
                    <div>
                        <span className="font-semibold text-foreground mr-1">Mnemonic Phrase:</span>
                        <span className="blur-sm hover:blur-none transition-all duration-300 font-mono tracking-wide">
                            {wallet?.mnemonic?.join(" ") || ""}
                        </span>
                    </div>
                </CardFooter>
            </Card>

            <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                    <h3 className="text-xl font-bold tracking-tight">Recent Transactions</h3>
                    <Button variant="link" size="sm" onClick={() => refetchTransactions()} disabled={isTransactionsLoading}>
                        {isTransactionsLoading ? "Refreshing..." : "Refresh"}
                    </Button>
                </div>

                {isTransactionsLoading && (
                    <div className="text-center py-10 text-muted-foreground animate-pulse">
                        Loading transactions...
                    </div>
                )}

                {!isTransactionsLoading && sortedTransactions.length === 0 && (
                    <div className="text-center py-10 bg-muted/30 rounded-lg border border-dashed">
                        <p className="text-muted-foreground">No transactions found.</p>
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
