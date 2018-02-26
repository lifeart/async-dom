/* global ORIGINAL_KEY */

const proxyMap = new WeakMap();

function getProxy(obj, proxyName='asyncProxy') {
	if (!obj) {
		return obj;
	}
	if (!proxyMap.has(obj)) {
		// console.log(obj);
		// simple style hook;
		if (typeof obj === 'string') {
			return obj;
		}
		proxyMap.set(obj,new Proxy(obj, proxyList[proxyName]));
	}
	return proxyMap.get(obj);
}

const proxyList = {
	style: {
		get(target,prop) {
			// console.log(prop);
			return target[prop];
		},
		set(target, prop, value) {
			// console.log(target, prop, value);
			asyncMessage({action:'setStyle',id:nodeId(target._element),attribute:prop,value:value,optional:true});
			target[prop] = value;
			return true;
		}
	},
	asyncProxy: {
		get: extendedGet,
		set: extendedSet
	},
	body: {
		get(target, prop) {
			if (proxyGet[prop]) {
				if (prop === ORIGINAL_KEY) {
					return proxyGet[prop].bind(target)();
				}
				return proxyGet[prop].bind(target);
			}
			return target[prop];
		},
		set(target, prop, value) {
			target[prop] = value;
			return true;
		}
	},
	document: {
		get(target, prop) {
			if (patches[prop]) {
				return patches[prop].bind(target);
			}
			if (prop === 'body') {
				if (!bodyProxy) {
					bodyProxy = getProxy(target[prop],'body');
				}
				return bodyProxy; 
			}
			if (prop in proxyGet) {
				if (prop === ORIGINAL_KEY) {
					return proxyGet[prop].bind(target)();
				}
				return proxyGet[prop].bind(target);
			}
			return target[prop];
		},
		set(target, prop, value) {
			target[prop] = value;
			return true;
		}
    
	},
	window: {
		get(target, prop) {
			if (patches[prop]) {
				return patches[prop].bind(target);
			}
			if (prop === 'document') {
				if (!documentProxy) {
					documentProxy =  getProxy(target[prop],'document');
				}
				return documentProxy; 
			}
			return target[prop];
			// || self[prop];
		},
		set(target, prop, value) {
			target[prop] = value;
			return true;
		}
	}
};

const NOOP_HOOKS = {
	insertAfter() {
		console.log('insertAfter');
	},
	replaceWith() {
		console.log('replaceWith',arguments);
	},
	append() {
		console.log('append', arguments);
	},
	prepend() {
		console.log('prepend', arguments);
	}
};


const DOM_ATTR_EVENT_HOOKS = {
	onclick(callback) {
		DOM_EVENT_HOOKS.addEventListener.apply(this,['click', callback]);
	},
	onmouseenter(callback) {
		// console.log('onmouseenter');
		DOM_EVENT_HOOKS.addEventListener.apply(this,['mouseenter', callback]);
	},
	onmouseup(callback) {
		DOM_EVENT_HOOKS.addEventListener.apply(this,['mouseup', callback]);
	},
	oncontextmenu(callback) {
		DOM_EVENT_HOOKS.addEventListener.apply(this,['contextmenu', callback]);
	},
	ondblclick(callback) {
		DOM_EVENT_HOOKS.addEventListener.apply(this,['dblclick', callback]);
	},
	onmousedown(callback) {
		DOM_EVENT_HOOKS.addEventListener.apply(this,['mousedown', callback]);
	},
	onmousemove(callback) {
		DOM_EVENT_HOOKS.addEventListener.apply(this,['mousemove', callback]);
	},
	onmouseover(callback) {
		DOM_EVENT_HOOKS.addEventListener.apply(this,['mouseover', callback]);
	},
	onmouseleave(callback) {
		DOM_EVENT_HOOKS.addEventListener.apply(this,['mouseleave', callback]);
	},
	onkeyup(callback) {
		DOM_EVENT_HOOKS.addEventListener.apply(this,['keyup', callback]);
	},
	onkeypress(callback) {
		DOM_EVENT_HOOKS.addEventListener.apply(this,['keypress', callback]);
	},
	onkeydown(callback) {
		DOM_EVENT_HOOKS.addEventListener.apply(this,['keydown', callback]);
	}
};

const DOM_EVENT_HOOKS = {
	removeEventListener(name, callback) {
		if (!name) {
			return;
		}
		// asyncMessage({action:'addEventListener',id:this.id,name:name,callback:callback)});
		// console.log('removeEventListener',arguments);
	},
	addEventListener(name, callback) {
		if (!name) {
			return;
		}
		// console.log('addEventListener',addEventListener, name, callback);
		asyncMessage({action:'addEventListener',id:nodeId(this),name:name,callback:EventAdapter(callback)});
	}
};

const NODE_HOOKS = {
	removeChild(child) {
		let result = this.removeChild.apply(this, [originalNode(child)]);
		asyncMessage({action:'removeChild',id: nodeId(this),childrenId:nodeId(child)});
		return result;
	},
	remove() {
		asyncMessage({action:'removeNode',id: nodeId(this)});
		if (!this.remove) {
			return this.parentNode.removeChild(this);
		}
		return this.remove();
	},
	insertBefore(newElement, referenceElement) {
		// console.log('insertBefore',nodeId(this), nodeId(newElement), referenceElement?nodeId(referenceElement):null);
		let result = this.insertBefore.apply(this, [originalNode(newElement), originalNode(referenceElement)]);
		asyncMessage({
			action:'insertBefore',
			id: nodeId(this),
			newId: nodeId(newElement), 
			refId: referenceElement?nodeId(referenceElement):null
		});
		return result;
	},
	appendChild(element) {
		let result = this.appendChild.apply(this, [originalNode(element)]);
		asyncMessage({action:'appendChild',id: nodeId(this),childrenId: nodeId(element)});
		return result;
	},
	setAttributeNS() {
		console.log('setAttributeNS', arguments);
	},
	setAttribute(attribute, value) {
		// console.log('attribute', attribute);
		if (attribute in DOM_ATTR_EVENT_HOOKS) {
			return DOM_ATTR_EVENT_HOOKS[attribute].apply(this, [value]);
		}
		let result = this.setAttribute.apply(this, [attribute, value]);
		asyncMessage({action:'setAttribute',id:nodeId(this),attribute:attribute,value:value});
		return result;
	},
	removeAttribute(attribute) {
		// console.log('removeAttribure');
		asyncMessage({action:'removeAttribute',id:nodeId(this),attribute:attribute});
		return this.removeAttribute(attribute);
	}
};
	
//@todo fix simple-dom getElementById;
const customDomCache = {};

const DOCUMENT_HOOKS = {
	documentElement() {
		console.log('documentElement');
	},
	// document
	getElementById(id) {
		//@todo fix simple-dom getElementById;
		if (!this.getElementById) {
			return getProxy(customDomCache[id]) || self.appNode;
		}
		let node = this.getElementById.apply(this, [id]);
		// console.log('node',node);
		return getProxy(originalNode(node));
	},
	createComment(text) {
		let element = this.createComment.apply(this, [text]);
		asyncMessage({ action: 'createComment', id: nodeId(element), textContent: text || '' });
		return getProxy(element);
	},
	createElement(tagName, content) {
		let element = this.createElement.apply(this, [tagName, content]);
		let textContent = content ? content : '';
		// console.log('createElement', tagName);
		asyncMessage({action:'createNode',id: nodeId(element),tag:element.tagName, textContent});
		return getProxy(element);
	},
	createDocumentFragment() {
		console.log('createDocumentFragment');
		let fragment = this.createDocumentFragment.apply(this, []);
		return getProxy(fragment);
	},
	createTextNode(text) {
		let node = this.createTextNode.apply(this, [text]);
		asyncMessage({action:'createNode',id: nodeId(node),tag:'#text',textContent:text});
		return getProxy(node);
	},

};

let proxyGet = Object.assign(
	{},
	DOCUMENT_HOOKS,
	NODE_HOOKS,
	DOM_EVENT_HOOKS,
	NOOP_HOOKS,
	{
		[ORIGINAL_KEY]() {
			return this;
		}
	}   
);

let staticGet = {
	style() {
		return getProxy(this.style,'style');
	}
};


const proxySet = Object.assign(
	{},
	DOM_ATTR_EVENT_HOOKS,
	{ 
		// ownerDocument() {
		// console.log('ownerDocument');
		// },
		parentNode(value) {
			// console.log('parentNode',this);
			// setParentNode
			asyncMessage({action:'setParentNode',id:nodeId(this),parent:nodeId(value)});
			return this.parentNode = value;
		},
		className(value) {
			let result = this.className = value;
			asyncMessage({action:'setClassName',id:nodeId(this),name:value});
			return result;
		},
		style(value) {
			// console.log('DOM_ATTR_EVENT_HOOKS=STYLE');
			// console.log('setAttribute','style');
			asyncMessage({action:'setAttribute',id:nodeId(this),attribute:'style',value:value});
			return  this.style = value;
		},
		id(newId) {
			let result = this.id = newId;
			//@todo glimmer fix
			customDomCache[this.id] = this;
			asyncMessage({action:'setAttribute',id:nodeId(this),attribute:'id',value:newId});
			return result;
		},
		nodeValue(value) {
			// console.log('nodeValue', value);
			let result = this.nodeValue = value;
			asyncMessage({action:'setProperty',id: nodeId(this),property:'nodeValue',value:value});
			return result;
		},
		textContent(value) {
			// console.log('textContent', value);
			asyncMessage({action:'setTextContent',id:nodeId(this),textContent: value});
			let result = this.textContent = value;
			return value;
		},
		innerHTML(value) {
			let result = this.innerHTML = value;
			console.log('innerhtml', value);
			asyncMessage({action:'setHTML',id:nodeId(this),html:value});
			return value;
		}
	});


let documentProxy = null;
let bodyProxy = null;

const patches = Object.assign({}, {
	insertAdjacentHTML: function() {
		this.childNodes.length = 2;
		return this;
	}
}, DOM_ATTR_EVENT_HOOKS);

function extendedSet(target, prop, value) {
	if (proxySet[prop]) {
		return proxySet[prop].apply(target,[value]);
	}
	target[prop] = value;
	return true;
}

function extendedGet(target, prop) {
	if (patches[prop]) {
		return patches[prop].bind(target);
	}

	if (proxyGet[prop]) {
		if (prop === ORIGINAL_KEY) {
			return proxyGet[prop].bind(target)();
		}
		return proxyGet[prop].bind(target);
	}

	if (staticGet[prop]) {
		return staticGet[prop].bind(target)();
	}

	return target[prop] || self[prop];
}