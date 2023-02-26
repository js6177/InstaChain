import React from 'react';
import ReactDOM from 'react-dom/client';
import Box from '@mui/material/Box';
import { DataGrid, GridToolbar, GridValueFormatterParams } from '@mui/x-data-grid';
import Grid from '@mui/material/Grid';
import { IconButton } from '@mui/material';

import RefreshIcon from '@mui/icons-material/Refresh';
import PreviewIcon from '@mui/icons-material/Preview';

import {ActionDialog, ViewJsonDialogBody} from './ActionDialog'

import {getUiControllerCallbacks, setUiControllerCallbacks} from '../Callbacks/CallbacksMap'

const columns = [
    { field: 'id', headerName: 'id' },

    { field: 'transaction_id', headerName: 'Transaction Id', flex: 0.25},
    { field: 'source_address', headerName: 'From', flex: 1.0 },
    { field: 'destination_address', headerName: 'To', flex: 1.0 },
    { field: 'layer1_transaction_id', headerName: 'Layer1 transaction id', flex: 1.0 },
    { field: 'transaction_type_desc', headerName: 'Transaction type', flex: 0.25 },
    { field: 'amount', headerName: 'Amount', flex: 0.25 },
    { field: 'timestamp', headerName: 'Date', flex: 0.75, valueFormatter: (params) => {
      if (params.value == null) {
        return '';
      }

      const valueFormatted = new Date(params.value * 1000).toLocaleString();
      return valueFormatted;
    }, }

]

const rows = [

];


export function TransactionDataGrid(props) {
  const { transactions } = props;
  console.log("TransactionDataGrid JSON: " + JSON.stringify(transactions, null, 2))
  const [sortModel, setSortModel] = React.useState([
    {
      field: 'timestamp',
      sort: 'desc',
    },
  ]);
  //console.log("TransactionDataGrid transactions: " + JSON.stringify(transactions) );
  //_callbacksMap = callbacksMap;

  return (
      <Box sx={{ height: 400, width: '100%' }}>
        <DataGrid
          rows={transactions}
          columns={columns}

          disableSelectionOnClick
          experimentalFeatures={{ newEditingApi: true }}
          components={{ 
            Toolbar: GridToolbarWithRefresh
          }}
          componentsProps={{
            toolbar: { transactions: {transactions} }
          }}
          initialState={{
            columns: {
              columnVisibilityModel: {
                // Hide columns status and traderName, the other columns will remain visible
                id: false
              },
            },
          }}
        />
      </Box>
    );
  }

  export function GridToolbarWithRefresh(props){
    const { transactions } = props;
    console.log("GridToolbarWithRefresh JSON: " + JSON.stringify(transactions, null, 2))


    const [viewJsonDialogIsOpen, setViewJsonDialogIsOpenIsOpen] = React.useState(false);

    const handleViewJsonDialogOpen = () => {
      setViewJsonDialogIsOpenIsOpen(true);
    };

    const handleViewJsonDialogClose = () => {
      setViewJsonDialogIsOpenIsOpen(false);
    };

    return(
      <div>
        <Grid container direction="row">
        <Grid item>
          <GridToolbar/>
          </Grid>
          <Grid item>
          <IconButton onClick={ getUiControllerCallbacks()["getTransactions"]}>
            <RefreshIcon />
          </IconButton>
          </Grid>

          <Grid item>
          <IconButton onClick={ handleViewJsonDialogOpen}>
            <PreviewIcon />
          </IconButton>
          </Grid>

          <ActionDialog
              isOpen={viewJsonDialogIsOpen}
              onClose={handleViewJsonDialogClose}
              dialogTitle="Json"
              dialogBody={<ViewJsonDialogBody jsonData={transactions}/>}
          />

        </Grid>
      </div>
    );
  }