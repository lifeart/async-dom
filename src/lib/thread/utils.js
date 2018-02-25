function importApp(appName='glimmer') {
	if (APP_NODE_HOOKS[appName]) {
		proxyGet = Object.assign(proxyGet, APP_NODE_HOOKS[appName]);
	}
	requireJS(`/apps/${appName}.js`);
}

function getDOMImplementation() {
	requireJS('../dom/domino-async-bundle.js');
	// requireJS('../dom/pseudo-dom.js');
	return self.domino;
}

function getTransport() {
	requireJS('../transport/ww-legacy.js');
	return {
		sendMessage: self.asyncSendMessage,
		receiveMessage: self.onmessage
	};
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

function configureThread(data) {
	self.AppUID = data.appUID;
	self.animationFrameTime = data.frameTime || self.animationFrameTime;
	self.batchTransport = data.batchTransport || self.batchTransport;

	self.packSize = data.packSize || self.packSize;
	self.batchTimeout = data.batchTimeout || self.batchTimeout;

	if (data.createInitialDomStructure) {
		createInitialDomStructure();
	}

	importApp(data.app);
}