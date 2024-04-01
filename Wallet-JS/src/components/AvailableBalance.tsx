import React from "react";
import BtcAmountDisplay from "./BtcAmountDisplay";

export function AvailableBalance(props: {walletBalance: number, availableBalanceText?: string}){
    const {walletBalance, availableBalanceText = "Available Balance: "} = props;
    return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>{availableBalanceText}</div>
        <BtcAmountDisplay amount={walletBalance} color="green"/>
    </div>
    )
}