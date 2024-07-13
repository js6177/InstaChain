import { Transaction } from "./wallet";
import _ from 'lodash';

export function AreTransactionsEqual(t1: Transaction, t2: Transaction): boolean {
    return t1.id === t2.id;

    // TODO: Implement custom comparison for withdrawal transactions, 
    // since layer1_transaction_id may start as null and then be set to a value once the transaction is confirmed
}

//Compare if two arrays contain the same transactions
export function AreTransactionArraysEqual(t1: Transaction[], t2: Transaction[]): boolean {
    if(t1 == null || t2 == null){
        return false;
    }
    const t1Set = new Set();
    const t2Set = new Set();

    t1.forEach((t) => t1Set.add(t.id));
    t2.forEach((t) => t2Set.add(t.id));

    return _.isEqual(t1Set, t2Set);
}