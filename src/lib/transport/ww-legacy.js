(function(_this){

	var removedNodes = [];
	var middlewareActions = [];
	var actionsList = [];
	var updateTimeout = null;
	var WAITING_LIST = [];
	var maxId = 0;
    
	function _initWebApp() {
		console.log('_initWebApp');
	}
	
	const uidsMap = new Map();

	_this.sendMessage = function(data, callback) {
		maxId++;
		let uid = `${maxId}`;
		data.uid = parseInt(uid);
		if (callback) {
			uidsMap.set(String(uid),callback);
		}
		if (typeof data.callback === 'function') {
			uidsMap.set(`_${uid}_${data.name}`,data.callback);
			delete data.callback;
		}
		if (typeof data.onerror === 'function') {
			uidsMap.set(`onerror_${data.id}`,data.onerror);
			delete data.onerror;
		}
		if (typeof data.onload === 'function') {
			uidsMap.set(`onload_${data.id}`,data.onload);
			delete data.onload;
		}
		if (data.length) {
			data.forEach((el)=>{
				if (typeof el.callback === 'function') {
					maxId++;
					uidsMap.set(`_${uid}_${el.name}`,el.callback);
					el.uid = maxId;
					delete el.callback;
				}
			});
		}
		// console.log(data);
		data.cb = callback ? true : false;
		_this.postMessage(data);
	};
    
	_this.onmessage = function(e) {
		var uid = String(e.data.uid);
		// console.log(uid);
		let cb = uidsMap.get(uid);
		cb && cb(e.data);
		if (uid.charAt(0) !== '_') {
			uidsMap.delete(uid);
		}
	};

	function middleware(data) {
		middlewareActions.forEach(action=>action(data));
	}
	function addMiddleware(action) {
		middlewareActions.push(action);
	}
	function asyncSendMessage(data) {
		middleware(data);
		var request = new Promise(function(resolve) {
			_this.sendMessage(data, function(result) {
				resolve(result);
			});
		});
    
		var waitingStates = [
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
    
    
    
		if (waitingStates.indexOf(data.action>-1)) {
			WAITING_LIST.push(request);
		} else {
			if (data.onload) {
				WAITING_LIST.push(request);
			}
		}
		return request;
	}
    
	function asyncSetAttribute(id, name, value) {
		return asyncSendMessage({
			action: 'setAttribute',
			id: id,
			attribute: name,
			value: value
		});
	}
    
	function asyncBatchMessages(messages) {
		return asyncSendMessage(messages);
	}
    
	function asyncBodyAppendChild(id) {
		return asyncSendMessage({
			action: 'bodyAppendChild',
			id: id
		});
	}
    
	function asyncImageLoad(id, src, onload, onerror) {
		return asyncSendMessage({
			action: 'loadImage',
			id: id,
			src: src,
			onload: onload,
			onerror: onerror
		});
	}
    
	function asyncHeadAppendChild(id) {
		return asyncSendMessage({
			action: 'headAppendChild',
			id: id
		});
	}
    
	function asyncAddEventListener(id) {
		return asyncSendMessage({
			action: 'addEventListener',
			id: id,
			name: 'click',
			callback: () => {
				console.log(arguments, 'clicked');
			}
		});
	}
    
	function asyncGetElementById(id) {
		return asyncSendMessage({
			action: 'getElementById',
			id: id
		});
	}
    
	function asyncCreateElement(id, tagName) {
		return asyncSendMessage({
			action: 'createNode',
			id: id,
			tag: tagName
		});
	}
    
    
	addMiddleware(function(data){
		if (data.action === 'removeNode') {
			removedNodes.push(data.id);
		}
	});
    
	addMiddleware(function(data){
		if (data.action === 'loadImage') {
			removedNodes.push(data.id);
		}
	});
    
	var uids = {
		'_configure': function(data) {
			configureThread(data);
		},
		'_setNavigator': function(data) {
			navigator = data.navigator;
		},
		'_setLocation': function(data) {
			window.location = data.location;
		},
		'set_modernizr_custom': function(data) {
			modernizr_custom = data.modernizr_custom;
		},
		'_onFocus': function() {
			if (window.onfocus)
				window.onfocus();
		},
		'_onhashchange': function() {
			window.onhashchange();
		},
		'_onpopstate': function() {
			window.onpopstate();
		},
		'_onBlur': function() {
			if (window.onblur)
				window.onblur();
		},
		'_visibilitychange': function(data) {
			onVisibilityChange(data.value);
		},
		'_onPerformanceFeedback': function(data) {
			adjustSpeed(data);
		},
		'_setScreen': function(data) {
			window.screen = data.screen;
		},
		'init': function() {
			_initWebApp();
		}
	};
	
	Object.keys(uids).forEach((uidKey)=>{
		uidsMap.set(uidKey,uids[uidKey]);
	});
	
	_this.uids = uidsMap;

	function sendBatch() {
		let actionsToSend = actionsList.splice(0, actionsList.length);
		asyncBatchMessages(actionsToSend);
	}
    
	var asyncBatch = function(action) {
		actionsList.push(action);
		if (actionsList.length > _this.packSize) {
			// console.log('packSize!',actionsList.length);
			sendBatch();
		}
		clearTimeout(updateTimeout);
		updateTimeout = setTimeout(function() {
			sendBatch();
		}, _this.batchTimeout);
	};
	
	
	function transportChooser(data) {
		if (self.batchTransport) {
			return asyncBatch(data);
		} else {
			return asyncSendMessage(data);
		}
	}
	// self.asyncSendMessage = asyncBatch;
	self.asyncSendMessage = transportChooser;

})(self);