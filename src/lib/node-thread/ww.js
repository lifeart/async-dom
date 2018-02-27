// const globals = require('./globals');
const { ProcessTransport } = require('./../transport/process-transport');

const transportInstance = new ProcessTransport();
const noop = () => {};

const configureThread = noop;
const onVisibilityChange = noop;
const adjustSpeed = noop;
const _initWebApp = noop;

let navigator = null;
let window = {};

let uids = {
	_configure: (data) => {
		configureThread(data);
	},
	_setNavigator: (data) => {
		navigator = data.navigator;
	},
	_setLocation: ({ location }) => {
		window.location = location;
	},
	_onFocus: () => {
		if (window.onfocus) {
			window.onfocus();
		}
	},
	_onhashchange: () => {
		window.onhashchange();
	},
	_onpopstate: () => {
		window.onpopstate();
	},
	_onBlur: () => {
		if (window.onblur) {
			window.onblur();
		}
	},
	_visibilitychange: ({ value }) => {
		onVisibilityChange(value);
	},
	_onPerformanceFeedback: data => {
		adjustSpeed(data);
	},
	_setScreen: ({ screen }) => {
		window.screen = screen;
	},
	init: () => {
		_initWebApp();
	}
};

transportInstance.addUids(uids);

// console.log('globals',globals);

process.on('message', msg => {
	// const sum = longComputation();
	process.send(msg);
});

exports.navigator = navigator;
