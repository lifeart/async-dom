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

// importApp('glimmer');
// importApp('glimmer');
// importApp('glimmer');
// importApp('demo');
// importApp('demo');
importApp('demo');

setTimeout(()=>{
	importApp('glimmer');
},3000);