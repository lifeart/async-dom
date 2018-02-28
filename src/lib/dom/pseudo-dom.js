(function (exports) {
	const _this = this;
/* globals asyncImageLoad asyncMessage */

const asyncMessage = () => Promise.resolve({});

const hexToRgba = function(hex, a) {
	if (hex.charAt(0) !== '#') {
		return hex;
	}
	const fixHex = hex => {
		let newHex = hex.startsWith('#') ? hex.slice(1) : hex;

		if (newHex.length === 3) {
			newHex = `${newHex.slice(0, 1)}${newHex.slice(0, 1)}${newHex.slice(
				1,
				2
			)}${newHex.slice(1, 2)}${newHex.slice(2, 3)}${newHex.slice(2, 3)}`;
		}

		return newHex;
	};

	const newHex = fixHex(hex);
	const r = parseInt(newHex.substring(0, 2), 16);
	const g = parseInt(newHex.substring(2, 4), 16);
	const b = parseInt(newHex.substring(4, 6), 16);

	let o;
	if (newHex.length === 8) {
		o = +(parseInt(newHex.substring(6, 8), 16) / 255).toFixed(2);
	}
	o = isNumeric(a) ? a : o;

	return isNumeric(o)
		? `rgba(${r}, ${g}, ${b}, ${o})`
		: `rgb(${r}, ${g}, ${b})`;
};

const isNumeric = n => !isNaN(parseFloat(n)) && isFinite(n);

var navigator = {
	userAgent:
    'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36'
};



let frameActions = [];
let frameWindow = 26000;
var KEBAB_REGEX = /[A-Z\u00C0-\u00D6\u00D8-\u00DE]/g;
// var REVERSE_REGEX = /-[a-z\u00E0-\u00F6\u00F8-\u00FE]/g;
var kebabCache = {};
function kebabCase(str) {
	if (!kebabCache[str]) {
		kebabCache[str] = str.replace(KEBAB_REGEX, function(match) {
			return '-' + match.toLowerCase();
		});
	}
	return kebabCache[str];
}

var imageId = 0;

function EventAdapter(callback) {
	return function(e) {
		e.currentTarget = document._ids[e.currentTarget];
		e.srcElement = document._ids[e.srcElement];
		e.target = document._ids[e.target] || e.currentTarget || null;
		e.toElement = document._ids[e.toElement];
		e.eventPhase = document._ids[e.eventPhase];
		e.preventDefault = () => {};
		callback(e);
	};
}

class Image {
	set src(value) {
		this._src = value;
		asyncImageLoad(
			this._imgId,
			this._src,
			function(result) {
				this.naturalWidth = result.naturalWidth;
				this.naturalHeight = result.naturalHeight;
				this.src = result.src;
				if (typeof this.onload === 'function') {
					this.onload();
				}
			}.bind(this),
			this.onerror
		);
	}
	get src() {
		return this._src;
	}
	constructor() {
		imageId++;
		this._imgId = imageId;
		this.src = '';
		this.onload = '';
		this.onerror = '';
		this.node = document.createElement('img');
		this.node.src = this.src;
		return this;
	}
}

class Element {
	insertAdjacentHTML() {
		return null;
	}
	set onclick(callback) {
		this.addEventListener('click', callback);
	}
	set onmouseenter(callback) {
		// console.log('onmouseenter');
		this.addEventListener('mouseenter', callback);
	}
	set onmouseup(callback) {
		this.addEventListener('mouseup', callback);
	}
	set oncontextmenu(callback) {
		this.addEventListener('contextmenu', callback);
	}
	set ondblclick(callback) {
		this.addEventListener('dblclick', callback);
	}
	set onmousedown(callback) {
		this.addEventListener('mousedown', callback);
	}
	set onmousemove(callback) {
		this.addEventListener('mousemove', callback);
	}
	set onmouseover(callback) {
		this.addEventListener('mouseover', callback);
	}
	set onmouseleave(callback) {
		this.addEventListener('mouseleave', callback);
	}
	set onkeyup(callback) {
		this.addEventListener('keyup', callback);
	}
	set onkeypress(callback) {
		this.addEventListener('keypress', callback);
	}
	set onkeydown(callback) {
		this.addEventListener('keydown', callback);
	}
	get protocol() {
		var url = this.href;
		if (url.charAt(0) === '/' && url.charAt(1) !== '/') {
			url = 'http://localhost:2015' + url;
		}
		var n = new URL(url);

		return n.protocol;
	}
	set innerHTML(value) {
		this._removeChildren();

		this._innerHTML = value;

		if (String(value).trim().length === 0) {
			return;
		}

		if (value.indexOf('>') == -1) {
			this.textContent = value;
			asyncMessage({
				action: 'setTextContent',
				id: this.id,
				textContent: this.textContent
			});
			this._syncDom();

			return;
		}

		if (value.indexOf('<style>') > -1) {
			// this.appendChild(this._root.createElement('style'));
			// return;
		}

		value = value.replace('</br>', '<br/>');

		// Ember.js hook
		if (value === '<textarea>x</textarea>') {
			asyncMessage({ action: 'setHTML', id: this.id, html: this.textContent });
			this.appendChild(this._root.createElement('textarea')).defaultValue = 'x';
		} else {
			this.textContent = value;
			// console.log('textContent',this.textContent);
			asyncMessage({ action: 'setHTML', id: this.id, html: this.textContent });
			// asyncMessage({action:'setTextContent',id:this.id,textContent:this.textContent});
			this._syncDom();
		}
	}
	select() {
		console.log('select', arguments);
	}
	blur() {
		console.log('blur', arguments);
	}
	get className() {
		return this._classes.join(' ');
	}
	set className(value) {
		// console.log('setclassName',value,this.id ,this.tagName);
		asyncMessage({ action: 'setClassName', id: this.id, name: value });
		this._syncDom();
		this._classes = value.split(' ');

		return value;
	}
	get innerHTML() {
		return this._innerHTML;
	}
	set type(value) {
		this._type = value;
	}
	get type() {
		return this._type;
	}
	get nodeType() {
		return 1;
	}
	serialize() {
		return '';
	}
	get ownerDocument() {
		return this._root;
	}
	compareDocumentPosition() {
		return 0;
	}
	getComputedStyle() {
		return this.style;
	}
	setParentNode(parent) {
		this.parentNode = parent;
	}
	get nextSibling() {
		if (!this.parentNode) {
			return null;
		}
		return (
			this.parentNode.children[this.parentNode.children.indexOf(this) + 1] ||
      null
		);
	}
	get previousSibling() {
		if (!this.parentNode) {
			return null;
		}
		return (
			this.parentNode.children[this.parentNode.children.indexOf(this) - 1] ||
      null
		);
	}
	customGetAttributeNode(key) {
		return {
			specified: this._attributes[key] ? true : false,
			value: this._attributes[key]
		};
	}
	_removeChildren() {
		asyncMessage({ action: 'setHTML', id: this.id, html: '' });
		this.children.forEach(el => {
			if (typeof el.remove === 'function') {
				el.remove();
			} else {
				console.log('unable to remove el', el);
			}
		});
		this.children = [];
	}
	removeNode() {
		this.parentNode.removeChild(this);
	}
	get firstChild() {
		return this.children[0] || null;
	}
	get lastChild() {
		return this.children[this.children.length - 1] || null;
	}
	insertBefore(newElement, referenceElement) {
		var index = this.children.indexOf(referenceElement);
		if (index < 0) {
			index = 0;
		}
		newElement.setParentNode(this);
		this.children.splice(index, 0, newElement);
		asyncMessage({
			action: 'insertBefore',
			id: this.id,
			newId: newElement.id,
			refId: referenceElement ? referenceElement.id : null
		});
	}
	remove() {
		// console.log('remove',this);
		this._removeChildren();
		if (this.parentNode) {
			this.parentNode.children = this.parentNode.children.filter(
				el => el !== this
			);
		}

		asyncMessage({ action: 'removeNode', id: this.id });
		// this.removeNode();
		// delete this = undefined;
	}
	removeChild(child) {
		this.children = this.children.filter(el => el !== child);
		child.parentNode = null;
		if (typeof child.remove === 'function') {
			child.remove();
		} else {
			console.log('removeChild', child);
		}
	}
	get attributes() {
		const _this = this;
		const keys = Object.keys(this._attributes);
		return {
			item: index => {
				return {
					name: keys[index],
					value: _this[keys[index]]
				};
			},
			length: keys.length
		};
	}
	pause() {}
	play() {}
	set id(value) {
		// console.log('setId', value);
		var oldId = this._id;
		asyncMessage({
			action: 'setAttribute',
			id: oldId,
			attribute: 'id',
			value: value
		});
		this._root._ids[value] = this;
		this._id = value;
		this._attributes['id'] = value;
	}
	get display() {
		console.log('get display');
		return true;
	}
	set display(value) {
		console.log('set display', value);
		return true;
	}
	get id() {
		return this._id;
	}
	propsToClone() {
		return ['checked'];
	}
	removeAttribute(key) {
		delete this._attributes[key];
		//asyncMessage({action:'removeAttribute',id:this.id,attribute:key});
	}
	setAttribute(key, value) {
		if (key === 'id') {
			this.id = value;
			this._attributes[key] = value;
			return;
		}
		if (key === 'checked') {
			this.checked = value;
		}
		if (key === 'style') {
			value.split(';').forEach(e => {
				let [key, v] = e.split(':');
				if (key && typeof v !== 'undefined') {
					if (key === 'background-color') {
						v = hexToRgba(v);
					}
					this._style[key.trim()] = v.trim();
				}
			});
		}
		this._attributes[key] = value;
		asyncMessage({
			action: 'setAttribute',
			optional: key === 'style' ? true : false,
			id: this.id,
			attribute: key,
			value: value
		});
		this._syncDom();
	}
	get enableSync() {
		return true;
	}
	_syncDom() {
		if (!this.enableSync) {
			return;
		}
		if (!this.offsetHeight) {
			const offHeight = parseInt(this._style.height, 10);
			// console.log(this._style.height);
			if (isNaN(offHeight)) {
				this.offsetHeight = 15;
			} else {
				this.offsetHeight = offHeight;
			}
		}
		if (!this.offsetWidth) {
			const offWidth = parseInt(this._style.width, 10);
			if (isNaN(offWidth)) {
				this.offsetWidth = 16;
			} else {
				this.offsetWidth = offWidth;
			}
			// console.log('offWidth',offWidth);
			// console.log('ewe',this._style.width);
			// this.offsetWidth = this.style.width;
		}
		asyncMessage({ action: 'getElementById', id: this.id }).then(result => {
			var node = result.result;
			if (!node) {
				return;
			}
			if (!result.result.style) {
				// console.log(result.result);
				return;
			}
			// console.log(result.result);
			this.clientWidth = node.clientWidth;
			this.clientHeight = node.clientHeight;
			this.scrollWidth = node.scrollWidth;
			this.scrollHeight = node.scrollHeight;
			this.offsetWidth = node.offsetWidth;
			this.offsetHeight = node.offsetHeight;
			this.innerWidth = node.innerWidth;
			this.innerHeight = node.innerHeight;
			this.scrollTop = node.scrollTop;
			this.scrollLeft = node.scrollLeft;
			this.scrollY = node.scrollY;
			for (var el in node.style) {
				// console.log(el,'"'+node.style[el]+'"');
				this._style[el] = node.style[el];
			}
		});
	}
	get childNodes() {
		return this.children;
	}
	getAttribute(key) {
		return this._attributes[key];
	}
	cloneNode(deep) {
		var newNode = this._root.createElement(this.nodeName);
		this.propsToClone().forEach(prop => {
			newNode[prop] = this[prop];
		});
		if (deep) {
			this.children.forEach(el => {
				newNode.appendChild(el.cloneNode(deep));
			});
		}
		return newNode;
	}
	constructor(nodeName) {

		var _this = this;
		this._attributes = {};
		this.children = [];
		this._classes = [];
		this.parentNode = null;
		this._style = {
			opacity: 1,
			node: this
		};
		this.style = new Proxy(this._style, styleProxy);
		this.clientWidth = 1280;
		this.clientHeight = 800;

		this.scrollWidth = 0;
		this.scrollHeight = 0;
		this.offsetWidth = 0;
		this.offsetHeight = 0;
		this.innerWidth = 0;
		this.innerHeight = 0;
		this.scrollTop = 0;
		this.scrollLeft = 0;
		this.scrollY = 0;

		this.nodeName = String(nodeName).toUpperCase();
		this.tagName = this.nodeName;
		this.type = 'node';

		this.styleSheet = {
			addRule(selector, rule) {
				asyncMessage({
					action: 'styleSheetAddRule',
					id: _this.id,
					selector: selector,
					rule: rule
				});
				// console.log('addRule',_this,arguments);
			}
		};

		this.classList = {
			add(name) {
				_this._classes.push(name);
				_this.className = _this._classes.join(' ');
			},
			remove(name) {
				var newClasses = _this._classes.filter(e => e !== name);
				_this.className = newClasses.join(' ');
			},
			contains(name) {
				return _this.className.indexOf(name) > -1;
			}
		};

		return this;
	}
	closest(selector) {
		console.log('closest', selector, this);
	}
	contains(el) {
		if (!el) {
			return false;
		}
		if (this === el) {
			return true;
		}
		if (el.children && el.children.indexOf(el) > -1) {
			return true;
		}
		if (!el.children) {
			return false;
		}
		var hasEl = false;
		el.children.forEach(child => {
			if (hasEl) {
				return;
			}
			if (typeof child.contains === 'function') {
				hasEl = child.contains(el);
			}
		});
		return hasEl;
	}
	querySelectorAll(selector) {
		if (selector.indexOf('[data-') > -1) {
			console.log('querySelectorAll', selector, this);
			if (selector.indexOf('=') === -1) {
				var results = [];
				var searchKey = selector.replace('[', '').replace(']', '');
				this.children.forEach(el => {
					if (el._attributes && el._attributes[searchKey]) {
						results.push(el);
					}
				});
				return {
					item: function(index) {
						return results[index] || null;
					},
					length: results.length
				};
			}
		}
	}
	get parentElement() {
		return this.parentNode;
	}
	_appendChild(element) {
		// console.log('append');
		element.setParentNode(this);
		// console.log('_appendChild',this.id, this.nodeName, element.id, element.nodeName, this, element);
		if (!element.id) {
			return;
		}
		asyncMessage({
			action: 'appendChild',
			id: this.id,
			childrenId: element.id
		});
		this._syncDom();
		this.children.push(element);
	}
	removeEventListener(name, callback) {
		if (!name) {
			return;
		}
		// asyncMessage({action:'addEventListener',id:this.id,name:name,callback:callback)});
		console.log('removeEventListener', arguments);
	}
	addEventListener(name, callback) {
		if (!name) {
			return;
		}
		asyncMessage({
			action: 'addEventListener',
			id: this.id,
			name: name,
			callback: EventAdapter(callback)
		});
	}
	appendChild(children) {
		if (children.type === 'fragment') {
			console.log('appendFragment', children);
			children.children.forEach(el => {
				this._appendChild(el);
			});
		} else {
			this._appendChild(children);
		}
		return children;
	}
}

class DocumentFragment extends Element {
	constructor(data) {
		super(data);
		this.type = 'fragment';
		return this;
	}
}
class TextNode {
	cloneNode() {
		// console.log('this._root.createText',this);
		var newNode = this.parentNode._root.createTextNode(this.innerHTML);
		return newNode;
	}
	remove() {
		asyncMessage({ action: 'removeNode', id: this._id });
		this.parentNode = null;
	}
	get nodeType() {
		return 3;
	}
	set nodeValue(value) {
		asyncMessage({
			action: 'setProperty',
			id: this._id,
			property: 'nodeValue',
			value: value
		});
	}
	get nodeValue() {
		return this.innerHTML;
	}
	setParentNode(parent) {
		this.parentNode = parent;
	}
	constructor(data) {
		this.innerHTML = data;
		return this;
	}
}
class CommentNode extends TextNode {
	get nodeType() {
		return 8;
	}
}

var styleProxy = {
	get(target, prop) {
		return target[kebabCase(prop)] || '';
	},
	set(target, prop, value) {
		var kebabProp = kebabCase(prop);
		if (kebabProp === 'css-text') {
			value.split(';').forEach(e => {
				let [key, v] = e.split(':');
				if (key && typeof v !== 'undefined') {
					if (key === 'background-color') {
						// console.log(v);
						v = hexToRgba(v);
					}
					// console.log(key,v);
					target[key.trim()] = v.trim();
				}
			});
			target.node.setAttribute('style', value);
			console.log(target);
			return true;
		}

		var val = value;

		if (kebabProp === 'background-color') {
			val = hexToRgba(val);
		}


		if (isNaN(val)) {
			return true;
		}
    
		asyncMessage({
			action: 'setStyle',
			id: target.node.id,
			attribute: kebabProp,
			value: val
		});

		target[kebabProp] = val;
		target.node._syncDom();
		return true;
	}
};


// class CustomEvent {
// 	constructor() {
// 		console.log(arguments);
// 	}
// }

class Document {
	_syncDom(id) {
		if (!id) {
			return;
		}
		this._ids[id]._syncDom();
	}
	createEvent() {
		console.log('createEvent', arguments);
	}
	addEventListener(name, callback) {
		if (!name) {
			return;
		}
		asyncMessage({
			action: 'addEventListener',
			id: 'document',
			name: name,
			callback: EventAdapter(callback)
		});
	}
	removeEventListener(name, callback) {
		if (!name) {
			return;
		}
		// asyncMessage({action:'addEventListener',id:this.id,name:name,callback:callback)});
		console.log('removeEventListener', arguments);
	}
	get defaultView() {

		//foo
		return window;
	}
	get ownerDocument() {
		return this;
	}
	get nodeType() {
		return 9;
	}
	createComment(text) {
		return this._createCommentElement(text);
		// return `<!--${text}-->`;
	}
	getElementsByTagName(tagName) {
		if (tagName === '*') {
			var els = [];
			for (let i in this.taggedElements) {
				this.taggedElements[i].forEach(e => els.push(e));
			}
			return els;
		}
		// console.log('getElementsByTagName',tagName);
		return this.taggedElements[tagName.toUpperCase()];
	}
	get htmlParser() {
		return htmlParser;
	}
	constructor() {
		this.taggedElements = {};
		// this.htmlParser = htmlParser;
		this._ids = {};
		this.implementation = {
			// Ember hook
			createHTMLDocument: function() {
				return {
					body: {
						innerHTML: () => {},
						childNodes: [1, 2]
					}
				};
			}
		};
		this.allNodes = [];
		this.nodeCounter = 0;
		this.head = this._createElement('head');
		this.head.setParentNode(this);
		this.body = this._createElement('body');
		this.body.setParentNode(this);
		this.documentElement = this._createElement('html');
		this.parentNode = this.documentElement;
	}
	getElementById(id) {
		// console.log('getElementById',id);
		return this._ids[id] || this.body;
	}
	createElementNS(ns, nodeName) {
		// console.log('createElement',nodeName,arguments);
		return this._createElement(nodeName);
	}
	querySelectorAll(selector) {
		if (selector.indexOf('[data-') > -1) {
			console.log('querySelectorAll', selector, this);
			if (selector.indexOf('=') === -1) {
				var results = [];
				var searchKey = selector.replace('[', '').replace(']', '');
				this.children.forEach(el => {
					if (el._attributes && el._attributes[searchKey]) {
						results.push(el);
					}
				});
				return {
					item: function(index) {
						return results[index] || null;
					},
					length: results.length
				};
			}
		}
		return [];
	}
	querySelector(q) {
		console.log('querySelector', q);
		if (q === 'body') {
			return this.body;
		}
		if (q === 'meta[name="ember-api-docs/config/environment"]') {
			return {
				getAttribute() {
					return atob(
						'JTdCJTIybW9kdWxlUHJlZml4JTIyJTNBJTIyZW1iZXItYXBpLWRvY3MlMjIlMkMlMjJlbnZpcm9ubWVudCUyMiUzQSUyMnByb2R1Y3Rpb24lMjIlMkMlMjJyb290VVJMJTIyJTNBJTIyLyUyMiUyQyUyMnJvdXRlclJvb3RVUkwlMjIlM0ElMjIvYXBpLyUyMiUyQyUyMmxvY2F0aW9uVHlwZSUyMiUzQSUyMmF1dG8lMjIlMkMlMjJBUElfSE9TVCUyMiUzQSUyMmh0dHBzJTNBLy9lbWJlci1hcGktZG9jcy5nbG9iYWwuc3NsLmZhc3RseS5uZXQlMjIlMkMlMjJnYVRyYWNraW5nSWQlMjIlM0ElMjJVQS0yNzY3NTUzMy0xJTIyJTJDJTIyRW1iZXJFTlYlMjIlM0ElN0IlMjJFWFRFTkRfUFJPVE9UWVBFUyUyMiUzQWZhbHNlJTJDJTIyRkVBVFVSRVMlMjIlM0ElN0IlN0QlN0QlMkMlMjJBUFAlMjIlM0ElN0IlMjJzY3JvbGxDb250YWluZXJTZWxlY3RvciUyMiUzQSUyMmJvZHklMkMlMjBodG1sJTIyJTJDJTIybmFtZSUyMiUzQSUyMmVtYmVyLWFwaS1kb2NzJTIyJTJDJTIydmVyc2lvbiUyMiUzQSUyMjAuMS4wKyUyMiU3RCUyQyUyMmZhc3Rib290JTIyJTNBJTdCJTIyaG9zdFdoaXRlbGlzdCUyMiUzQSU1QiU3QiU3RCUyQyU3QiU3RCU1RCU3RCUyQyUyMmVtYmVyLWFsZ29saWElMjIlM0ElN0IlMjJhbGdvbGlhSWQlMjIlM0ElMjJCSDREOU9EMTZBJTIyJTJDJTIyYWxnb2xpYUtleSUyMiUzQSUyMjc2MDk2OWVmMDgxZmNhZGM3ZTBlNjBmYWVmZGIwOTA3JTIyJTdEJTJDJTIyY29udGVudFNlY3VyaXR5UG9saWN5JTIyJTNBJTdCJTIyZGVmYXVsdC1zcmMlMjIlM0ElMjIlMjdzZWxmJTI3JTIwKi5mYXN0bHkubmV0JTIyJTJDJTIyY29ubmVjdC1zcmMlMjIlM0ElMjIlMjdzZWxmJTI3JTIwKi5hbGdvbGlhLm5ldCUyMCouYWxnb2xpYW5ldC5jb20lMjAqLmZhc3RseS5uZXQlMjIlMkMlMjJzY3JpcHQtc3JjJTIyJTNBJTIyJTI3c2VsZiUyNyUyMHVuc2FmZS1pbmxpbmUlMjB1c2UudHlwZWtpdC5uZXQlMjAlMjdzaGEyNTYtbEtCdGNVREtkMVlzWEFwejN6Z2ZGcDRnN1R1SVZQU3NZZy9pYys3N0xqbyUzRCUyNyUyMCouZmFzdGx5Lm5ldCUyMGh0dHBzJTNBLy93d3cuZ29vZ2xlLWFuYWx5dGljcy5jb20lMjIlMkMlMjJmb250LXNyYyUyMiUzQSUyMiUyN3NlbGYlMjclMjBkYXRhJTNBLy8qJTIwaHR0cHMlM0EvL2ZvbnRzLmdzdGF0aWMuY29tJTIwJTIwKi5mYXN0bHkubmV0JTIyJTJDJTIyaW1nLXNyYyUyMiUzQSUyMiUyN3NlbGYlMjclMjBkYXRhJTNBLy8qJTIwJTIwKi5mYXN0bHkubmV0JTIwaHR0cHMlM0EvL3d3dy5nb29nbGUtYW5hbHl0aWNzLmNvbSUyMiUyQyUyMnN0eWxlLXNyYyUyMiUzQSUyMiUyN3NlbGYlMjclMjAlMjd1bnNhZmUtaW5saW5lJTI3JTIwaHR0cHMlM0EvL2ZvbnRzLmdvb2dsZWFwaXMuY29tJTIwJTIwKi5mYXN0bHkubmV0JTIyJTJDJTIybWVkaWEtc3JjJTIyJTNBJTVCJTIyJTI3c2VsZiUyNyUyMiU1RCU3RCUyQyUyMmNvbnRlbnRTZWN1cml0eVBvbGljeUhlYWRlciUyMiUzQSUyMkNvbnRlbnQtU2VjdXJpdHktUG9saWN5LVJlcG9ydC1Pbmx5JTIyJTJDJTIyZW1iZXJBbmNob3IlMjIlM0ElN0IlMjJhbmNob3JRdWVyeVBhcmFtJTIyJTNBJTIyYW5jaG9yJTIyJTdEJTJDJTIyZXhwb3J0QXBwbGljYXRpb25HbG9iYWwlMjIlM0FmYWxzZSU3RA=='
					);
					// return '%7B%22modulePrefix%22%3A%22ember-observer%22%2C%22environment%22%3A%22production%22%2C%22rootURL%22%3A%22/%22%2C%22locationType%22%3A%22router-scroll%22%2C%22historySupportMiddleware%22%3Atrue%2C%22EmberENV%22%3A%7B%22FEATURES%22%3A%7B%7D%2C%22EXTEND_PROTOTYPES%22%3A%7B%22Date%22%3Afalse%7D%7D%2C%22APP%22%3A%7B%22name%22%3A%22ember-observer%22%2C%22version%22%3A%220.0.0+2beb269f%22%7D%2C%22metricsAdapters%22%3A%5B%7B%22name%22%3A%22GoogleAnalytics%22%2C%22environments%22%3A%5B%22production%22%5D%2C%22config%22%3A%7B%22id%22%3A%22UA-59673320-1%22%7D%7D%2C%7B%22name%22%3A%22LocalAdapter%22%2C%22environments%22%3A%5B%22development%22%5D%7D%5D%2C%22ember-cli-mirage%22%3A%7B%22usingProxy%22%3Atrue%2C%22useDefaultPassthroughs%22%3Atrue%7D%2C%22exportApplicationGlobal%22%3Afalse%7D';
				}
			};
		}
		if (q === 'meta[name="ember-observer/config/environment"]') {
			return {
				getAttribute() {
					return '%7B%22modulePrefix%22%3A%22ember-observer%22%2C%22environment%22%3A%22production%22%2C%22rootURL%22%3A%22/%22%2C%22locationType%22%3A%22router-scroll%22%2C%22historySupportMiddleware%22%3Atrue%2C%22EmberENV%22%3A%7B%22FEATURES%22%3A%7B%7D%2C%22EXTEND_PROTOTYPES%22%3A%7B%22Date%22%3Afalse%7D%7D%2C%22APP%22%3A%7B%22name%22%3A%22ember-observer%22%2C%22version%22%3A%220.0.0+2beb269f%22%7D%2C%22metricsAdapters%22%3A%5B%7B%22name%22%3A%22GoogleAnalytics%22%2C%22environments%22%3A%5B%22production%22%5D%2C%22config%22%3A%7B%22id%22%3A%22UA-59673320-1%22%7D%7D%2C%7B%22name%22%3A%22LocalAdapter%22%2C%22environments%22%3A%5B%22development%22%5D%7D%5D%2C%22ember-cli-mirage%22%3A%7B%22usingProxy%22%3Atrue%2C%22useDefaultPassthroughs%22%3Atrue%7D%2C%22exportApplicationGlobal%22%3Afalse%7D';
				}
			};
		}
		return null;
	}
	createElement(nodeName) {
		// console.log('createElement',nodeName,arguments);
		return this._createElement(nodeName);
	}
	_createCommentElement(textContent) {
		this.nodeCounter++;
		var nodeId = `async-dom-${this.nodeCounter}`;
		var node = new CommentNode(textContent);
		this.allNodes.push(node);
		node._id = nodeId;
		node._root = this;
		this._ids[node._id] = node;
		asyncMessage({
			action: 'createComment',
			id: node.id,
			textContent: textContent || ''
		});
		return node;
	}
	_createElement(name, textContent) {
		this.nodeCounter++;
		var nodeId = `async-dom-${this.nodeCounter}`;
		var elementName = String(name).toUpperCase();
		var node = new Element(elementName);
		node._root = this;
		if (!this.taggedElements[elementName]) {
			this.taggedElements[elementName] = [];
		}
		this.taggedElements[elementName].push(node);
		this.allNodes.push(node);
		node.textContent = textContent;
		// console.log('textContent',textContent);
		if (elementName === 'BODY') {
			node._id = 'body-node';
		} else if (elementName === 'HEAD') {
			node._id = 'head-node';
		} else {
			node._id = nodeId;
		}
		this._ids[node._id] = node;
		asyncMessage({
			action: 'createNode',
			id: node.id,
			tag: node.tagName,
			textContent: textContent || ''
		});
		// console.log('elementName',elementName);
		return node;
	}
	_createTextNode(text) {
		this.nodeCounter++;
		var nodeId = `async-dom-${this.nodeCounter}`;
		var node = new TextNode(text);
		node._root = this;
		if (!this.taggedElements['#text']) {
			this.taggedElements['#text'] = [];
		}
		this.taggedElements['#text'].push(node);
		this.allNodes.push(node);

		node._id = nodeId;
		node.id = nodeId;
		this._ids[nodeId] = node;
		asyncMessage({
			action: 'createNode',
			id: nodeId,
			tag: '#text',
			textContent: text
		});
		// console.log('elementName',elementName);
		return node;
	}
	createTextNode(data) {
		return this._createTextNode(data);
	}
	createDocumentFragment() {
		console.log('createDocumentFragment');
		return new DocumentFragment();
	}
}

class Proxy {
	constructor() {
		return arguments[0];
	}
}

var window = {};

var document = new Document();
window.document = document;
window.document.location = window.location;
window.Element = Element;


function getComputedStyle(el) {
	console.log('getComputedStyle', arguments);
	return el.getComputedStyle();
}
// window.requestAnimationFrame = requestAnimationFrame;
var _localStorage = {};

window.localStorage = {
	setItem: function(key, value) {
		_localStorage[key] = value;
	},
	getItem: function(key) {
		_localStorage[key];
	}
};

window.getComputedStyle = getComputedStyle;
window.history = {};
window.history.state = [];
window.history.pushState = function(state, title, url) {
	asyncMessage({
		action: 'pushState',
		id: Date.now(),
		state: state,
		title: title,
		url: url
	});
	console.log('pushState', arguments);
};
window.history.replaceState = function(state, title, url) {
	asyncMessage({
		action: 'replaceState',
		id: Date.now(),
		state: state,
		title: title,
		url: url
	});
	console.log('replaceState', arguments);
};
window.screen = {
	width: 1280,
	height: 720
};
window.location = {
	href: 'http://127.0.0.1:2015/',
	protocol: 'http:',
	pathname: '/'
};

window.scrollTo = function() {
	console.log(arguments);
	// asyncMessage({action:'scrollTo',id:'window'});
	// console.log('scrollTo', arguments);
};
// window.addEventListener = function(name, callback) {
// 	console.log('addEventListener', name, callback);
// 	if (name === 'load') {
// 		setTimeout(callback, 200);
// 	}
// 	asyncMessage({
// 		action: 'addEventListener',
// 		id: 'window',
// 		name: name,
// 		callback: EventAdapter(callback)
// 	});
// };
// window.removeEventListener = function(name, callback) {
// 	console.log('removeEventListener', name, callback);
// };
// window.dispatchEvent = function() {
// 	console.log('dispatchEvent', arguments);
// };

// instanse of Text
class Text {}

// function initApp() {
// 	let node = document.createElement('div');
// 	node.setAttribute('id', 'app');
// 	document.body.appendChild(node);
// }

// initApp();

// function cancelAnimationFrame(id) {
// 	_this.clearTimeot(id);
// }

// function requestAnimationFrame(callback) {
// 	frameActions.push(callback);
// }

// function goFrame() {
// 	let p = performance.now();
// 	let length = frameActions.length;

// 	for (let i = 0; i < length; i++) {
// 		frameActions[i](p);
// 	}
// 	frameActions.splice(0, length);
// 	const delta = (frameWindow - (performance.now() - p)) / 1000;
// 	setTimeout(goFrame, delta);
// }

	exports.pseudoDom = window;
// goFrame();


