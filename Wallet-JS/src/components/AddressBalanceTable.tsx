import React, { useState } from 'react';
import { useContext } from 'react';
import { Layer2LedgerContext } from '../context/Layer2LedgerContext';
import { Layer1AddressBalance } from '../services/messages/Layer1AuditReport';

function AddressBalanceTable() {
    const { layer1AuditReportResponse } = useContext(Layer2LedgerContext);
    let addressBalances: Layer1AddressBalance[] = [];
    let sortedBalances: Layer1AddressBalance[] = [];
    const totalBalance = 0;
    const [showZeroBalances, setShowZeroBalances] = useState(true); // Step 1

    ////console.log("AddressBalanceTable() layer1AuditReport: " + JSON.stringify(layer1AuditReportResponse));
    ////console.log("AddressBalanceTable() totalbaalance: " + layer1AuditReportResponse.totalBalance);
    if (layer1AuditReportResponse.ready === true) {
        addressBalances = layer1AuditReportResponse.getAddressBalances();
        sortedBalances = addressBalances.sort((a, b) => b.getBalance() - a.getBalance());
    }

    const handleShowZeroBalancesChange = (event: { target: { checked: boolean | ((prevState: boolean) => boolean); }; }) => { // Step 2
        setShowZeroBalances(event.target.checked);
    };

    return (
        <div>
            <div>
                <h2>Layer 1 Audit Report</h2>
                <p>Total Balance: {layer1AuditReportResponse.totalBalance}</p>
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
                                <td>{addressBalance.getBalance()}</td>
                            </tr>
                        )
                    )))}
                </tbody>
            </table>
        </div>
    );
}

export default AddressBalanceTable;
