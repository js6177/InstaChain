import React from 'react';
import Chip from '@mui/material/Chip'; 
import { CurrencyUnits } from '../state/SettingsState';
import { SettingsContext } from '../context/SettingsContext';

type BtcAmountDisplayProps = {
  amount: number;
  color: string;
};

const BtcAmountDisplay: React.FC<BtcAmountDisplayProps> = ({ amount, color }) => {
    const { settingsState, settingsManager } = React.useContext(SettingsContext);
    const currencyUnits = settingsState?.currencyUnits;
    let currencyAmount: number = amount;
    if(currencyUnits === CurrencyUnits.BTC) {
        currencyAmount = currencyAmount / 100000000;
    }

    const handleClick = () => {
        if(currencyUnits === CurrencyUnits.BTC) {
            settingsManager?.setCurrencyUnits(CurrencyUnits.SATS);
        }else if(currencyUnits === CurrencyUnits.SATS){
            settingsManager?.setCurrencyUnits(CurrencyUnits.BTC);
        }
    };

    return (
        <Chip
        label={`${currencyAmount} ${currencyUnits}`}
        style={{ backgroundColor: color, color: 'white' }}
        onClick={handleClick}
        />
    );
};

export default BtcAmountDisplay;