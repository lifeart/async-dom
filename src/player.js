class Timeline {
	constructor() {
		this.frames = [];
		this.lastFrame = 0;
	}
	push(action) {
		this.frames.push([this.lastFrame, action]);
		this.broadcastFrame(action, this.lastFrame);
		this.lastFrame++;
	}
	framesCount() {
		return this.frames.length;
	}
	vacuum() {
		//to implement
	}
	broadcastFrame() {

	}
	playFromFrame(fromFrameId = 0, limit = 0) {
		var lastFrame = fromFrameId;
		var framesPool = this.frames.reduce((collector, [frameId, actions])=>{
			if (frameId > fromFrameId && (limit === 0 || collector.length < limit)) {
				lastFrame = frameId;
				collector.push(actions);
			}
			return collector;
		},[]);
		return [lastFrame, framesPool];
	}
}

class TimelineConnection {
	constructor(socket) {
		this.provider = socket;
		this.events = {};
		this.provider.on('message', (rawData) => {
			let data = JSON.parse(rawData);
			this.invoke(data.name, data);
		});
	}
	sendMessage(data) {
		this.provider.send(data);
	}
	_createEventArray(eventName) {
		if (!this.events[eventName]) {
			this.events[eventName] = [];
		}
	}
	invoke(eventName, data) {
		(this.events[eventName]||[]).forEach((cb)=>{
			cb(data);
		});
	}
	on(eventName, callback) {
		this._createEventArray(eventName);
		let eventsPool = this.events[eventName];
		if (eventsPool.filter((cb)=>cb === callback).length) {
			return;
		}
		eventsPool.push(callback);
	}
}

class TimelineClient {
	constructor(connection, timeline = null) {
		if (timeline === null) {
			throw 'Unable to create TimelineClient, no timeline passed';
		}
		this.connection = connection;
		this.frameId = 0;
		this.timeline = timeline;
		this.setupClient();
	}
	sendMessage(messageName, [newLastFrameId, itemsList]) {
		this.connection.sendMessage({
			_name: messageName,
			lastFrame: newLastFrameId,
			items: itemsList
		});
	}
	clientPlayFromFrame() {
		return this.timeline.playFromFrame(this.frameId);
	}
	setupClient() {
		this.sendMessage('ready', this.frameId, this.timeline.framesCount());
		this.on('start', ({lastFrame}) => {
			this.frameId = lastFrame;
			this.sendMessage('next', this.clientPlayFromFrame());
		});
		this.on('next', ({lastFrame}) => {
			this.frameId = lastFrame;
			this.sendMessage('next', this.clientPlayFromFrame());
		});
		this.on('stop', () => {
			console.log('clientStopped');
		});
	}
}

module.exports.TimelineConnection = TimelineConnection;
module.exports.TimelineClient = TimelineClient;
module.exports.Timeline = Timeline;