import React from 'react';
import {useContext} from 'react';
import {Layer2LedgerContext} from '../context/Layer2LedgerContext';

function AddressBalanceTable() {
    // Sort the addressBalances array by balance in descending order
    //const sortedBalances = addressBalances.sort((a, b) => b.getBalance() - a.getBalance());
    // const {layer1AuditReport: layer1AuditReportResponse, _} = useContext(Layer2LedgerContext);
    const {layer1AuditReportResponse, _} = useContext(Layer2LedgerContext);
    let addressBalances = [];
    let sortedBalances = [];
    const totalBalance = 0;
    console.log("AddressBalanceTable() layer1AuditReport: " + JSON.stringify(layer1AuditReportResponse));
    console.log("AddressBalanceTable() totalbaalance: " + layer1AuditReportResponse.totalBalance);
    if(layer1AuditReportResponse.ready === true){
        addressBalances = layer1AuditReportResponse.getAddressBalances(); //layer1AuditReport.getAddressBalances();
        sortedBalances = addressBalances.sort((a, b) => b.getBalance() - a.getBalance());
    }

    return (
        <div>
            <div>
                <h2>Layer 1 Audit Report</h2>
                <p>Total Balance: {layer1AuditReportResponse.totalBalance}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Address</th>
                        <th>Balance</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedBalances.map((addressBalance) => (
                        <tr key={addressBalance.getAddress()}>
                            <td>{addressBalance.getAddress()}</td>
                            <td>{addressBalance.getBalance()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default AddressBalanceTable;
