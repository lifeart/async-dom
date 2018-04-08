const CreateProxy = require('./proxy').ProxyConstructor;
const APP_HOOKS = require('./app-hooks');
const fs = require('fs');

function configureThread(data, transport, executor, context = {}) {
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
	context.AppUID = data.appUID;
	context.animationFrameTime = data.frameTime || context.animationFrameTime;
	context.batchTransport = data.batchTransport || context.batchTransport;
	context.callbacks = data.callbacks;

	context.packSize = data.packSize || context.packSize;
	context.batchTimeout = data.batchTimeout || context.batchTimeout;

	context.transport = transport;
	//callbacks
	// window.screen = {
	// 	width: 1280,
	// 	height: 720
	// };


	if (data.createInitialDomStructure) {
		createInitialDomStructure(result.document);
	}

	importApp(data.app, Object.assign(context, result), executor, context);

	return context;
}

function WindowContext(jsFile, windowContext, executor = false, context = {}) {
	const instance = windowContext.instance;

	var window = windowContext.window;
	var Element = windowContext.Element;
	var document = windowContext.document;

	context.window = window;
	context.Element = Element;
	context.document = document;

	context.animationFrameTime = windowContext.animationFrameTime || 100;
	context.batchTransport = windowContext.batchTransport || false;
	context.packSize = windowContext.packSize || 2000;
	context.batchTimeout = windowContext.batchTimeout || 6;

	windowContext.transport.setConfig({
		callbacks: context.callbacks,
		batchTransport: context.batchTransport,
		packSize: context.packSize,
		batchTimeout: context.batchTimeout
	});

	context.lastCallback = ()=>{};
	context.lastFrame = 0;
	instance.setAppUid(windowContext.AppUID || null);

	var onVisibilityChange = (result) => {
		if (result === 'visible') {
			setAnimationFrameTime(context, 100);
		} else {
			setAnimationFrameTime(context, 2000);
		}
	};

	var setAnimationFrameTime = function(ctx, time) {
		ctx.animationFrameTime = time;
	};

	const requestAnimationFrame = function(cb) {
		// console.log(' self.animationFrameTime)', self.animationFrameTime);
		context.lastFrame = setTimeout(cb, context.animationFrameTime);
		return context.lastFrame;
	};

	var cancelAnimationFrame = clearTimeout;

	context.Text = window.Text;
	window.setTimeout = setTimeout;
	window.requestAnimationFrame = requestAnimationFrame;

	context.requestAnimationFrame = requestAnimationFrame;
	context.onVisibilityChange = onVisibilityChange;
	context.cancelAnimationFrame = cancelAnimationFrame;

	context.asyncMessage = () => {};
	context.nodeCounter = 0;
	context.hasAlertMicrotask = false;

	var alert = function(text) {

		context.asyncMessage({action: 'alert', text: text},()=>{
			context.hasAlertMicrotask = false;
		});

		context.hasAlertMicrotask = true;

		if (typeof performance === 'undefined') {
			performance = Date;
		}

		var e = performance.now() + 0.8;

		while (performance.now() < e) {
			// Artificially long execution time.
		}
	};
	
	context.alert = alert;
	
	if (!executor) {
		eval(jsFile);
	} else {
		executor()(jsFile);
	}

	return context;
}

function importApp(appName='glimmer', windowContext, executor, context) {
	if (APP_HOOKS[appName]) {
		Object.assign(windowContext.instance.proxyGet, APP_HOOKS[appName]);
	}
	let app = fs.readFileSync(`src/apps/${appName}.js`,'utf8');
	WindowContext(app, windowContext, executor, context);
}


function initPseudoDomImplementation(transport) {
	let self = require('../dom/pseudo-dom.js');
	const implementation = self.pseudoDom;
	const instance = CreateProxy(implementation, transport.transport.bind(transport));
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
	const instance = CreateProxy(node.window, transport.transport.bind(transport));
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
	const instance = CreateProxy(win, transport.transport.bind(transport));
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
	const instance = CreateProxy({
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