import { createContext } from 'react';
import { SettingsState } from '.././state/SettingsState';
import { SettingsManager } from '.././state_managers/SettingsManager';

type SettingsContextType = {
    settingsState: SettingsState | null;
    settingsManager: SettingsManager | null;
};

const SettingsContext = createContext<SettingsContextType>({
    settingsState: null,
    settingsManager: null,
});

export { SettingsContext };