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

// self.lastCallback = ()=>{};
self.lastFrame = 0;
self.AppUID = null;

var onVisibilityChange = (result) => {
	if (result === 'visible') {
		// console.log(self.lastCallback);
        
		// cancelAnimationFrame(self.lastFrame);
        
		// self.lastCallback();
		setAnimationFrameTime(self, 100);
	} else {
		setAnimationFrameTime(self, 2000);
	}
};

var requestAnimationFrame = function(cb) {
	// console.log('requestAnimationFrame');
	// self.lastCallback = cb;
	self.lastFrame = setTimeout(cb, self.animationFrameTime);
	return self.lastFrame;
};

var cancelAnimationFrame = clearTimeout;
self.requestAnimationFrame  = requestAnimationFrame;
self.cancelAnimationFrame = cancelAnimationFrame;

var asyncMessage = () => {};

const _cache = new WeakMap();
const ORIGINAL_KEY = '__ORIGINAL__';
let nodeCounter = 0;
let hasAlertMicrotask = false;

var alert = function(text) {
	// console.log(arguments);
	// console.log(arguments.callee);

	asyncMessage({action: 'alert', text: text},()=>{
		hasAlertMicrotask = false;
	});

	hasAlertMicrotask = true;

	var e = performance.now() + 0.8;

	while (performance.now() < e) {
		// Artificially long execution time.
	}

	// while(hasAlertMicrotask) {
	//     setTimeout(()=>{

	//     });
	// }
};
self.alert = alert;