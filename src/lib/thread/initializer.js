/* global proxyGet */

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

	importApp(data.app, proxyGet);
}

function initJsDomImplementation() {
	getDOMImplementation('jsdom-bundle');
	const implementation = self.jsdom.JSDOM;
	let node = new implementation(`<body></body>`);
	window = getProxy(node.window, 'window');
	Element = window.Element;
	document = window.document;
	window.screen = {
		width: 1280,
		height: 720
	};
}


function initDominoImplementation() {
	getDOMImplementation('domino-async-bundle');
	const implementation = self.domino;
	asyncMessage = transport.sendMessage;
	Element = implementation.impl.Element; // etc
	window = getProxy(implementation.createWindow('', 'http://localhost:8080/'),'window');
	document = window.document;
	window.screen = {
		width: 1280,
		height: 720
	};
}

function initSimpleImplementation() {
	getDOMImplementation('simple-dom-bundle');

	const implementation = self.simpleDom;
	asyncMessage = transport.sendMessage;
	Element = implementation.Element; // etc
	let doc = new implementation.Document();
	doc.createElementNS = function(...args) {
		return doc.createElement.apply(doc, args);
	}
	window = getProxy({
		document: doc
	}, 'window');
	document = window.document;
	window.screen = {
		width: 1280,
		height: 720
	};
}

function createInitialDomStructure() {
	document.body.id = 'async-body';
	window.chrome = {};
	let node = document.createElement('div');
	node.id = 'app';
	document.body.appendChild(node);
	//@todo fix simple-dom getE
	self.appNode = node;
	// let secondNode = document.createElement('div');
	// secondNode.innerHTML = 'foo-bar';

	// node.insertBefore(secondNode, null);


	// let firdNode = document.createElement('div');
   
	// firdNode.innerHTML = 'lool';

   


	// node.insertBefore(firdNode,secondNode);
}
