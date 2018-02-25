class Thread {
	constructor() {
		this.threads = {};
		this.callbacks = {
			'onmessage': []
		};
		this.threadsList = [];
	}
	on(actionName, fn) {
		this.callbacks[actionName].push(fn);
	}
	onmessage(fn) {
		this.on('onmessage',fn);
	}
	sendMessage(data) {
		this.threadsList.forEach((thread) => {
			thread.postMessage(data);
		});
	}
	__get(data) {
		this.callbacks['onmessage'].forEach((fn) => {
			fn(data);
		});
	}
	_bindThreadActions(thread) {
		thread.onmessage  = this.__get.bind(this);
	}
	createThread(threadName) {
		let thread = new Worker('/lib/thread/ww.js?t='+Date.now());
		this._bindThreadActions(thread);
		this.threads[threadName] = thread;
		this.threadsList.push(thread);
		return thread;
	}
	getThread() {
		return this;
	}
}


let Transport = new Thread();
Transport.createThread('webWorkerApp');
// Transport.createThread('webWorkerApp2');

const thread = Transport;

console.log('thread',thread);