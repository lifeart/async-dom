const waitingStates = [
	'createNode',
	'setHTML',
	'appendHTML',
	'getInnerHTML',
	'getStyleValue',
	'pushState',
	'setTextContent',
	'styleSheetAddRule',
	'headAppendChild',
	'bodyAppendChild',
	'appendChild',
	'setAttribute',
	'setStyle',
	'removeNode',
	'loadImage',
	'setClassName',
	'getElementById',
	'addClass',
	'removeClass'
];

class ProcessTransport {
	constructor(config = {}, process) {
		this.middlewareActions = [];
		this.removedNodes = [];
		this.actionsList = [];
		this.updateTimeout = null;
		this.maxId = 0;
		this.type = config.type || 'node';
		this.uidsMap = new Map();
		this.packSize = config.packSize || 1000;
		this.transportName = config.batchTransport ? 'asyncBatch' : 'asyncSendMessage';
		this.useCallbacks = true;

		if (this.type === 'ww') {
			this.postMessage = this.postMessageWorker;
			self.onmessage = this.onmessageWorker.bind(this);
		} else {
			this.postMessage = this.postMessageNode;
			this.onmessage = this.onmessageNode;
			process.on('message', msg => {
				this.onmessage(msg);
			});
		}

		this.transport.bind(this);
	}
	setConfig(config = {}) {
		if (config.batchTransport) {
			this.transportName = ['asyncBatch'];
		} else {
			this.transportName = ['asyncSendMessage'];
		}
		if (typeof config.callbacks === 'boolean') {
			this.useCallbacks = config.callbacks;
		} else {
			this.useCallbacks = true;
		}
	}
	transport(msg) {
		return this[this.transportName](msg);
	}
	sendMessage(data, callback) {
		this.maxId++;
		let uid = `${this.maxId}`;
		data.uid = parseInt(uid);

		if (callback && this.useCallbacks) {
			this.uidsMap.set(uid, callback);
		}

		if (typeof data.callback === 'function') {
			this.uidsMap.set(`_${uid}_${data.name}`, data.callback);
			delete data.callback;
		}
		if (typeof data.onerror === 'function') {
			this.uidsMap.set(`onerror_${data.id}`, data.onerror);
			delete data.onerror;
		}
		if (typeof data.onload === 'function') {
			this.uidsMap.set(`onload_${data.id}`, data.onload);
			delete data.onload;
		}

		//@todo happy handle it
		if (data.length) {
			data.forEach(el => {
				this.maxId++;
				let localUid = this.maxId;
				
				el.uid = localUid;

				if (typeof el.callback === 'function') {
					this.uidsMap.set(`_${localUid}_${el.name}`, el.callback);
					delete el.callback;
				}

			});
		}

		data.cb = (this.useCallbacks && callback) ? true : false;
		this.postMessage(data);
	}
	postMessage() {
		throw 'postMessage not implemented';
	}
	postMessageWorker(data) {
		self.postMessage(data);
	}
	postMessageNode(data) {
		process.send(JSON.stringify(data));
	}
	onmessageWorker(e) {
		this._onmessage(e.data);
	}
	onmessageNode(e) {
		this._onmessage(JSON.parse(e));
	}
	_onmessage(data) {
		let uid = String(data.uid);
		let cb = this.uidsMap.get(uid);
		cb && cb(data);
		if (uid.charAt(0) !== '_') {
			this.uidsMap.delete(uid);
		}
	}
	onmessage() {
		throw 'onmessage not implemented';
	}
	middleware(data) {
		this.middlewareActions.forEach(action => action(data));
	}
	addMiddleware(action) {
		this.middlewareActions.push(action);
	}
	asyncSendMessage(data) {
		this.middleware(data);
		let request = new Promise(resolve => {
			this.sendMessage(data, result => {
				resolve(result);
			});
		});

		// if (waitingStates.includes(data.action)) {
			// this.addRequestToWaitingList(request);
		// } else {
			// if (data.onload) {
			// this.addRequestToWaitingList(request);
			// }
		// }
		return request;
	}

	sendBatch() {
		let actionsToSend = this.actionsList.splice(0, this.actionsList.length);
		this.asyncBatchMessages(actionsToSend);
	}

	asyncBatch(action) {
		// console.log(typeof this.sendBatch);
		this.actionsList.push(action);
		if (this.actionsList.length > this.packSize) {
			this.sendBatch();
		}
		clearTimeout(this.updateTimeout);
		this.updateTimeout = setTimeout(() => {
			this.sendBatch();
		}, this.batchTimeout);
	}
	asyncBatchMessages(messages) {
		return this.asyncSendMessage(messages);
	}
	addUids(uids) {
		Object.keys(uids).forEach(uidKey => {
			this.uidsMap.set(uidKey, uids[uidKey]);
		});
	}
}

class LegacyProcessTransport extends ProcessTransport {
	asyncSetAttribute(id, name, value) {
		return this[this.transportName]({
			action: 'setAttribute',
			id: id,
			attribute: name,
			value: value
		});
	}
	asyncBodyAppendChild(id) {
		return this[this.transportName]({
			action: 'bodyAppendChild',
			id: id
		});
	}
	asyncImageLoad(id, src, onload, onerror) {
		return this[this.transportName]({
			action: 'loadImage',
			id: id,
			src: src,
			onload: onload,
			onerror: onerror
		});
	}
	asyncHeadAppendChild(id) {
		return this[this.transportName]({
			action: 'headAppendChild',
			id: id
		});
	}
	asyncAddEventListener(id) {
		return this[this.transportName]({
			action: 'addEventListener',
			id: id,
			name: 'click',
			callback: () => {
				// console.log(arguments, 'clicked');
			}
		});
	}
	asyncGetElementById(id) {
		return this[this.transportName]({
			action: 'getElementById',
			id: id
		});
	}
	asyncCreateElement(id, tagName) {
		return this[this.transportName]({
			action: 'createNode',
			id: id,
			tag: tagName
		});
	}
}

function legacyInitializer() {
	this.addMiddleware(function(data) {
		if (data.action === 'removeNode') {
			this.removedNodes.push(data.id);
		}
	});
	this.addMiddleware(function(data) {
		if (data.action === 'loadImage') {
			this.removedNodes.push(data.id);
		}
	});
}

module.exports.ProcessTransport = ProcessTransport;
module.exports.LegacyProcessTransport = LegacyProcessTransport;
module.exports.legacyInitializer = legacyInitializer;
