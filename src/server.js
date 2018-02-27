const WebSocket = require('ws');
var Worker = require('webworker-threads').Worker;
// const Promise = require('promise/setimmediate');
const wss = new WebSocket.Server({ port: 8010 });

// const self = this;

wss.on('connection', function connection(ws) {
    var worker = new Worker('./lib/thread/ww.js');
    ws.send('foo-bar');
	worker.onmessage = function (event) {
		console.log('event', event);
		ws.send(event.data);
	};
	ws.on('message', function incoming(message) {
        // console.log(message);
        // console.log('incoming', JSON.stringify(message));
        // ws.send(message);
        worker.postMessage(JSON.parse(message));
	});
});
