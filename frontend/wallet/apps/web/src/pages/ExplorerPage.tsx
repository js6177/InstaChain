import { useState, useEffect } from "react";
import type * as React from "react";
import { useSearchParams, useNavigate, Routes, Route, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion } from "@/components/ui/accordion";
import { useAddressBalance, useTransactions, useTransaction } from "../hooks/useLayer2Queries";
import { useFindOAuthUserById } from "../hooks/useLayer2LedgerOauthManagerQueries";
import type { FindOauth2UserByIdRequest, OAuthService } from "@openl2/api-layer2oauthmanager";
import { TransactionItem } from "../components/TransactionItem";
import { useDenominationStore, formatAmount, ROUTES, useWalletStore, LABELS, TEST_IDS } from "@openl2/wallet-shared";
import { OAuthUserCard } from "../components/OAuthUserCard";

function SearchBar(): React.JSX.Element {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [query, setQuery] = useState(searchParams.get("q") || "");

    const handleSearch = (e: React.FormEvent): void => {
        e.preventDefault();
        if (!query.trim()) return;
        navigate(ROUTES.buildExplorerSearch(query.trim()));
    };

    return (
        <form onSubmit={handleSearch} className="flex gap-2 w-full max-w-2xl mx-auto mb-8">
            <Input
                placeholder="Search by Address Pubkey or Transaction ID..."
                value={query}
                onChange={(e: React.ChangeEvent<HTMLInputElement>): void => setQuery(e.target.value)}
                className="flex-1"
            />
            <Button type="submit">
                <Search className="w-4 h-4 mr-2" />
                {LABELS.BUTTON_SEARCH}
            </Button>
        </form>
    );
}

function AddressView(): React.JSX.Element | null {
    const { denomination } = useDenominationStore();
    const { addressId } = useParams();
    const { data: balance, isLoading: isBalanceLoading } = useAddressBalance(addressId || "");
    const { data: txData, isLoading: isTxLoading } = useTransactions(addressId || "");

    if (!addressId) return null;

    const isLoading = isBalanceLoading || isTxLoading;
    const transactionsList = txData?.transaction_groups?.flatMap(group => group.transactions) || [];
    const sortedTransactions = transactionsList.sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime());

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
                            <p className="text-2xl font-bold" data-testid={TEST_IDS.BALANCE_DISPLAY}>{isBalanceLoading ? "..." : formatAmount(balance?.balance, denomination)} {denomination}</p>
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

function TransactionViewWrapper(): React.JSX.Element | null {
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

function SearchRouter(): React.JSX.Element {
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

function OAuthUserExplorerView(): React.JSX.Element {
    const { service_name, service_specific_id } = useParams();
    const { denomination } = useDenominationStore();
    const findUserByIdRequest: FindOauth2UserByIdRequest | undefined = service_name && service_specific_id
        ? {
            service_name: service_name as unknown as OAuthService,
            service_specific_id,
        }
        : undefined;
    const { data, isLoading: isLoadingUser, error } = useFindOAuthUserById(findUserByIdRequest);

    const userData = data?.user;
    const pubkey = data?.layer2_address_pubkey ?? "";

    const { data: balance, isLoading: isBalanceLoading } = useAddressBalance(pubkey);
    const { data: txData, isLoading: isTxLoading } = useTransactions(pubkey);

    if (isLoadingUser) return <p className="text-muted-foreground animate-pulse text-center mt-10">{LABELS.TEXT_SEARCHING}</p>;
    if (error) return <p className="text-red-500 text-center mt-10">Error: {error.message}</p>;
    if (!userData) return <p className="text-muted-foreground text-center mt-10">User not found</p>;

    const isLoading = isBalanceLoading || isTxLoading;
    const transactionsList = txData?.transaction_groups?.flatMap(group => group.transactions) || [];
    const sortedTransactions = transactionsList.sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime());

    return (
        <div className="space-y-6 animate-in fade-in">
            <OAuthUserCard user={userData} />
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Address Overview</CardTitle>
                    <CardDescription className="font-mono break-all text-foreground mt-2">{pubkey || "No Layer2 Address found"}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Balance</p>
                            <p className="text-2xl font-bold" data-testid={TEST_IDS.BALANCE_DISPLAY}>{(isBalanceLoading && pubkey) ? "..." : formatAmount(balance?.balance, denomination)} {denomination}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Transactions</p>
                            <p className="text-2xl font-bold">{(isTxLoading && pubkey) ? "..." : transactionsList.length}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div>
                <h3 className="text-lg font-bold mb-4">Transactions</h3>
                {isLoading && pubkey && <p className="text-muted-foreground animate-pulse">{LABELS.TEXT_LOADING_TRANSACTIONS}</p>}
                {!isLoading && pubkey && sortedTransactions.length === 0 && <p className="text-muted-foreground">{LABELS.TEXT_NO_TRANSACTIONS}</p>}
                {!isLoading && pubkey && sortedTransactions.length > 0 && (
                    <Accordion type="single" collapsible className="w-full">
                        {sortedTransactions.map((tx) => (
                            <TransactionItem
                                key={tx.layer2_transaction_id}
                                transaction={tx}
                                currentAddress={pubkey}
                            />
                        ))}
                    </Accordion>
                )}
            </div>
        </div>
    );
}

export function ExplorerPage(): React.JSX.Element {
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
                <Route path={ROUTES.EXPLORER_OAUTH_USER} element={<OAuthUserExplorerView />} />
            </Routes>
        </div>
    );
}
