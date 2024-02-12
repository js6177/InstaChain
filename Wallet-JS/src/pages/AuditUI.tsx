import React from "react";
import AddressBalanceTable from "../components/AddressBalanceTable";

export default function AuditUI(props: any) {
    return (
      <div style={{ display: 'flex' }}>
        <AddressBalanceTable/>
      </div>
    );
  }