import React from 'react';
import ReactDOM from 'react-dom/client';

const { UiController } = require('./UIController');


const root = ReactDOM.createRoot(document.getElementById("title")!);
root.render(
<React.StrictMode>
    <UiController />
</React.StrictMode>
);