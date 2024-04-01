// A class for displaying a Layer2 address and it's balance

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import React from "react";
import { AvailableBalance } from "./AvailableBalance";

class AddressBalanceViewProps {
    address: string = "";
    balance: number = 0;
}

function AddressBalanceView(props: AddressBalanceViewProps) {
    const { address, balance} = props;
    return (
        <Card >
            <Stack direction="column" spacing={0} sx={{ margin: '16px' }}>
                <Box>Address: {address}</Box>
                <AvailableBalance walletBalance={balance} availableBalanceText="Balance: "/>
            </Stack>
        </Card>
    );
}

export { AddressBalanceView, AddressBalanceViewProps}