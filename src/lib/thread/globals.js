var window = null;
var Element = null;
var document = null;

self.window = window;
self.Element = Element;
self.document = document;

var requestAnimationFrame = function(cb) {
    return setTimeout(cb, 10000);
}

var cancelAnimationFrame = clearTimeout;
self.requestAnimationFrame  = requestAnimationFrame;
self.cancelAnimationFrame = cancelAnimationFrame;