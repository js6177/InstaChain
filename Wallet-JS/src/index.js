import React from 'react';
import ReactDOM from 'react-dom/client';

import MyApp from './MainUI';
import { UiController } from './UIController';

//var uiController = new UiController();

const root = ReactDOM.createRoot(document.getElementById("title"));
root.render(
<React.StrictMode>
    <UiController />
</React.StrictMode>
);