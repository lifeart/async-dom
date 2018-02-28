const ProxyConstructor = require('./proxy');
const APP_NODE_HOOKS = require('./app-hooks');

function getDOMImplementation(name) {
	console.log('domImplemented', name);
	return require(`../dom/${name}.js`);
}

function configureThread(data) {

	if (data.implementation) {
		if (data.implementation === 'simple') {
			initSimpleImplementation();
		} else if (data.implementation === 'domino') {
			initDominoImplementation();
		} else if (data.implementation === 'jsdom') {
			initJsDomImplementation();
		} else if (data.implementation === 'pseudo') {
			initPseudoDomImplementation();
		} else {
			initDominoImplementation();
		}
	} else {
		initDominoImplementation();
	}

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

function importApp(appName='glimmer') {
	if (APP_NODE_HOOKS[appName]) {
		Object.assign(proxyGet, APP_NODE_HOOKS[appName]);
	}
	requireJS(`../../apps/${appName}.js`);
}


function initPseudoDomImplementation(transport) {
	let self = getDOMImplementation('pseudo-dom');
	const implementation = self.pseudoDom;
	const instance = ProxyConstructor(implementation, transport.transport);

	// window.screen = {
	// 	width: 1280,
	// 	height: 720
	// };

	return {
		Element: instance.window.Element,
		document: instance.window.document,
		window: instance.window
	};
}

function initJsDomImplementation(transport) {
	const self = getDOMImplementation('jsdom-bundle');
	const implementation = self.jsdom.JSDOM;
	let node = new implementation(`<body></body>`);
	const instance = ProxyConstructor(node.window, transport.transport);
	return {
		Element: instance.window.Element,
		document: instance.window.document,
		window: instance.window
	};
}


function initDominoImplementation(transport) {
	const implementation = getDOMImplementation('domino-async-bundle');
	const win = implementation.createWindow('', 'http://localhost:8080/');
	const instance = ProxyConstructor(win, transport.transport);
	return {
		Element: instance.window.Element,
		document: instance.window.document,
		window: instance.window
	};
}

function initSimpleImplementation(transport) {
	const implementation = getDOMImplementation('simple-dom-bundle');
	let doc = new implementation.Document();
	doc.createElementNS = function(...args) {
		return doc.createElement.apply(doc, args);
	};
	const instance = ProxyConstructor({
		document: doc
	}, transport.transport);

	return {
		Element: instance.window.Element,
		document: instance.window.document,
		window: instance.window
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