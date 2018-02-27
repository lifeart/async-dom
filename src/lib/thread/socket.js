var Worker = require('webworker-threads').Worker;
// var w = new Worker('worker.js'); // Standard API

// You may also pass in a function:
var worker = new Worker(function () {
	postMessage("I'm working before postMessage('ali').");
	this.onmessage = function (event) {
		postMessage('Hi ' + event.data);
		self.close();
	};
});
worker.onmessage = function (event) {
	console.log("Worker said : " + event.data);
};
worker.postMessage('ali');

const requireJS = function(scriptName) {
	importScripts(`./${scriptName}`);
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