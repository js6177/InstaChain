Install nodejs:
sudo apt install nodejs

Install all the packages required for building:
npm install package-lock.json

Build:
npm run build

This will create two files in the /dist folder, index.html and bundle*.js. To run the wallet locally, host this folder in a webserver. The simplest way is to install "Live Server" plugin for VS Code, click a file in the /dist folder, and click "Go Live" in the bottom right of VS code.
