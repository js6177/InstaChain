import {
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { GetTransactionsResponseTransaction } from "@openl2/api-layer2ledger";
import { TransactionType } from "@openl2/openl2-messaging";
import { ArrowDownIcon, ArrowUpIcon, ArrowRightLeftIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useDenominationStore, formatAmount, ROUTES, LABELS, TEST_IDS } from "@wallet/shared";

interface TransactionItemProps {
    transaction: GetTransactionsResponseTransaction;
    currentAddress?: string;
}

export function TransactionItem({ transaction, currentAddress }: TransactionItemProps) {
    const { denomination } = useDenominationStore();
    const isOutgoing = currentAddress ? transaction.source_address_pubkey === currentAddress : false;
    const isIncoming = currentAddress ? transaction.destination_address_pubkey === currentAddress : false;

    const getTypeString = (type: number) => {
        switch (type) {
            case TransactionType.TRX_TRANSFER: return LABELS.TX_TYPE_TRANSFER;
            case TransactionType.TRX_DEPOSIT: return LABELS.TX_TYPE_DEPOSIT;
            case TransactionType.TRX_WITHDRAWAL_INITIATED: return LABELS.TX_TYPE_WITHDRAWAL_INITIATED;
            case TransactionType.TRX_WITHDRAWAL_BROADCASTED: return LABELS.TX_TYPE_WITHDRAWAL_BROADCASTED;
            case TransactionType.TRX_WITHDRAWAL_CANCELED: return LABELS.TX_TYPE_WITHDRAWAL_CANCELED;
            case TransactionType.TRX_WITHDRAWAL_CONFIRMED: return LABELS.TX_TYPE_WITHDRAWAL_CONFIRMED;
            default: return LABELS.TX_TYPE_UNKNOWN;
        }
    };

    const getIcon = () => {
        if (isOutgoing) return <ArrowUpIcon className="w-4 h-4 text-red-500" />;
        if (isIncoming) return <ArrowDownIcon className="w-4 h-4 text-green-500" />;
        return <ArrowRightLeftIcon className="w-4 h-4 text-blue-500" />;
    };

    // Amount string with sign
    const formattedAmount = formatAmount(transaction.amount, denomination);
    const amountStr = isOutgoing ? `-${formattedAmount} ${denomination}` : (isIncoming ? `+${formattedAmount} ${denomination}` : `${formattedAmount} ${denomination}`);

    return (
        <AccordionItem value={transaction.layer2_transaction_id} className="border bg-card rounded-md px-4 mb-2">
            <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center justify-between w-full text-left pr-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-full">
                            {getIcon()}
                        </div>
                        <div className="overflow-hidden">
                            <p className="font-semibold text-sm w-32 truncate" title={transaction.layer2_transaction_id} data-testid={TEST_IDS.TRANSACTION_TITLE}>
                                <Link 
                                    to={ROUTES.buildExplorerTransaction(transaction.layer2_transaction_id)} 
                                    onClick={(e) => e.stopPropagation()} 
                                    className="hover:underline"
                                >
                                    {transaction.layer2_transaction_id}
                                </Link>
                            </p>
                            <div className="text-xs text-muted-foreground truncate w-48">
                                {new Date(transaction.timestamp).toLocaleString()}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                        <span className={`font-mono font-bold ${isOutgoing ? 'text-red-500' : (isIncoming ? 'text-green-500' : '')}`}>
                            {amountStr}
                        </span>
                        <Badge variant="outline" className="text-[10px] h-4 leading-3 px-1">{getTypeString(transaction.transaction_type)}</Badge>
                    </div>
                </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm border-t pt-3 pb-4">
                <div className="space-y-2 font-mono text-xs">
                    <div className="grid grid-cols-[120px_1fr] items-start">
                        <span className="text-muted-foreground">{LABELS.KEY_ID}</span>
                        <Link to={ROUTES.buildExplorerTransaction(transaction.layer2_transaction_id)} className="break-all text-blue-500 hover:underline">
                            {transaction.layer2_transaction_id}
                        </Link>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] items-start">
                        <span className="text-muted-foreground">{LABELS.KEY_TYPE}</span>
                        <span>{getTypeString(transaction.transaction_type)} ({transaction.transaction_type})</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] items-start">
                        <span className="text-muted-foreground">{LABELS.KEY_AMOUNT}</span>
                        <span>{formatAmount(transaction.amount, denomination)} {denomination}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] items-start">
                        <span className="text-muted-foreground">{LABELS.KEY_FEE}</span>
                        <span>{formatAmount(transaction.fee, denomination)} {denomination}</span>
                    </div>
                    {transaction.transaction_type === TransactionType.TRX_TRANSFER ? (
                        <>
                            <div className="grid grid-cols-[120px_1fr] items-start">
                                <span className="text-muted-foreground">{LABELS.KEY_FROM}</span>
                                <Link to={ROUTES.buildExplorerAddress(transaction.source_address_pubkey)} className="break-all text-blue-500 hover:underline">
                                    {transaction.source_address_pubkey}
                                </Link>
                            </div>
                            <div className="grid grid-cols-[120px_1fr] items-start">
                                <span className="text-muted-foreground">{LABELS.KEY_TO}</span>
                                <Link to={ROUTES.buildExplorerAddress(transaction.destination_address_pubkey)} className="break-all text-blue-500 hover:underline">
                                    {transaction.destination_address_pubkey}
                                </Link>
                            </div>
                        </>
                    ) : (
                        <div className="grid grid-cols-[120px_1fr] items-start">
                            <span className="text-muted-foreground">{LABELS.KEY_LAYER1_TXID}</span>
                            <span className="break-all text-foreground">{transaction.layer1_transaction_id || LABELS.VALUE_PENDING}</span>
                        </div>
                    )}
                    <div className="grid grid-cols-[120px_1fr] items-start">
                        <span className="text-muted-foreground">{LABELS.KEY_DATE}</span>
                        <span>{new Date(transaction.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] items-start">
                        <span className="text-muted-foreground">{LABELS.KEY_SIGNATURE}</span>
                        <span className="break-all text-muted-foreground">{transaction.signature}</span>
                    </div>
                </div>
            </AccordionContent>
        </AccordionItem>
    );
}
