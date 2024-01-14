import React from 'react';

function AddressBalanceTable({ addressBalances }) {
    // Sort the addressBalances array by balance in descending order
    const sortedBalances = addressBalances.sort((a, b) => b.getBalance() - a.getBalance());

    return (
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
    );
}

export default AddressBalanceTable;
