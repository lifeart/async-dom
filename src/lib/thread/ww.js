// const require = importScripts;
const requireJS = importScripts;
 
requireJS('globals.js');
requireJS('utils.js');
requireJS('proxy.js');
requireJS('initializer.js');
requireJS('app-hooks.js');

const transport = getTransport();

initDominoImplementation();
createInitialDomStructure();
importApp('glimmer');
importApp('demo');