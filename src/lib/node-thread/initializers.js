const ProxyConstructor = require('./proxy').ProxyConstructor;
const APP_NODE_HOOKS = require('./app-hooks');
const fs = require('fs');

function configureThread(data, transport) {

	const self = {};
	let result = null;
	if (data.implementation) {
		if (data.implementation === 'simple') {
			result = initSimpleImplementation(transport);
		} else if (data.implementation === 'domino') {
			result = initDominoImplementation(transport);
		} else if (data.implementation === 'jsdom') {
			result = initJsDomImplementation(transport);
		} else if (data.implementation === 'pseudo') {
			result = initPseudoDomImplementation(transport);
		} else {
			result = initDominoImplementation(transport);
		}
	} else {
		result = initDominoImplementation(transport);
	}

	//instance
	self.AppUID = data.appUID;
	self.animationFrameTime = data.frameTime || self.animationFrameTime;
	self.batchTransport = data.batchTransport || self.batchTransport;

	self.packSize = data.packSize || self.packSize;
	self.batchTimeout = data.batchTimeout || self.batchTimeout;

	self.transport = transport;
	
	// window.screen = {
	// 	width: 1280,
	// 	height: 720
	// };


	if (data.createInitialDomStructure) {
		createInitialDomStructure(result.document);
	}

	importApp(data.app, Object.assign(self, result));

	return self;
}


function WindowContext(jsFile, windowContext) {
	const self = {};
	const instance = windowContext.instance;

	var window = windowContext.window;
	var Element = windowContext.Element;
	var document = windowContext.document;

	self.window = window;
	self.Element = Element;
	self.document = document;

	self.animationFrameTime = windowContext.animationFrameTime || 100;
	self.batchTransport = windowContext.batchTransport || false;
	self.packSize = windowContext.packSize || 2000;
	self.batchTimeout = windowContext.batchTimeout || 6;

	windowContext.transport.setConfig({
		batchTransport: self.batchTransport,
		packSize: self.packSize,
		batchTimeout: self.batchTimeout
	});

	self.lastCallback = ()=>{};
	self.lastFrame = 0;
	instance.setAppUid(windowContext.AppUID || null);

	var onVisibilityChange = (result) => {
		if (result === 'visible') {
			setAnimationFrameTime(self, 100);
		} else {
			setAnimationFrameTime(self, 2000);
		}
	};

	var setAnimationFrameTime = function(ctx, time) {
		ctx.animationFrameTime = time;
	};

	const requestAnimationFrame = function(cb) {
		// console.log(' self.animationFrameTime)', self.animationFrameTime);
		self.lastFrame = setTimeout(cb, self.animationFrameTime);
		return self.lastFrame;
	};

	var cancelAnimationFrame = clearTimeout;

	self.requestAnimationFrame = requestAnimationFrame;
	self.onVisibilityChange = onVisibilityChange;
	self.requestAnimationFrame  = requestAnimationFrame;
	self.cancelAnimationFrame = cancelAnimationFrame;

	self.asyncMessage = () => {};
	self.nodeCounter = 0;
	self.hasAlertMicrotask = false;

	var alert = function(text) {

		self.asyncMessage({action: 'alert', text: text},()=>{
			self.hasAlertMicrotask = false;
		});

		self.hasAlertMicrotask = true;

		var e = performance.now() + 0.8;

		while (performance.now() < e) {
			// Artificially long execution time.
		}
	};
	
	self.alert = alert;

	eval(jsFile);

	return self;
}

function importApp(appName='glimmer', windowContext) {
	if (APP_NODE_HOOKS[appName]) {
		Object.assign(windowContext.proxyGet, APP_NODE_HOOKS[appName]);
	}
	let app = fs.readFileSync(`apps/${appName}.js`,'utf8');
	WindowContext(app, windowContext);
}


function initPseudoDomImplementation(transport) {
	let self = require('../dom/pseudo-dom.js');
	const implementation = self.pseudoDom;
	const instance = ProxyConstructor(implementation, transport.transport.bind(transport));
	return {
		Element: instance.window.Element,
		document: instance.window.document,
		window: instance.window,
		instance
	};
}

function initJsDomImplementation(transport) {
	const jsdom = require('jsdom');
	const implementation = jsdom.JSDOM;
	let node = new implementation('<body></body>');
	const instance = ProxyConstructor(node.window, transport.transport.bind(transport));
	return {
		Element: instance.window.Element,
		document: instance.window.document,
		window: instance.window,
		instance
	};
}


function initDominoImplementation(transport) {
	const implementation = require('domino');
	const win = implementation.createWindow('', 'http://localhost:8080/');
	const instance = ProxyConstructor(win, transport.transport.bind(transport));
	return {
		Element: instance.window.Element,
		document: instance.window.document,
		window: instance.window,
		instance
	};
}

function initSimpleImplementation(transport) {
	const implementation = require('simple-dom');
	let doc = new implementation.Document();
	doc.createElementNS = function(...args) {
		return doc.createElement.apply(doc, args);
	};
	const instance = ProxyConstructor({
		document: doc
	}, transport.transport.bind(transport));
	return {
		Element: instance.window.Element,
		document: instance.window.document,
		window: instance.window,
		instance
	};
}

function createInitialDomStructure(document) {
	document.body.id = 'async-body';
	// window.chrome = {};
	let node = document.createElement('div');
	node.id = 'app';
	document.body.appendChild(node);
	//@todo fix simple-dom getE
	//self.appNode = node;
	document.appNode = node;
}

module.exports.configureThread = configureThread;