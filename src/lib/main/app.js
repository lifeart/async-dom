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
			this.uids[data.appUID].postMessage(data);
		} else {
			this.threadsList.forEach((thread) => {
				thread.postMessage(data);
			});
		}
	}
	__get(data) {
		this.callbacks['onmessage'].forEach((fn) => {
			fn(data);
		});
	}
	_bindThreadActions(thread, appUID) {
		thread.onmessage  = (data) => {
			data.data.appUID = appUID;
			this.__get(data);
		};
	}
	createThread(config) {
		let threadName = config.name;
		let uid = this.getUID();
		let thread = null;

		if (config.type && config.type === 'websocket') {

			thread = new WebSocket('ws://localhost:8010');

			thread.postMessage = function (data) {
				// thread.send(data);
				thread.send(JSON.stringify(data));
			};

		
			thread.onopen = function() {
				thread.send('foo-bar');
				// console.log('Соединение установлено.');

				thread.postMessage(Object.assign({
					uid: '_configure',
					appUID: uid
				}, config));
				
			};

			thread.onmessage = function (event) {
				console.log(typeof event.data);
				let reader = new FileReader();
						console.log(arguments);
				reader.onload = function(result) {
					console.log(arguments, reader);
				};
				reader.readAsText(event.data);
		
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

		
		} else {
			thread = new Worker('lib/thread/ww.js?t='+Math.random());
			this.uids[uid] = thread;
			this._bindThreadActions(thread,uid);
			this.threads[threadName] = thread;
			this.threadsList.push(thread);

			
			thread.postMessage(Object.assign({
				uid: '_configure',
				appUID: uid
			}, config));
			

		}

		return thread;
	}
	getUID() {
		return Math.random().toString(36).substr(2, 5);
	}
	getThread() {
		return this;
	}
}



let Transport = new Thread();

Transport.createThread({
	name: 'webWorkerApp',
	app: 'glimmer',
	createInitialDomStructure: true,
	batchTransport: false,
	implementation: 'domino',
	type: 'websocket',
	packSize: 2000,
	batchTimeout: 5,
	frameTime: 250
});

this.debug = true;

// Transport.createThread({
// 	name: 'webWorkerApp2',
// 	app: 'demo',
// 	implementation: 'domino',
// 	createInitialDomStructure: false,
// 	batchTransport: false,
// 	frameTime: 100
// });

const thread = Transport;

