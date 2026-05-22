const os = require('os');
const fs = require('fs');
fs.writeFileSync('network-info.txt', JSON.stringify(os.networkInterfaces(), null, 2));
console.log('Network info saved to network-info.txt');
