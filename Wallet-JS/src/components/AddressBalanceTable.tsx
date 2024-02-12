import React, { useState } from 'react';
import { useContext } from 'react';
import { Layer2LedgerContext } from '../context/Layer2LedgerContext';
import { Layer1AddressBalance } from '../services/messages/Layer1AuditReport';
import BtcAmountDisplay from './BtcAmountDisplay';

function AddressBalanceTable() {
    const { layer2LedgerState: layer2LedgerState } = useContext(Layer2LedgerContext);
    let addressBalances: Layer1AddressBalance[] = [];
    let sortedBalances: Layer1AddressBalance[] = [];
    const [showZeroBalances, setShowZeroBalances] = useState(true); 

    if (layer2LedgerState?.layer1AuditReport?.ready === true) {
        addressBalances = layer2LedgerState?.layer1AuditReport?.getAddressBalances();
        sortedBalances = addressBalances.sort((a, b) => b.getBalance() - a.getBalance());
    }

    const handleShowZeroBalancesChange = (event: { target: { checked: boolean | ((prevState: boolean) => boolean); }; }) => { // Step 2
        setShowZeroBalances(event.target.checked);
    };


    return (
        <div>
            <div>
                <h2>Layer 1 Audit Report</h2>
                <p>
                    Total Balance: <BtcAmountDisplay amount={layer2LedgerState?.layer1AuditReport?.totalBalance ?? 0} color="green" />
                </p>
            </div>
            <label>
                <input
                    type="checkbox"
                    checked={showZeroBalances}
                    onChange={handleShowZeroBalancesChange}
                />
                Show Zero Balances
            </label>
            <table>
                <thead>
                    <tr>
                        <th>Address</th>
                        <th>Balance</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedBalances.map((addressBalance) => (
                        ((showZeroBalances || addressBalance.getBalance() > 0) && ( // Step 3
                            <tr key={addressBalance.getAddress()}>
                                <td>{addressBalance.getAddress()}</td>
                                <BtcAmountDisplay amount={addressBalance.getBalance()} color="green"/>
                            </tr>
                        )
                    )))}
                </tbody>
            </table>
        </div>
    );
}

export default AddressBalanceTable;
