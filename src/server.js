// https://github.com/websockets/ws
// npm install --global --production windows-build-tools

const path = require('path');

const WebSocket = require('ws');
// var Worker = require('webworker-threads').Worker;
const { fork } = require('child_process');
// const Promise = require('promise/setimmediate');
const wss = new WebSocket.Server({ port: 8010 });


wss.on('error', () => console.log('errored'));
wss.on('connection', function connection(ws) {
	// './lib/thread/ww.js'
	// var worker = new Worker(function(){
	// 	self.postMessage({foo:'bar'});
	// 	this.onmessage = function(event) {
	// 	  self.postMessage(event.data);
	// 	};
	// });

	// console.log(path.resolve(__dirname,'lib/thread/ww.js'));

	var worker = fork(path.resolve(__dirname,'lib/thread/ww.js'));
	// var worker = new Worker(path.resolve(__dirname,'lib/thread/ww.js'));

	worker.on('onmessage', (event) => {
		// console.log('event', event.data);
		ws.send(event.data);
	});

	ws.on('error', function(){
		// console.log(e);
		worker.kill('SIGKILL');
	});
	ws.on('message', function incoming(message) {
		console.log(message);
		worker.send(message);
		// let msg = JSON.parse(message);
		// msg.__dirname = path.resolve(__dirname,'lib/thread/');
		// console.log('JSON.stringify(msg)',JSON.stringify(msg));
		// worker.postMessage(JSON.stringify(msg));
	});
});
