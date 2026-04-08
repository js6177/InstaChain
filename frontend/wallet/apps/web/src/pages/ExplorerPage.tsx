import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Routes, Route, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion } from "@/components/ui/accordion";
import { useAddressBalance, useTransactions, useTransaction } from "../hooks/useLayer2Queries";
import { TransactionItem } from "../components/TransactionItem";
import { useDenominationStore, formatAmount, ROUTES, useWalletStore, LABELS } from "@wallet/shared";

function SearchBar() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [query, setQuery] = useState(searchParams.get("q") || "");

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;
        navigate(ROUTES.buildExplorerSearch(query.trim()));
    };

    return (
        <form onSubmit={handleSearch} className="flex gap-2 w-full max-w-2xl mx-auto mb-8">
            <Input
                placeholder="Search by Address Pubkey or Transaction ID..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
            />
            <Button type="submit">
                <Search className="w-4 h-4 mr-2" />
                {LABELS.BUTTON_SEARCH}
            </Button>
        </form>
    );
}

function AddressView() {
    const { denomination } = useDenominationStore();
    const { addressId } = useParams();
    const { data: balance, isLoading: isBalanceLoading } = useAddressBalance(addressId || "");
    const { data: txData, isLoading: isTxLoading } = useTransactions(addressId || "");

    if (!addressId) return null;

    const isLoading = isBalanceLoading || isTxLoading;
    const transactionsList = txData?.transaction_groups?.flatMap(group => group.transactions) || [];
    const sortedTransactions = transactionsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return (
        <div className="space-y-6 animate-in fade-in">
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Address Overview</CardTitle>
                    <CardDescription className="font-mono break-all text-foreground mt-2">{addressId}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Balance</p>
                            <p className="text-2xl font-bold">{isBalanceLoading ? "..." : formatAmount(balance?.balance, denomination)} {denomination}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Transactions</p>
                            <p className="text-2xl font-bold">{isTxLoading ? "..." : transactionsList.length}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div>
                <h3 className="text-lg font-bold mb-4">Transactions</h3>
                {isLoading && <p className="text-muted-foreground animate-pulse">{LABELS.TEXT_LOADING_TRANSACTIONS}</p>}
                {!isLoading && sortedTransactions.length === 0 && <p className="text-muted-foreground">{LABELS.TEXT_NO_TRANSACTIONS}</p>}
                {!isLoading && sortedTransactions.length > 0 && (
                    <Accordion type="single" collapsible className="w-full">
                        {sortedTransactions.map((tx) => (
                            <TransactionItem
                                key={tx.layer2_transaction_id}
                                transaction={tx}
                                currentAddress={addressId}
                            />
                        ))}
                    </Accordion>
                )}
            </div>
        </div>
    );
}

function TransactionViewWrapper() {
    const { txId } = useParams();
    const { data: txResponse, isLoading } = useTransaction(txId || "");
    const { mainAddress } = useWalletStore();

    if (!txId) return null;

    return (
        <div className="space-y-6 animate-in fade-in">
            <h2 className="text-xl font-bold mb-4">{LABELS.HEADING_TRANSACTION_DETAILS}</h2>
            {isLoading && <p className="text-muted-foreground animate-pulse">{LABELS.TEXT_LOADING_TRANSACTIONS}</p>}
            {!isLoading && !txResponse?.transaction && <p className="text-red-500">{LABELS.TEXT_TRANSACTION_NOT_FOUND}</p>}
            {!isLoading && txResponse?.transaction && (
                <Accordion type="single" collapsible defaultValue={txResponse.transaction.layer2_transaction_id} className="w-full">
                    <TransactionItem 
                        transaction={txResponse.transaction} 
                        currentAddress={mainAddress?.public_key_str_base58} 
                    />
                </Accordion>
            )}
        </div>
    );
}

function SearchRouter() {
    const [searchParams] = useSearchParams();
    const query = searchParams.get("q");
    const navigate = useNavigate();

    useEffect(() => {
        if (query) {
            // Todo: force transactions to be a specific length in the backend, in order to make searching/finding easier.
            if (query.length === 64 && /^[0-9a-fA-F]+$/.test(query)) {
                navigate(ROUTES.buildExplorerTransaction(query), { replace: true });
            } else {
                navigate(ROUTES.buildExplorerAddress(query), { replace: true });
            }
        }
    }, [query, navigate]);

    return <div className="text-center text-muted-foreground">{LABELS.TEXT_SEARCHING}</div>;
}

export function ExplorerPage() {
    return (
        <div className="max-w-4xl mx-auto w-full pt-4 pb-12">
            <div className="mb-8 text-center">
                <h1 className="text-4xl font-extrabold tracking-tight mb-2">Block Explorer</h1>
                <p className="text-muted-foreground">Search and view a Layer2 address or transaction</p>
            </div>

            <SearchBar />

            <Routes>
                <Route path="/" element={<div className="text-center text-sm text-muted-foreground mt-10">Enter a query above to begin.</div>} />
                <Route path={ROUTES.EXPLORER_SEARCH} element={<SearchRouter />} />
                <Route path={ROUTES.EXPLORER_ADDRESS} element={<AddressView />} />
                <Route path={ROUTES.EXPLORER_TRANSACTION} element={<TransactionViewWrapper />} />
            </Routes>
        </div>
    );
}
