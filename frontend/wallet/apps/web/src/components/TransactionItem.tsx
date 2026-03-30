import {
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { GetTransactionsResponseTransaction } from "@wallet/api-layer2ledger";
import { TransactionType } from "openl2_messaging";
import { ArrowDownIcon, ArrowUpIcon, ArrowRightLeftIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useDenominationStore, formatAmount } from "@wallet/shared";

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
            case TransactionType.TRX_TRANSFER: return "Transfer";
            case TransactionType.TRX_DEPOSIT: return "Deposit";
            case TransactionType.TRX_WITHDRAWAL_INITIATED: return "Withdrawal Initiated";
            case TransactionType.TRX_WITHDRAWAL_BROADCASTED: return "Withdrawal Broadcasted";
            case TransactionType.TRX_WITHDRAWAL_CANCELED: return "Withdrawal Canceled";
            case TransactionType.TRX_WITHDRAWAL_CONFIRMED: return "Withdrawal Confirmed";
            default: return "Unknown";
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
                            <p className="font-semibold text-sm w-32 truncate" title={transaction.layer2_transaction_id}>
                                {transaction.layer2_transaction_id}
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
                        <span className="text-muted-foreground">ID:</span>
                        <span className="break-all">{transaction.layer2_transaction_id}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] items-start">
                        <span className="text-muted-foreground">Type:</span>
                        <span>{getTypeString(transaction.transaction_type)} ({transaction.transaction_type})</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] items-start">
                        <span className="text-muted-foreground">Amount:</span>
                        <span>{formatAmount(transaction.amount, denomination)} {denomination}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] items-start">
                        <span className="text-muted-foreground">Fee:</span>
                        <span>{formatAmount(transaction.fee, denomination)} {denomination}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] items-start">
                        <span className="text-muted-foreground">From:</span>
                        <Link to={`/explorer/address/${transaction.source_address_pubkey}`} className="break-all text-blue-500 hover:underline">
                            {transaction.source_address_pubkey}
                        </Link>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] items-start">
                        <span className="text-muted-foreground">To:</span>
                        <Link to={`/explorer/address/${transaction.destination_address_pubkey}`} className="break-all text-blue-500 hover:underline">
                            {transaction.destination_address_pubkey}
                        </Link>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] items-start">
                        <span className="text-muted-foreground">Date:</span>
                        <span>{new Date(transaction.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] items-start">
                        <span className="text-muted-foreground">Signature:</span>
                        <span className="break-all text-muted-foreground">{transaction.signature}</span>
                    </div>
                </div>
            </AccordionContent>
        </AccordionItem>
    );
}
