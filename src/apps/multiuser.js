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
	Object.keys(config).forEach((key)=>{
		node[key] = config[key];
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
  
var counter = create({
	tagName: 'div',
	id: 'click-counter',
	textContent: 0
});
  
var leftButton = create({
	tagName: 'button',
	id: 'left-button',
	textContent: '↑',
	onclick() {
		view.counter++;
	}
});
  
var rightButton = create({
	tagName: 'button',
	id: 'right-button',
	textContent: '↓',
	onclick() {
		view.counter--;
	}
});
  
var total = create({
	tagName: 'div',
	id: 'total-clicks',
	textContent: '0'
});
  
setLayout(container, [leftButton, counter, rightButton]);
setLayout(document.body, [container, total]);
  
bindViewProp('total', total, 'textContent', 0);
bindViewProp('counter', counter, 'textContent', 0, [
	function() {
		view.total++;
	}
]);


const styles = `

body {
	background-color: blue;
	margin: 0;
	padding: 0;
	user-select: none;
  }
  
  #app-container {
	margin: 1rem;
	paddin: 1rem;
  }
  
  #click-counter {
	background-color: black;
	color: white;
	height: 5rem;
	line-height: 1.5;
	width: 100%;
	font-size: 3rem;
	text-align: center;
	display: block;
	vertical-align: center;
	float: left;
  }
  
  #left-button, #right-button {
	height: 6rem;
	width: 100%;
	background-color: black;
	color: white;
	border: 0;
	font-weight: bold;
	font-size: 4rem;
	text-align: center;
	display: block;
	float: left;
  }
  
  #left-button:active, #right-button:active,
  {
	background-color: white;
	color: black;
  }
  #left-button:focus, #right-button:focus {
	color: red;
  }
  
  #total-clicks {
	background-color: red;
	display: block;
	width: calc(100% - 4rem);
	height: 1rem;
	float: left;
	padding: 1rem;
	font-family: monospace;
	font-size: 2rem;
	line-height: 0.5;
	text-align: right;
	margin-left: 1rem;
	margin-right: 1rem;
  }

`;


setLayout(document.body, [create({
	tagName: 'style',
	textContent: styles
})]);