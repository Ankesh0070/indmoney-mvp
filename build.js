const fs = require('fs');
const path = require('path');

const root = __dirname;
const source = path.join(root, 'public');
const output = path.join(root, 'dist');

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });
fs.copyFileSync(path.join(output, 'index.html'), path.join(output, '404.html'));

console.log('INDmoney MVP static production build created in dist/');
