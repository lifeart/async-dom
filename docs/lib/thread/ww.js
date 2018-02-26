/* global importScripts, getTransport, initDominoImplementation */

const requireJS = function(scriptName) {
	importScripts(`${scriptName}?t=${Math.random()}`);
};
 
requireJS('globals.js');
requireJS('utils.js');
requireJS('proxy.js');
requireJS('initializer.js');
requireJS('app-hooks.js');

const transport = getTransport();


// createInitialDomStructure();


// importApp('demo');

// setTimeout(()=>{
// 	importApp('glimmer');
// },3000);