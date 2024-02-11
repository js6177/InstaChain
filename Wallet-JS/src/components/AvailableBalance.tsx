import React from "react";
import BtcAmountDisplay from "./BtcAmountDisplay";

export function AvailableBalance(props: {walletBalance: number}){
    const {walletBalance} = props;
    return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>{"Available Balance: "}</div>
        <BtcAmountDisplay amount={walletBalance} color="green"/>
    </div>
    )
}