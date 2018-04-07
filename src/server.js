// https://github.com/websockets/ws

const path = require('path');
const WebSocket = require('uws');
const { fork } = require('child_process');

const USE_TIMELINE = true;
const { Timeline, TimelineClient, TimelineConnection } = require('./player');

const masterSocket = new WebSocket.Server({
	port: 8010
});

const slaveSocket = new WebSocket.Server({
	port: 8011
});

function getThread() {
	return fork(path.resolve(__dirname,'lib/node-thread/ww.js'));
}

var timeline = null;
var timelineClients = [];

function onTimelineCreated(timeline) {
	timelineClients.forEach((cb)=>{
		return cb(timeline);
	});
	timelineClients = [];
}

function requestTimeline(cb) {
	if (timeline) {
		cb(timeline);
	} else {
		timelineClients.push(cb);
	}
}

function log(msg) {
	console.log(msg);
}

masterSocket.on('error', () => log('errored'));
slaveSocket.on('error', () => log('errored'));

slaveSocket.on('connection', function connection(ws) {
	requestTimeline(function(timeline){
		var timelineClient = new TimelineClient(new TimelineConnection(ws), timeline);
		timelineClient.sync();
		let mid = 0;
		let batchTransport = true;
		ws.on('message', function incoming(message) {
			mid++;
			if (mid == 1) {
				let msg = JSON.parse((message));
				if (msg.batchTransport === false) {
					batchTransport = false;
				}
				timelineClient.timelineFeedback(message);
			} else if (!batchTransport && mid < 100) {
				timelineClient.timelineFeedback(message);
			} else {
				if (message.indexOf('currentTarget') > -1) {
					timelineClient.timelineFeedback(message);
				}
			}
			
		});
	});
	
	ws.on('error', function(){
		log('socked lost');
		requestTimeline(function(timeline){
			timeline.unregisterClient(ws);
		});
	});
});

masterSocket.on('connection', function connection(ws) {

	var worker = getThread();

	if (!timeline && USE_TIMELINE) {
		timeline = new Timeline(worker);
		onTimelineCreated(timeline);
	}

	worker.on('message', (event) => {
		if (USE_TIMELINE) {
			timeline.push(event);
		}
		ws.send(event);
	});

	ws.on('error', function(){
		worker.kill('SIGKILL');
		timeline.destroy();
	});

	let mid = 0;
	let batchTransport = true;

	ws.on('message', function incoming(message) {
		mid++;
		if (mid == 1) {
			let msg = JSON.parse((message));
			if (msg.batchTransport === false) {
				batchTransport = false;
			}
			worker.send(message);
		}
		// console.log('->', mid);
		// mid++ ;
		// if (batchTransport) {
		// 	worker.send(message);
		// } else {

		// }
		// if (!batchTransport && mid < 100) {
		// 	worker.send(message);
		// }

		if (!batchTransport && mid < 100) {
			worker.send(message);
		} else {
			if (message.indexOf('currentTarget') > -1) {
				worker.send(message);
			}
		}
		
	});
});
