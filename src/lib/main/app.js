/* global runVM */

class Thread {
	constructor() {
		this.threads = {};
		this.callbacks = {
			'onmessage': []
		};
		this.uids = {};
		this.threadsList = [];
	}
	on(actionName, fn) {
		this.callbacks[actionName].push(fn);
	}
	onmessage(fn) {
		this.on('onmessage',fn);
	}
	sendMessage(data) {
		if (data.appUID) {
			if (this.uids[data.appUID].canSend) {
				this.uids[data.appUID].postMessage(data);
			}
			
		} else {
			this.threadsList.forEach((thread) => {
				if (thread.canSend) {
					thread.postMessage(data);
				}
			});
		}
	}
	__get(data) {
		this.callbacks['onmessage'].forEach((fn) => {
			fn(data);
		});
	}
	_bindThreadActions(thread, appUID) {
		if (thread.type && thread.type === 'ws') {
			thread.onmessage  = (data) => {
				// console.log('raw',data);
				let parsedData = {
					data: JSON.parse(data.data)
				};
				parsedData.data.appUID = appUID;
			
				this.__get(parsedData);
			};
		} else {
			thread.onmessage  = (data) => {
				data.data.appUID = appUID;
				this.__get(data);
			};
		}

	}
	connectAsBigBrother(config) {
		return this.createThread(Object.assign({}, config, {
			initUID: 'start',
			type: 'websocket'
		}));
	}
	getWsThread(wsUrl, threadConfig) {
		let thread = new WebSocket(wsUrl);
		thread.type = 'ws';
		thread.postMessage = function (data) {
			// console.log(data);
			// if (data.cb) {
			thread.send(JSON.stringify(data));
			// }
		};
		thread.onclose = this.wsThreadOnClose.bind(this);
		thread.onerror = this.wsThreadOnError.bind(this);
		thread.onopen = () => {
			thread.postMessage(threadConfig);
			thread.canSend = true;
			this.ready();
		};
		return thread;
	}
	wsThreadOnClose(event) {

		if (event.wasClean) {
			console.log('Соединение закрыто чисто');
		} else {
			console.log('Обрыв соединения'); // например, "убит" процесс сервера
		}
		console.log('Код: ' + event.code + ' причина: ' + event.reason);
		
	}
	wsThreadOnError(error) {
		console.log('Ошибка ' + error.message);
	}
	addThread(thread, threadName, uid) {
		this.uids[uid] = thread;
		this._bindThreadActions(thread,uid);
		this.threads[threadName] = thread;
		this.threadsList.push(thread);
	}
	createThread(config) {
		let threadName = config.name;
		let uid = this.getUID();
		let thread = null;
		let initUID = config.initUID || '_configure';
		let wsPort = config.port || 8010;

		if (config.type && config.type === 'websocket') {
			let wsType = 'ws';
			if (window.location.protocol === 'https:') {
				wsType = 'wss';
			}
			let wsUrl = config.url ||  wsType + '://' + window.location.hostname +':' + wsPort;

			let threadConfig = Object.assign({
				uid: initUID,
				appUID: uid
			}, config);

			thread = this.getWsThread(wsUrl, threadConfig);
			this.addThread(thread, threadName, uid);
		} else {
			thread = new Worker('lib/worker-thread/ww.js?t='+Math.random());
			this.addThread(thread, threadName, uid);
			thread.canSend = true;

			this.ready();
			thread.postMessage(Object.assign({
				uid: initUID,
				appUID: uid
			}, config));
		}

		return thread;
	}
	ready() {
		if (this._activated) {
			return;
		}
		runVM(window, this);
		this._activated = true;
	}
	getUID() {
		return Math.random().toString(36).substr(2, 5);
	}
	getThread() {
		return this;
	}
}



let Transport = new Thread();

let multiuserAppConfig = {
	name: 'webWorkerApp2',
	// app: 'multiuser',
	app: 'multicheckboxes',
	implementation: 'simple',
	type: 'websocket',
	callbacks: false,
	batchTransport: false,
	batchTimeout: 10,
	frameTime: 16
};

let demoHostname = 'async.cool';

if (window.location.hostname === 'localhost') {
	Transport.createThread(multiuserAppConfig);
	console.log('createThread');

} else {
	// window.location.search
	if (window.location.hostname === demoHostname) {
		if (window.location.search.includes('admin')) {
			Transport.createThread(Object.assign({},multiuserAppConfig,{
				url: 'wss://'+demoHostname+'/ws-admin'
			}));
		} else {
			Transport.connectAsBigBrother({
				url: 'wss://'+demoHostname+'/ws'
			});
		}
	} else {
		console.log('connectAsBigBrother');
		Transport.connectAsBigBrother({
			port: 8011
		});
	}
}


// Transport.connectAsBigBrother('8011');


// Transport.createThread({
// 	name: 'webWorkerApp2',
// 	app: 'glimmer',
// 	implementation: 'simple',
// 	createInitialDomStructure: true,
// 	type: 'websocket',
// 	batchTransport: true,
// 	batchTimeout: 10,
// 	frameTime: 100
// });

// Transport.createThread({
// 	name: 'webWorkerApp',
// 	app: 'demo',
// 	createInitialDomStructure: false,
// 	batchTransport: true,
// 	implementation: 'simple',
// 	type: 'websocket',
// 	packSize: 2000,
// 	batchTimeout: 10,
// 	frameTime: 30
// });


// Transport.createThread({
// 	name: 'webWorkerApp',
// 	app: 'react',
// 	createInitialDomStructure: false,
// 	batchTransport: true,
// 	implementation: 'simple',
// 	packSize: 2000,
// 	batchTimeout: 10,
// 	frameTime: 30
// });




// Transport.ready = ()=>{
// 	runVM(this);
// };

// const thread = Transport;

// setTimeout(()=>{
// 	Transport.ready();
// },1500);

