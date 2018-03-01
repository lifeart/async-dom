
// // this.styleSheet = {
// //     462.	      addRule(selector,rule) {	516.	      addRule(selector,rule) {
// //     463.		517.	
// //     464.	          asyncSendMessage({action:'styleSheetAddRule',id:_this.id,selector:selector,rule:rule});	518.	          asyncMessage({action:'styleSheetAddRule',id:_this.id,selector:selector,rule:rule});
// //     465.	          // console.log('addRule',_this,arguments);	519.	          // console.log('addRule',_this,arguments);
// //     466.	      }	520.	      }
// //     467.	    }	521.	    }

let noop = ()=>{};

let eventProto = {
	initEvent: noop,
	isPersistent() {
		return true;
	},
	constructor: {
		release: noop
	},
	source: windowProto,
	dispatchConfig: {
		phasedRegistrationNames: []
	},
	data: null
};

let documentProto = {
	querySelectorAll: noop,
	addEventListener: noop,
	createEvent: () => {
		return eventProto;
	},
	documentElement: {
		textContent: null
	},
	ownerDocument: documentProto,
	createElement: noop,
	documentMode: null,
	implementation: {
		hasFeature() {
			return true;
		}
	},
	onclick: noop,
	createRange() {
		return {
			setStart() {

			}
		};
	}
};


let nodeProto = {
	dispatchEvent: noop,
	onclick: noop,
	detachEvent: noop,
	ownerDocument: documentProto,
	documentElement: documentProto,
	compareDocumentPosition: noop,
	innerHTML: '',
	focus: noop
};


let windowProto = {
	removeEventListener: noop,
	attachEvent: noop,
	top: windowProto,
	self: windowProto,
	addEventListener: noop,
	screen: {},
	documentElement: document,
	AnimationEvent: null,
	TransitionEvent: null,
	getSelection: noop,
	location: {
		protocol: 'http'
	},
	document: {
	
	}
};

let navigatorProto = {
	userAgent: 'Chrome Edge Firefox'
};


// var range = document.createRange();
// range.setStart(startMarker.node, startMarker.offset);
// selection.removeAllRanges();