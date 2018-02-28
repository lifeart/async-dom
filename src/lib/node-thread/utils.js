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

function setAnimationFrameTime(context, time) {
	context.animationFrameTime = time;
}



module.exports.getTransport = getTransport;
module.exports.originalNode = originalNode;
module.exports.nodeId = nodeId;
module.exports.importApp = importApp;
module.exports.setAnimationFrameTime = setAnimationFrameTime;
module.exports.EventAdapter = EventAdapter;
module.exports.EventTransformer = EventTransformer;