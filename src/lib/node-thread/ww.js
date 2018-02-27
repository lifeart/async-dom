process.on('message', (msg) => {
	// const sum = longComputation();
	process.send(msg);
});