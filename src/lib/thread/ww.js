const require = importScripts;

require('globals.js');
require('utils.js');
require('proxy.js');
require('initializer.js');

const transport = getTransport();

createInitialDomStructure();
