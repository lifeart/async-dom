function getThread() {
	return new Worker('/lib/thread/ww.js?t='+Date.now());
}

const thread = getThread();