//@todo - input[type,checked];

function ce(nodeName) {
	return document.createElement(nodeName);
}
function setLayout(root, children = []) {
	children.forEach((node)=>{
		root.appendChild(node);
	});
}
function create(config) {
	let node = ce(config.tagName);
	delete config.tagName;
	let attributes = config.attributes || [];
	delete config.attributes;
	Object.keys(config).forEach((key)=>{
		node[key] = config[key];
	});
	attributes.forEach(([name, value])=>{
		node.setAttribute(name, value);
	});
	return node;
}
  
function bindViewProp(viewPropName, node, nodePropName, defaultValue=undefined, onChangeActions=[]) {
	Object.defineProperty(view, viewPropName, {
		get() {
			return this['_' + viewPropName];
		},
		set(value) {
			this['_' + viewPropName] = value;
			requestAnimationFrame(()=>{
				node[nodePropName] = value;
			});
			onChangeActions.forEach((cb)=>{
				cb(value);
			});
			return true;
		}
	});
	view[viewPropName] = defaultValue;
}
  
  
var view = {};
  
var container = create({
	tagName: 'div',
	id: 'app-container'
});
  
var checks = (new Array(300)).fill(null).reduce((result, item, index)=>{
	let stateKey = 'input_' + index;
	let node = create({
		tagName: 'input',
		checked: false,
		type: 'checkbox',
		onchange() {
			// console.log('onchange', event.currentTarget);
			view[stateKey] = !view[stateKey];
		}
	});
	bindViewProp(stateKey, node, 'checked', false, [
		function(value) {
			node.checked = value;
		}
	]);
	result.push(node);
	return result;
},[]);
  
setLayout(container, [].concat(create({
	tagName: 'h1',
	textContent: 'Checkboxes: Multiuser'
}),checks));
setLayout(document.body, [container]);


setLayout(document.body, [create({
	tagName: 'style',
	textContent: `
		body {
			background-color: #cecece;
			padding: 5px;
			text-align: center;
		}
		input[type="checkbox"] {
			width: 24px;
			height: 24px;
			padding: 1px;
			margin: 1px;
		}
	`
})]);