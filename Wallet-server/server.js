const express = require('express');
const path = require('path');

const app = express();

let dirName = "/home/js/Projects/IC/InstaChain/Wallet-JS";
let distName = "dist";
let fileName = "index.html";

// Serve static assets (e.g., your React app's build output)
app.use(express.static(path.join(dirName, distName)));

// Redirect all other requests to index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(dirName, distName, fileName));
});

app.listen(3000, () => console.log('Server listening on port 3000'));
