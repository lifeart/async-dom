const globals = require('./globals');
const {ORIGINAL_KEY,_cache} = globals;
let {nodeCounter}  = globals;


function getTransport(transportType) {
	requireJS('../transport/ww-legacy.js');
	return Promise.resolve({
		sendMessage: self.asyncSendMessage,
		receiveMessage: self.onmessage
	});
}

function originalNode(node) {
	if (!node) {
		return null;
	}
	return node[ORIGINAL_KEY] || node;
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



module.exports.getTransport = getTransport;
module.exports.originalNode = originalNode;
module.exports.nodeId = nodeId;
module.exports.importApp = importApp;
module.exports.setAnimationFrameTime = setAnimationFrameTime;
module.exports.EventAdapter = EventAdapter;
module.exports.EventTransformer = EventTransformer;