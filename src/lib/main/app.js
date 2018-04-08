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
	connectAsBigBrother(socketPort) {
		return this.createThread({
			initUID: 'start',
			port: socketPort,
			type: 'websocket'
		});
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
			thread = new WebSocket(wsType + '://' + window.location.hostname +':' + wsPort);
			thread.type = 'ws';
			
			thread.postMessage = function (data) {
				thread.send(JSON.stringify(data));
			};

			thread.onopen = () => {
				thread.postMessage(Object.assign({
					uid: initUID,
					appUID: uid
				}, config));
				thread.canSend = true;
				this.ready();
			};

			thread.onclose = function(event) {
				if (event.wasClean) {
					console.log('Соединение закрыто чисто');
				} else {
					console.log('Обрыв соединения'); // например, "убит" процесс сервера
				}
				console.log('Код: ' + event.code + ' причина: ' + event.reason);
			};

			thread.onerror = function(error) {
				console.log('Ошибка ' + error.message);
			};

			this.uids[uid] = thread;
			this._bindThreadActions(thread,uid);
			this.threads[threadName] = thread;
			this.threadsList.push(thread);
		} else {
			thread = new Worker('lib/worker-thread/ww.js?t='+Math.random());
			this.uids[uid] = thread;
			this._bindThreadActions(thread,uid);
			this.threads[threadName] = thread;
			this.threadsList.push(thread);
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

if (window.location.hostname === 'localhost') {
	Transport.createThread({
		name: 'webWorkerApp2',
		app: 'multiuser',
		implementation: 'simple',
		type: 'websocket',
		batchTransport: false,
		batchTimeout: 10,
		frameTime: 16
	});
} else {
	Transport.connectAsBigBrother('8011');
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

