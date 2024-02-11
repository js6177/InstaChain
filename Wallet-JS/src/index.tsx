import React from 'react';
import ReactDOM from 'react-dom/client';

import { UiController } from './UIController';


const root = ReactDOM.createRoot(document.getElementById("title")!);
root.render(
    <React.StrictMode>
        <UiController />
    </React.StrictMode>
);