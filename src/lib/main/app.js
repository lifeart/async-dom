function getThread() {
	return new Worker('/lib/thread/ww.js');
}

const thread = getThread();