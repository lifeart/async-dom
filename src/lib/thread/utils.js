/* global APP_NODE_HOOKS, requireJS, ORIGINAL_KEY, nodeCounter, _cache */

function importApp(appName='glimmer', proxyGet) {
	if (typeof APP_NODE_HOOKS === 'undefined') {
		APP_NODE_HOOKS = require('app-hooks.js').APP_NODE_HOOKS;
	}
	if (APP_NODE_HOOKS[appName]) {
		Object.assign(proxyGet, APP_NODE_HOOKS[appName]);
	}

	requireJS(`../../apps/${appName}.js`);
}

function getWSTransport() {
	const WebSocket = require('ws');
	const Promise = require('promise/setimmediate');
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
}

function getTransport(transportType) {
	if (transportType === 'websocket') {
		return getWSTransport();

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
	if (!maybeElement) {
		console.log('maybeElement',maybeElement,debug);
	}
	let element = maybeElement[ORIGINAL_KEY] || maybeElement;
	if (!_cache.has(element)) {
		nodeCounter++;
		// console.log('element.tagName',element.tagName);
		//window
		if (element.tagName === 'BODY') {
			_cache.set(element, 'async-body');
		} else {
			if (element.id === 'app') {
				_cache.set(element, 'app');
			} else {
				// react fix
				if ('Uint8Array' in element) {
					_cache.set(element, `window`);
				} else {
					_cache.set(element, `a-${self.AppUID}-${nodeCounter}`);
				}

			}
		}
	}
	return _cache.get(element);
}

function setAnimationFrameTime(context, time) {
	context.animationFrameTime = time;
}

function EventTransformer(callback,e) {
	e.currentTarget = document.getElementById(e.currentTarget);
	e.srcElement = document.getElementById(e.srcElement);
	e.target = document.getElementById(e.target) || e.currentTarget || null;
	e.toElement = document.getElementById(e.toElement);
	e.eventPhase = document.getElementById(e.eventPhase);
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


if (typeof module === 'undefined') {
	module = {
		exports: {}
	};	
}

module.exports.getTransport = getTransport;
module.exports.originalNode = originalNode;
module.exports.nodeId = nodeId;
module.exports.importApp = importApp;
module.exports.setAnimationFrameTime = setAnimationFrameTime;
module.exports.EventAdapter = EventAdapter;
module.exports.EventTransformer = EventTransformer;