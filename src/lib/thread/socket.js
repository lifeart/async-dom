const requireJS = function(scriptName) {
	importScripts(`./${scriptName}`);
};
 
requireJS('globals.js');
requireJS('utils.js');
requireJS('proxy.js');
requireJS('initializer.js');
requireJS('app-hooks.js');

const transport = getTransport();


transport.then(function(){
	console.log('transport activated');
});