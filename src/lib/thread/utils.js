/* global APP_NODE_HOOKS, proxyGet, requireJS, ORIGINAL_KEY, nodeCounter, _cache */

function importApp(appName='glimmer') {
	if (APP_NODE_HOOKS[appName]) {
		proxyGet = Object.assign(proxyGet, APP_NODE_HOOKS[appName]);
	}
	requireJS(`../../apps/${appName}.js`);
}

function getTransport(transportType) {
	if (transportType === 'websocket') {
		const WebSocket = require('ws');
		const wss = new WebSocket.Server({ port: 8010 });

		return new Promise((resolve)=>{
			wss.on('connection', function connection(ws) {
				console.log('hasConnection');
				ws.on('message', function incoming(message) {
					self.onmessage(message);
				});

				resolve({
					sendMessage(msg) {
						ws.send(msg);
					},
					receiveMessage: self.onmessage
				});

			});
	
		});

	} else {
		requireJS('../transport/ww-legacy.js');
		return Promise.resolve({
			sendMessage: self.asyncSendMessage,
			receiveMessage: self.onmessage
		});
	}
}

function originalNode(node) {
	if (!node) {
		return null;
	}
	return node[ORIGINAL_KEY] || node;
}

function nodeId(maybeElement,debug) {
	let element = maybeElement[ORIGINAL_KEY] || maybeElement;
	if (!_cache.has(element)) {
		nodeCounter++;
		// console.log('element.tagName',element.tagName);
		if (element.tagName === 'BODY') {
			_cache.set(element, 'async-body');
		} else {
			if (element.id === 'app') {
				_cache.set(element, 'app');
			} else {
				_cache.set(element, `a-${self.AppUID}-${nodeCounter}`);
			}
		}
	}
	return _cache.get(element);
}

function setAnimationFrameTime(time) {
	self.animationFrameTime = time;
}

function EventTransformer(callback,e) {
	e.currentTarget =document.getElementById(e.currentTarget);
	e.srcElement =document.getElementById(e.srcElement);
	e.target =document.getElementById(e.target) || e.currentTarget || null;
	e.toElement =document.getElementById(e.toElement);
	e.eventPhase =document.getElementById(e.eventPhase);
	e.preventDefault = ()=>{};
	callback(e);
}

function EventAdapter(callback) {
	return EventTransformer.bind(null, callback);
}

// function EventAdapter(callback) {
// 	return function(e) {
// 		e.currentTarget = document.getElementById(e.currentTarget);
// 		e.srcElement = document.getElementById(e.srcElement);
// 		e.target = document.getElementById(e.target) || e.currentTarget || null;
// 		e.toElement = document.getElementById(e.toElement);
// 		e.eventPhase = document.getElementById(e.eventPhase);
// 		e.preventDefault = ()=>{};
// 		callback(e);
// 	};
// }

