/* lobal runVM */

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
	createThread(config) {
		let threadName = config.name;
		let uid = this.getUID();
		let thread = null;

		if (config.type && config.type === 'websocket') {
			thread = new WebSocket('ws://localhost:8010');
			thread.type = 'ws';
			
			thread.postMessage = function (data) {
				thread.send(JSON.stringify(data));
			};
			thread.onopen = () => {
				this.ready();
				console.log('opened');
				thread.postMessage(Object.assign({
					uid: '_configure',
					appUID: uid
				}, config));
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
			thread = new Worker('lib/thread/ww.js?t='+Math.random());
			this.uids[uid] = thread;
			this._bindThreadActions(thread,uid);
			this.threads[threadName] = thread;
			this.threadsList.push(thread);

			this.ready();
			thread.postMessage(Object.assign({
				uid: '_configure',
				appUID: uid
			}, config));
		}

		return thread;
	}
	ready() {
		runVM(window, this);
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



// Transport.createThread({
// 	name: 'webWorkerApp2',
// 	app: 'demo',
// 	implementation: 'domino',
// 	createInitialDomStructure: false,
// 	batchTransport: false,
// 	frameTime: 100
// });

// Transport.ready = ()=>{
// 	runVM(this);
// };

// const thread = Transport;

// setTimeout(()=>{
// 	Transport.ready();
// },1500);

