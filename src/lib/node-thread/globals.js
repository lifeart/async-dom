const self = {};

var window = null;
var Element = null;
var document = null;

self.window = window;
self.Element = Element;
self.document = document;

self.animationFrameTime = 100;
self.batchTransport = false;


self.packSize = 2000;
self.batchTimeout = 6;

self.lastCallback = ()=>{};
self.lastFrame = 0;
self.AppUID = null;

var onVisibilityChange = (result) => {
	if (result === 'visible') {
		setAnimationFrameTime(self, 100);
	} else {
		setAnimationFrameTime(self, 2000);
	}
};

var setAnimationFrameTime = function(ctx, time) {
	ctx.animationFrameTime = time;
};

var requestAnimationFrame = function(cb) {
	self.lastFrame = setTimeout(cb, self.animationFrameTime);
	return self.lastFrame;
};

var cancelAnimationFrame = clearTimeout;

self.requestAnimationFrame = requestAnimationFrame;
self.onVisibilityChange = onVisibilityChange;
self.requestAnimationFrame  = requestAnimationFrame;
self.cancelAnimationFrame = cancelAnimationFrame;

self.asyncMessage = () => {};


self.nodeCounter = 0;
self.hasAlertMicrotask = false;

var alert = function(text) {

	self.asyncMessage({action: 'alert', text: text},()=>{
		self.hasAlertMicrotask = false;
	});

	self.hasAlertMicrotask = true;

	var e = performance.now() + 0.8;

	while (performance.now() < e) {
		// Artificially long execution time.
	}
};
self.alert = alert;

module.exports = self;