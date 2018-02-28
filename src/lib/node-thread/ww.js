// const globals = require('./globals');
const { ProcessTransport } = require('./../transport/process-transport');
const configureThread = require('./initializers').configureThread;

const transportInstance = new ProcessTransport();

// const noop = () => {};

// const onVisibilityChange = noop;

// let navigator = null;
let window = {};

let uids = {
	_configure: (data) => {
		configureThread(data,transportInstance);
	},
	_setNavigator: () => {
		// data
		// navigator = data.navigator;
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
		console.log('onVisibilityChange');
		// onVisibilityChange(value);
	},
	_onPerformanceFeedback: (data) => {
		console.log('adjustSpeed');
	},
	_setScreen: ({ screen }) => {
		window.screen = screen;
	},
	init: () => {
		console.log('init');
	}
};

transportInstance.addUids(uids);