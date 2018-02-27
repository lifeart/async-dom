const { getProxy, proxyGet } = require('./proxy');
const APP_NODE_HOOKS = require('./app-hooks');

function getDOMImplementation(name) {
	console.log('domImplemented', name);
	requireJS(`../dom/${name}.js`);
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


function initPseudoDomImplementation() {
	getDOMImplementation('pseudo-dom');
	const implementation = self.pseudoDom;
	// console.log('implementation',implementation);
	// console.log(implementation,window.Element);
	// let node = new implementation(`<body></body>`);
	window = getProxy(implementation, 'window');
	// asyncMessage = transport.sendMessage;
	
	Element = window.Element;
	document = window.document;
	window.screen = {
		width: 1280,
		height: 720
	};

	return {
		Element: window.Element,
		document: window.document,
		window: 
	};
}

function initJsDomImplementation() {
	getDOMImplementation('jsdom-bundle');
	const implementation = self.jsdom.JSDOM;
	let node = new implementation(`<body></body>`);
	return getProxy(node.window, 'window');;
}


function initDominoImplementation() {
	getDOMImplementation('domino-async-bundle');
	const implementation = self.domino;
	return getProxy(implementation.createWindow('', 'http://localhost:8080/'),'window');
}

function initSimpleImplementation() {
	getDOMImplementation('simple-dom-bundle');
	const implementation = self.simpleDom;
	// asyncMessage = transport.sendMessage;
	// Element = implementation.Element; // etc
	let doc = new implementation.Document();
	doc.createElementNS = function(...args) {
		return doc.createElement.apply(doc, args);
	};
	window = getProxy({
		document: doc
	}, 'window');
	return window;
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

	// let secondNode = document.createElement('div');
	// secondNode.innerHTML = 'foo-bar';
	// node.insertBefore(secondNode, null);

	// let firdNode = document.createElement('div');
	// firdNode.innerHTML = 'lool';

	// node.insertBefore(firdNode,secondNode);
}

module.exports.configureThread = configureThread;