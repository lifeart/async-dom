// https://github.com/websockets/ws

const path = require('path');
const WebSocket = require('uws');
const { fork } = require('child_process');
const wss = new WebSocket.Server({
	port: 8010 ,
	// perMessageDeflate: {
	// 	zlibDeflateOptions: { // See zlib defaults.
	// 		chunkSize: 1024,
	// 		memLevel: 7,
	// 		level: 3,
	// 	},
	// 	zlibInflateOptions: {
	// 		chunkSize: 10 * 1024
	// 	},
	// 	// Other options settable:
	// 	clientNoContextTakeover: true, // Defaults to negotiated value.
	// 	serverNoContextTakeover: true, // Defaults to negotiated value.
	// 	clientMaxWindowBits: 10,       // Defaults to negotiated value.
	// 	serverMaxWindowBits: 10,       // Defaults to negotiated value.
	// 	// Below options specified as default values.
	// 	concurrencyLimit: 10,          // Limits zlib concurrency for perf.
	// 	threshold: 1024,               // Size (in bytes) below which messages
	// 	// should not be compressed.
	// }
});


wss.on('error', () => console.log('errored'));
wss.on('connection', function connection(ws) {

	var worker = fork(path.resolve(__dirname,'lib/node-thread/ww.js'));

	worker.on('message', (event) => {
		// console.log('<-',event);
		ws.send(event);
	});

	ws.on('error', function(){
		worker.kill('SIGKILL');
	});
	let mid = 0;
	ws.on('message', function incoming(message) {
		mid++;
		// console.log('->', mid);
		// mid++ ;
		if (mid < 10) {
			worker.send(message);
		}
		
	});
});
