
// // this.styleSheet = {
// //     462.	      addRule(selector,rule) {	516.	      addRule(selector,rule) {
// //     463.		517.	
// //     464.	          asyncSendMessage({action:'styleSheetAddRule',id:_this.id,selector:selector,rule:rule});	518.	          asyncMessage({action:'styleSheetAddRule',id:_this.id,selector:selector,rule:rule});
// //     465.	          // console.log('addRule',_this,arguments);	519.	          // console.log('addRule',_this,arguments);
// //     466.	      }	520.	      }
// //     467.	    }	521.	    }

// var evt = document.createEvent('Event');
// evt.initEvent(evtType, false, false);
// fakeNode.dispatchEvent(evt);

// window.removeEventListener('error', onError);

// if (!event.isPersistent()) {
// event.constructor.release(event);
// }




// var IndeterminateComponent = 0; // Before we know whether it is functional or class
// var FunctionalComponent = 1;
// var ClassComponent = 2;
// var HostRoot = 3; // Root of a host tree. Could be nested inside another node.
// var HostPortal = 4; // A subtree. Could be an entry point to a different renderer.
// var HostComponent = 5;
// var HostText = 6;
// var CallComponent = 7;
// var CallHandlerPhase = 8;
// var ReturnComponent = 9;
// var Fragment = 10;


// event.dispatchConfig.phasedRegistrationNames


// function getTextContentAccessor() {
// if (!contentKey && ExecutionEnvironment.canUseDOM) {
// // Prefer textContent to innerText because many browsers support both but
// // SVG <text> elements don't support innerText even when <div> does.
// contentKey = 'textContent' in document.documentElement ? 'textContent' : 'innerText';
// }
// return contentKey;
// }



// var documentMode = null;
// if (ExecutionEnvironment.canUseDOM && 'documentMode' in document) {
// documentMode = document.documentMode;
// }

// var useHasFeature;
// if (ExecutionEnvironment.canUseDOM) {
// useHasFeature = document.implementation && document.implementation.hasFeature &&
// // always returns true in newer browsers as per the standard.
// // @see http://dom.spec.whatwg.org/#dom-domimplementation-hasfeature
// document.implementation.hasFeature('', '') !== true;
// }


// (function () {
// 'use strict';

// var canUseDOM = !!(
//   typeof window !== 'undefined' &&
//   window.document &&
//   window.document.createElement
// );

// var ExecutionEnvironment = {

//   canUseDOM: canUseDOM,

//   canUseWorkers: typeof Worker !== 'undefined',

//   canUseEventListeners:
// 	  canUseDOM && !!(window.addEventListener || window.attachEvent),

//   canUseViewport: canUseDOM && !!window.screen

// };

// if (typeof define === 'function' && typeof define.amd === 'object' && define.amd) {
//   define(function () {
// 	  return ExecutionEnvironment;
//   });
// } else if (typeof module !== 'undefined' && module.exports) {
//   module.exports = ExecutionEnvironment;
// } else {
//   window.ExecutionEnvironment = ExecutionEnvironment;
// }

// }());


// var documentMode = null;
// if (ExecutionEnvironment.canUseDOM && 'documentMode' in document) {
// documentMode = document.documentMode;
// }

// var useFallbackCompositionData = ExecutionEnvironment.canUseDOM && (!canUseCompositionEvent || documentMode && documentMode > 8 && documentMode <= 11);


// var useHasFeature;
// if (ExecutionEnvironment.canUseDOM) {
// useHasFeature = document.implementation && document.implementation.hasFeature &&
// // always returns true in newer browsers as per the standard.
// // @see http://dom.spec.whatwg.org/#dom-domimplementation-hasfeature
// document.implementation.hasFeature('', '') !== true;
// }



// function isEventSupported(eventNameSuffix, capture) {
// if (!ExecutionEnvironment.canUseDOM || capture && !('addEventListener' in document)) {
// return false;
// }

// var eventName = 'on' + eventNameSuffix;
// var isSupported = eventName in document;

// if (!isSupported) {
// var element = document.createElement('div');
// element.setAttribute(eventName, 'return;');
// isSupported = typeof element[eventName] === 'function';
// }

// if (!isSupported && useHasFeature && eventNameSuffix === 'wheel') {
// // This is the only way to test support for the `wheel` event in IE9+.
// isSupported = document.implementation.hasFeature('Events.wheel', '3.0');
// }

// return isSupported;
// }


// activeElement.detachEvent('onpropertychange', handlePropertyChange);

// node.sibling

// node.child

// if (!('AnimationEvent' in window)) {
// delete vendorPrefixes.animationend.animation;
// delete vendorPrefixes.animationiteration.animation;
// delete vendorPrefixes.animationstart.animation;
// }

// // Same as above
// if (!('TransitionEvent' in window)) {
// delete vendorPrefixes.transitionend.transition;
// }

// firstChild
// node.nextSibling;
// = node.parentNode;

// if (!window.getSelection) {
// return;
// }

// var range = document.createRange();
// range.setStart(startMarker.node, startMarker.offset);
// selection.removeAllRanges();

// function isInDocument(node) {
// return containsNode(document.documentElement, node);
// }

// if (!node.hasAttribute(name)) {
// return expected === undefined ? undefined : null;
// }


// while (queryRoot.parentNode) {
// queryRoot = queryRoot.parentNode;
// }

// // If `rootNode.form` was non-null, then we could try `form.elements`,
// // but that sometimes behaves strangely in IE8. We could also try using
// // `form.getElementsByName`, but that will only return direct children
// // and won't include inputs that use the HTML5 `form=` attribute. Since
// // the input might not even be in a form. It might not even be in the
// // document. Let's just use the local `querySelectorAll` to ensure we don't
// // miss anything.
// var group = queryRoot.querySelectorAll('input[name=' + JSON.stringify('' + name) + '][type="radio"]')

// var testElement = parent.namespaceURI === HTML_NAMESPACE ? parent.ownerDocument.createElement(parent.tagName) : parent.ownerDocument.createElementNS(parent.namespaceURI, parent.tagName);
// testElement.innerHTML = html;
// return testElement.innerHTML;


// // nice names
// setValueForStyles(domElement, propValue, getStack);
// } else if (propKey === DANGEROUSLY_SET_INNER_HTML) {
// setInnerHTML(domElement, propValue);
// } else if (propKey === CHILDREN) {
// setTextContent(domElement, propValue);
// } else if (isCustomComponentTag) {
// if (propValue != null) {
// setValueForAttribute(domElement, propKey, propValue);
// } else {
// deleteValueForAttribute(domElement, propKey);
// }
// } else if (propValue != null) {
// setValueForProperty(domElement, propKey, propValue);
// } else {
// // If we're updating to null or undefined, we should remove the property
// // from the DOM node instead of inadvertently setting to a string. This
// // brings us in line with the same behavior we have on initial render.
// deleteValueForProperty(domElement, propKey);
// }


// /// 
// getOwnerDocumentFromRootContainer


// ///
// var root = rootContainerInstance.documentElement;

// ///
// container.parentNode.insertBefore(child, container);
// } else {
// container.appendChild(child);

// //
// domElement.focus();

// //
// container.removeChild(child);

// //
// var node = instance.nextSibling;
// //
// container.lastChild

// //
// if (!foundDevTools && ExecutionEnvironment.canUseDOM && window.top === window.self) {
// // If we're in Chrome or Firefox, provide a download link if not installed.
// if (navigator.userAgent.indexOf('Chrome') > -1 && navigator.userAgent.indexOf('Edge') === -1 || navigator.userAgent.indexOf('Firefox') > -1) {
// var protocol = window.location.protocol;
// // Don't warn in exotic cases like chrome-extension://.
// if (/^(https?|file):$/.test(protocol)) {
//   console.info('%cDownload the React DevTools ' + 'for a better development experience: ' + 'https://fb.me/react-devtools' + (protocol === 'file:' ? '\nYou might need to use a local HTTP server (instead of file://): ' + 'https://fb.me/react-devtools-faq' : ''), 'font-weight:bold');
// }
// }
// }


// function getOwnerDocumentFromRootContainer(rootContainerElement) {
// return rootContainerElement.nodeType === DOCUMENT_NODE ? rootContainerElement : rootContainerElement.ownerDocument;
// }




// if (event.source !== window || event.data !== messageKey) {
// return;
// }



// function containsNode(outerNode, innerNode) {
// if (!outerNode || !innerNode) {
// return false;
// } else if (outerNode === innerNode) {
// return true;
// } else if (isTextNode(outerNode)) {
// return false;
// } else if (isTextNode(innerNode)) {
// return containsNode(outerNode, innerNode.parentNode);
// } else if (outerNode.contains) {
// return outerNode.contains(innerNode);
// } else if (outerNode.compareDocumentPosition) {
// return !!(outerNode.compareDocumentPosition(innerNode) & 16);
// } else {
// return false;
// }
// }


// priorSelectionInformation.focusedElem;
