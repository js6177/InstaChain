import React, { useState, useEffect } from 'react';
import Chip from '@mui/material/Chip'; 
import { CurrencyUnits } from '../state/SettingsState';
import { SettingsContext } from '../context/SettingsContext';

type BtcAmountDisplayProps = {
  amount: number;
  color: string;
};

const BtcAmountDisplay: React.FC<BtcAmountDisplayProps> = ({ amount, color }) => {
    const { settingsState, settingsManager } = React.useContext(SettingsContext);    
    const [currencyAmount,setCurrencyAmount] = useState<number>(amount);
    const [currencyUnitsString, setCurrencyUnitsString] = useState<string>("");
    
    function refresh(){  
        const currencyUnits = settingsState?.currencyUnits; 
        if(currencyUnits){
            if(currencyUnits === CurrencyUnits.BTC) {
                setCurrencyAmount(amount / 100000000);
            }else if(currencyUnits === CurrencyUnits.SATS){
                setCurrencyAmount(amount);
            }
            setCurrencyUnitsString(currencyUnits);
        }
    }

    useEffect(() => {
        refresh();
    }, [settingsState]);

    const handleClick = () => {
        if(settingsState?.currencyUnits === CurrencyUnits.BTC) {
            settingsManager?.setCurrencyUnits(CurrencyUnits.SATS);
        }else if(settingsState?.currencyUnits === CurrencyUnits.SATS){
            settingsManager?.setCurrencyUnits(CurrencyUnits.BTC);
        }
    };

    return (
        <Chip
        label={`${currencyAmount} ${currencyUnitsString}`}
        style={{ backgroundColor: color, color: 'white' }}
        //onClick={handleClick}
        />
    );
};

export default BtcAmountDisplay;