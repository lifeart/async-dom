// https://github.com/websockets/ws

const path = require('path');
const WebSocket = require('ws');
const { fork } = require('child_process');
const wss = new WebSocket.Server({ port: 8010 });


wss.on('error', () => console.log('errored'));
wss.on('connection', function connection(ws) {

	var worker = fork(path.resolve(__dirname,'lib/node-thread/ww.js'));

	worker.on('message', (event) => {
		ws.send(event);
	});

	ws.on('error', function(){
		worker.kill('SIGKILL');
	});

	ws.on('message', function incoming(message) {
		worker.send(message);
	});
});
