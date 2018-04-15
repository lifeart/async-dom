/* global Thread */

let Transport = new Thread();

let multiuserAppConfig = {
	name: 'webWorkerApp2',
	// app: 'multiuser',
	app: 'multicheckboxes',
	implementation: 'simple',
	type: 'websocket',
	callbacks: false,
	batchTransport: false,
	batchTimeout: 10,
	frameTime: 16
};

let demoHostname = 'async.cool';

if (window.location.hostname === 'localhost') {
	Transport.createThread(multiuserAppConfig);
	console.log('createThread');

} else {
	// window.location.search
	if (window.location.hostname === demoHostname) {
		if (window.location.search.includes('admin')) {
			Transport.createThread(Object.assign({},multiuserAppConfig,{
				url: 'wss://'+demoHostname+'/ws-admin'
			}));
		} else {
			Transport.connectAsBigBrother({
				url: 'wss://'+demoHostname+'/ws'
			});
		}
	} else {
		console.log('connectAsBigBrother');
		Transport.connectAsBigBrother({
			port: 8011
		});
	}
}


// Transport.connectAsBigBrother('8011');


// Transport.createThread({
// 	name: 'webWorkerApp2',
// 	app: 'glimmer',
// 	implementation: 'simple',
// 	createInitialDomStructure: true,
// 	type: 'websocket',
// 	batchTransport: true,
// 	batchTimeout: 10,
// 	frameTime: 100
// });

// Transport.createThread({
// 	name: 'webWorkerApp',
// 	app: 'demo',
// 	createInitialDomStructure: false,
// 	batchTransport: true,
// 	implementation: 'simple',
// 	type: 'websocket',
// 	packSize: 2000,
// 	batchTimeout: 10,
// 	frameTime: 30
// });


// Transport.createThread({
// 	name: 'webWorkerApp',
// 	app: 'react',
// 	createInitialDomStructure: false,
// 	batchTransport: true,
// 	implementation: 'simple',
// 	packSize: 2000,
// 	batchTimeout: 10,
// 	frameTime: 30
// });




// Transport.ready = ()=>{
// 	runVM(this);
// };

// const thread = Transport;

// setTimeout(()=>{
// 	Transport.ready();
// },1500);

