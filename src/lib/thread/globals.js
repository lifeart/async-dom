var window = null;
var Element = null;
var document = null;

self.window = window;
self.Element = Element;
self.document = document;

var requestAnimationFrame = function(cb) {
    // cb();
    // console.log('requestFrame', cb);
    return setTimeout(cb, 100);
}

var cancelAnimationFrame = clearTimeout;
self.requestAnimationFrame  = requestAnimationFrame;
self.cancelAnimationFrame = cancelAnimationFrame;

var asyncMessage = () => {};

const _cache = new Map();
const ORIGINAL_KEY = '__ORIGINAL__';
let nodeCounter = 0;