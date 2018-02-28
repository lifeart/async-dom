function ProxyConstructor(implementation, asyncMessage) {

	const window = getProxy(implementation, 'window');
	const document = window.document;

	const proxyMap = new WeakMap();
	let nodeCounter = nodeCounter;

	const _cache = new WeakMap();
	const ORIGINAL_KEY = '__ORIGINAL__';



	const proxyList = {
		style: {
			get(target, prop) {
				// console.log(prop);
				return target[prop];
			},
			set(target, prop, value) {
				// console.log(target, prop, value);
				asyncMessage({
					action: 'setStyle',
					id: nodeId(target._element || target, 'proxyList'),
					attribute: prop,
					value: value,
					optional: true
				});
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
						bodyProxy = getProxy(target[prop], 'body');
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
						documentProxy = getProxy(target[prop], 'document');
					}
					return documentProxy;
				}
				if (DOM_EVENT_HOOKS[prop]) {
					return DOM_EVENT_HOOKS[prop].bind(target);
				}
				return target[prop];
				// || self[prop];
			},
			set(target, prop, value) {
				// console.log(prop,value);
				target[prop] = value;
				return true;
			}
		}
	};

	const NOOP_HOOKS = {
		insertAfter() {
			// console.log('insertAfter');
		},
		replaceWith() {
			// console.log('replaceWith',arguments);
		},
		append() {
			// console.log('append', arguments);
		},
		prepend() {
			// console.log('prepend', arguments);
		}
	};

	const DOM_ATTR_EVENT_HOOKS = {
		onclick(callback) {
			return DOM_EVENT_HOOKS.addEventListener.apply(this, ['click', callback]);
		},
		onmouseenter(callback) {
			// console.log('onmouseenter', this);
			// debugger;
			return DOM_EVENT_HOOKS.addEventListener.apply(this, [
				'mouseenter',
				callback
			]);
		},
		onmouseup(callback) {
			return DOM_EVENT_HOOKS.addEventListener.apply(this, [
				'mouseup',
				callback
			]);
		},
		oncontextmenu(callback) {
			return DOM_EVENT_HOOKS.addEventListener.apply(this, [
				'contextmenu',
				callback
			]);
		},
		ondblclick(callback) {
			return DOM_EVENT_HOOKS.addEventListener.apply(this, [
				'dblclick',
				callback
			]);
		},
		onmousedown(callback) {
			return DOM_EVENT_HOOKS.addEventListener.apply(this, [
				'mousedown',
				callback
			]);
		},
		onmousemove(callback) {
			return DOM_EVENT_HOOKS.addEventListener.apply(this, [
				'mousemove',
				callback
			]);
		},
		onmouseover(callback) {
			return DOM_EVENT_HOOKS.addEventListener.apply(this, [
				'mouseover',
				callback
			]);
		},
		onmouseleave(callback) {
			return DOM_EVENT_HOOKS.addEventListener.apply(this, [
				'mouseleave',
				callback
			]);
		},
		onkeyup(callback) {
			return DOM_EVENT_HOOKS.addEventListener.apply(this, ['keyup', callback]);
		},
		onkeypress(callback) {
			return DOM_EVENT_HOOKS.addEventListener.apply(this, [
				'keypress',
				callback
			]);
		},
		onkeydown(callback) {
			return DOM_EVENT_HOOKS.addEventListener.apply(this, [
				'keydown',
				callback
			]);
		}
	};

	const DOM_EVENT_HOOKS = {
		removeEventListener(name) {
			if (!name) {
				return;
			}
			// asyncMessage({action:'addEventListener',id:this.id,name:name,callback:callback)});
			// console.log('removeEventListener',arguments);
			return getProxy(this);
		},
		addEventListener(name, callback) {
			if (!name) {
				return;
			}
			if (name === 'load') {
				//|| name === 'DOMContentLoaded'
				setTimeout(callback, 100);
				return getProxy(this);
			}
			// console.log('addEventListener',addEventListener, name, callback);
			asyncMessage({
				action: 'addEventListener',
				id: nodeId(this, 'addEventListener'),
				name: name,
				callback: EventAdapter(callback)
			});
			return getProxy(this);
		}
	};

	const NODE_HOOKS = {
		// parentNode() {
		// 	console.log('parentNode');
		// },
		removeChild(child) {
			let result = this.removeChild.apply(this, [originalNode(child)]);
			asyncMessage({
				action: 'removeChild',
				id: nodeId(this, 'removeChild'),
				childrenId: nodeId(child, 'removeChild')
			});
			return result;
		},
		remove() {
			asyncMessage({ action: 'removeNode', id: nodeId(this, 'remove') });
			if (!this.remove) {
				return this.parentNode.removeChild(this);
			}
			return this.remove();
		},
		insertBefore(newElement, referenceElement) {
			// console.log('insertBefore',nodeId(this), nodeId(newElement), referenceElement?nodeId(referenceElement):null);
			let result = this.insertBefore.apply(this, [
				originalNode(newElement),
				originalNode(referenceElement)
			]);
			asyncMessage({
				action: 'insertBefore',
				id: nodeId(this, 'insertBefore'),
				newId: nodeId(newElement, 'insertBefore'),
				refId: referenceElement
					? nodeId(referenceElement, 'insertBefore')
					: null
			});
			return result;
		},
		getAttribute(name) {
			// console.log('getAttribute',name);
			return this.getAttribute(name);
		},
		appendChild(element) {
			let result = this.appendChild.apply(this, [originalNode(element)]);
			asyncMessage({
				action: 'appendChild',
				id: nodeId(this, 'appendChild'),
				childrenId: nodeId(element, 'appendChild')
			});
			return result;
		},
		setAttributeNS() {
			// console.log('setAttributeNS', arguments);
		},
		setAttribute(attribute, value) {
			if (attribute in DOM_ATTR_EVENT_HOOKS) {
				return DOM_ATTR_EVENT_HOOKS[attribute].apply(this, [value]);
			}
			let result = this.setAttribute.apply(this, [attribute, value]);
			asyncMessage({
				action: 'setAttribute',
				id: nodeId(this, 'setAttribute'),
				attribute: attribute,
				value: value
			});
			return result;
		},
		removeAttribute(attribute) {
			// console.log('removeAttribure');
			asyncMessage({
				action: 'removeAttribute',
				id: nodeId(this, 'removeAttribute'),
				attribute: attribute
			});
			return this.removeAttribute(attribute);
		}
	};

	//@todo fix simple-dom getElementById;
	const customDomCache = {};

	const DOCUMENT_HOOKS = {
		documentElement() {
			// console.log('documentElement');
			// return getProxy(originalNode(this.documentElement),'document');
			// return window;
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
			asyncMessage({
				action: 'createComment',
				id: nodeId(element, 'createComment'),
				textContent: text || ''
			});
			return getProxy(element);
		},
		createElement(tagName, content) {
			let element = this.createElement.apply(this, [tagName, content]);
			let textContent = content ? content : '';
			// console.log('createElement', tagName);
			asyncMessage({
				action: 'createNode',
				id: nodeId(element, 'createElement'),
				tag: element.tagName,
				textContent
			});
			return getProxy(element);
		},
		createDocumentFragment() {
			// console.log('createDocumentFragment');
			let fragment = this.createDocumentFragment.apply(this, []);
			return getProxy(fragment);
		},
		createTextNode(text) {
			let node = this.createTextNode.apply(this, [text]);
			asyncMessage({
				action: 'createNode',
				id: nodeId(node, 'createTextNode'),
				tag: '#text',
				textContent: text
			});
			return getProxy(node);
		}
	};

	let proxyGet = Object.assign(
		// {
		// 	firstChild() {
		// 		console.log('proxyGet=firstChilde');
		// 	},
		// 	parentNode() {
		// 		console.log('proxyGet=parentNode',arguments);
		// 	}
		// },
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
		children() {
			// console.log('children', this.children);
			return this.children;
		},
		attributes() {
			// console.log('attributes',this.attributes);
			return this.attributes;
		},
		firstChild() {
			return getProxy(this.firstChild);
		},
		lastChild() {
			return getProxy(this.lastChild);
		},
		//legacy
		parentElement() {
			return getProxy(this.parentNode);
		},
		parentNode() {
			return getProxy(this.parentNode);
		},
		nextSibling() {
			return getProxy(this.nextSibling);
		},
		previousSibling() {
			return getProxy(this.previousSibling);
		},

		ownerDocument() {
			// console.log('ownerDocument',arguments);
			return getProxy(document, 'document');
		},
		style() {
			return getProxy(this.style, 'style');
		}
	};

	const proxySet = Object.assign({}, DOM_ATTR_EVENT_HOOKS, {
		parentNode(value) {
			// console.log('parentNode',this);
			// setParentNode
			asyncMessage({
				action: 'setParentNode',
				id: nodeId(this, 'parentNode'),
				parent: nodeId(value, 'parentNode')
			});
			return (this.parentNode = value);
		},
		className(value) {
			let result = (this.className = value);
			asyncMessage({
				action: 'setClassName',
				id: nodeId(this, 'className'),
				name: value
			});
			return result;
		},
		style(value) {
			// console.log('DOM_ATTR_EVENT_HOOKS=STYLE');
			// console.log('setAttribute','style');
			asyncMessage({
				action: 'setAttribute',
				id: nodeId(this, 'style'),
				attribute: 'style',
				value: value
			});
			return (this.style = value);
		},
		id(newId) {
			let result = (this.id = newId);
			//@todo glimmer fix
			customDomCache[this.id] = this;
			asyncMessage({
				action: 'setAttribute',
				id: nodeId(this, 'id'),
				attribute: 'id',
				value: newId
			});
			return result;
		},
		nodeValue(value) {
			// console.log('nodeValue', value);
			let result = (this.nodeValue = value);
			asyncMessage({
				action: 'setProperty',
				id: nodeId(this, 'nodeValue'),
				property: 'nodeValue',
				value: value
			});
			return result;
		},
		textContent(value) {
			// console.log('textContent', value);
			asyncMessage({
				action: 'setTextContent',
				id: nodeId(this, 'textContent'),
				textContent: value
			});
			let result = (this.textContent = value);
			return result;
		},
		innerHTML(value) {
			let result = (this.innerHTML = value);
			asyncMessage({
				action: 'setHTML',
				id: nodeId(this, 'innerHTML'),
				html: value
			});
			return result;
		}
	});

	let documentProxy = null;
	let bodyProxy = null;

	const patches = Object.assign(
		{},
		{
			insertAdjacentHTML: function() {
				this.childNodes.length = 2;
				return this;
			}
		},
		DOM_ATTR_EVENT_HOOKS
	);

	function extendedSet(target, prop, value) {
		// console.log(prop);
		if (proxySet[prop]) {
			return proxySet[prop].apply(target, [value]);
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

	function originalNode(node) {
		if (!node) {
			return null;
		}
		return node[ORIGINAL_KEY] || node;
	}

	function EventTransformer(callback, e) {
		e.currentTarget = document.getElementById(e.currentTarget);
		e.srcElement = document.getElementById(e.srcElement);
		e.target = document.getElementById(e.target) || e.currentTarget || null;
		e.toElement = document.getElementById(e.toElement);
		e.eventPhase = document.getElementById(e.eventPhase);
		e.preventDefault = () => {};
		callback(e);
	}

	function EventAdapter(callback) {
		return EventTransformer.bind(null, callback);
	}

	function nodeId(maybeElement, debug) {
		if (!maybeElement) {
			console.log('maybeElement', maybeElement, debug);
		}
		let element = maybeElement[ORIGINAL_KEY] || maybeElement;
		if (!_cache.has(element)) {
			nodeCounter++;
			// console.log('element.tagName',element.tagName);
			//window
			if (element.tagName === 'BODY') {
				_cache.set(element, 'async-body');
			} else {
				if (element.id === 'app') {
					_cache.set(element, 'app');
				} else {
					// react fix
					if ('Uint8Array' in element) {
						_cache.set(element, 'window');
					} else {
						_cache.set(element, `a-${self.AppUID}-${nodeCounter}`);
					}
				}
			}
		}
		return _cache.get(element);
	}

	function getProxy(obj, proxyName = 'asyncProxy') {
		if (!obj) {
			return obj;
		}
		if (!proxyMap.has(obj)) {
			if (typeof obj === 'string') {
				return obj;
			}
			proxyMap.set(obj, new Proxy(obj, proxyList[proxyName]));
		}
		return proxyMap.get(obj);
	}

	return {
		proxyGet,
		window,
		proxySet
	};
}

module.exports.ProxyConstructor = ProxyConstructor;