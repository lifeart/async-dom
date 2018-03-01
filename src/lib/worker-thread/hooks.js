/* globals importScripts, APP_NODE_HOOKS, ProxyConstructor */

self.module = {
	exports: {}
};

self.process = {};

self.require = function(name) {
	var requireMap = {
		'simple-dom': function() {
			importScripts('../dom/simple-dom-bundle.js');
			return self.simpleDom;
		},
		'jsdom': function() {
			importScripts('../dom/jsdom-bundle.js');
			return self.jsdom;
		},
		'../dom/pseudo-dom.js': function() {
			importScripts('../dom/pseudo-dom.js');
			return self.pseudoDom;
		},
		'domino': function() {
			importScripts('../dom/domino-async-bundle.js');
			return self.domino;
		},
		'./proxy': function() {
			importScripts('../node-thread/proxy.js');
			return {
				ProxyConstructor
			};
		},
		'./app-hooks': function() {
			importScripts('../node-thread/app-hooks.js');
			return APP_NODE_HOOKS;
		},
		'./../transport/process-transport': function() {
			importScripts('../transport/process-transport.js');
		},
		'./initializers': function() {
			importScripts('../node-thread/initializers.js');
		},
		'fs': function() {
			return {
				readFileSync(fileName) {
					return fileName.replace('src/apps/','../../apps/');
				}
			};
		}

	};
	if (name in requireMap) {
		return requireMap[name]();
	}
};

require('./../transport/process-transport');
require('./initializers');