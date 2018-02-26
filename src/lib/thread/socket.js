const requireJS = function(scriptName) {
	require(`./${scriptName}`);
};
 
requireJS('globals.js');
requireJS('utils.js');
requireJS('proxy.js');
requireJS('initializer.js');
requireJS('app-hooks.js');

const transport = getTransport('websocket');


transport.then(function(){
	console.log('transport activated');
});