const require = importScripts;

let asyncMessage = null; 

let nodeCounter = 0;
let _cache = new Map();

const ORIGINAL_KEY = '__ORIGINAL__';

const nodeId = function(maybeElement,debug) {
    let element = maybeElement[ORIGINAL_KEY] || maybeElement;
    if (!_cache.has(element)) {
        nodeCounter++;
        _cache.set(element, `n-${nodeCounter}`);
    }
    return _cache.get(element);
}

let documentProxy = null;
let bodyProxy = null;

const bodySync = {
    get: {
        [ORIGINAL_KEY]() {
            return this;
        },
        insertBefore(newElement, referenceElement) {
            let result = this.insertBefore.apply(this, [newElement, referenceElement]);
            asyncMessage({
                action:'insertBefore',
                id: nodeId(this,'insertBefore:1'),
                newId: nodeId(newElement,'insertBefore:2'), 
                refId: referenceElement?nodeId(referenceElement,'insertBefore:3'):null
            });
            return result;
        },
        appendChild(element) {
            let result = this.appendChild.apply(this, [element]);
            asyncMessage({action:'appendChild',id: nodeId(this,'appendChild:1'),childrenId:nodeId(element,'appendChild:2')});
            return result;
        }
    }
};

var realBodyProxy = {
    get(target, prop) {
        if (bodySync.get[prop]) {
            if (prop === ORIGINAL_KEY) {
                return bodySync.get[prop].bind(target)();
            }
            return bodySync.get[prop].bind(target);
        }
        return target[prop];
    },
    set(target, prop, value) {
        target[prop] = value;
        return true;
    }
}

var realDocumentProxy = {
    get(target, prop) {
        if (prop === 'body') {
            if (!bodyProxy) {
                bodyProxy =  new Proxy(target[prop], realBodyProxy);
            }
            return bodyProxy; 
        }
        // console.log('document',prop);
        return target[prop];
    },
    set(target, prop, value) {
        target[prop] = value;
        return true;
    }
}

var realWindowProxy = {
    get(target, prop) {
      if (prop === 'document') {
        if (!documentProxy) {
            documentProxy =  new Proxy(target[prop], realDocumentProxy);
        }
        return documentProxy; 
      }
      return target[prop] || self[prop];
    },
    set(target, prop, value) {
      console.log('set',target, prop, value);
      target[prop] = value;
      return true;
    }
}

function initImplementation(implementation, transport, mainContext) {
    Element = implementation.impl.Element; // etc
    asyncMessage = transport.sendMessage;
    window = new Proxy(implementation.createWindow('', 'http://localhost:8080/'),realWindowProxy);
    console.log('window.document',window.document);
    document = window.document;
    console.log('ready');
    patchDOM(transport);
}

function importApp(appName='glimmer') {
    require(`/apps/glimmer.js`)
}

function createInitialDomStructure() {
    window.chrome = {};
    let node = document.createElement('div');
    // console.log(node);
    // console.log(document.body);
    // console.log('document.body.appendChild',document.body.appendChild);
    node.id = 'app';
    document.body.appendChild(node);
}

require('globals.js');

function getDOMImplementation() {
    require('../dom/domino-async-bundle.js');
    return self.domino;
}

function getTransport() {
    require('../transport/ww-legacy.js');
    return {
        sendMessage: self.asyncSendMessage,
        receiveMessage: self.onmessage
    };
}


function patchDOM(transport) {


    nodeCounter++;

   

    console.log('patchDOM.transport', transport);

    const noop = function() {};

    const patches = {
        insertAdjacentHTML: function() {
            this.childNodes.length = 2;
            return this;
        }
    };

    const sync = {
        'get': {
            [ORIGINAL_KEY]() {
                return this;
            },
            insertBefore(newElement, referenceElement) {
                let result = this.insertBefore.apply(this, [newElement, referenceElement]);
                asyncMessage({
                    action:'insertBefore',
                    id: nodeId(this,'insertBefore:1'),
                    newId: nodeId(newElement,'insertBefore:2'), 
                    refId: referenceElement?nodeId(referenceElement,'insertBefore:3'):null
                });
                return result;
            },
            appendChild(element) {
                let result = this.appendChild.apply(this, [element]);
                asyncMessage({action:'appendChild',id: nodeId(this,'appendChild:1'),childrenId:nodeId(element,'appendChild:2')});
                return result;
            },
            setAttribute(attribute, value) {
                let result = this.setAttribute.apply(this, [attribute, value]);
                asyncMessage({action:'setAttribute',id:nodeId(this),attribute:attribute,value:value});
                return result;
            }
        },
        'set': {
            id(newId) {
                let result = this.id = newId;
                asyncMessage({action:'setAttribute',id:nodeId(this),attribute:'id',value:newId});
                return result;
            }
        }
    };

    const windowProxy = {
        get(target, prop) {
            if (patches[prop]) {
                return patches[prop].bind(target);
            }
            if (sync.get[prop]) {
                if (prop === ORIGINAL_KEY) {
                    return sync.get[prop].bind(target)();
                }
                return sync.get[prop].bind(target);
            }
          return target[prop];
        },
        set(target, prop, value) {
            if (sync.set[prop]) {
                return sync.set[prop].apply(target,[value]);
            }
            target[prop] = value;
            return true;
        }
    }

    const asyncMessage = transport.sendMessage;

    const originalCreateElement = document.createElement;
    const originalCreateDocumentFragment = document.createDocumentFragment;
    const originalCreateTextNode = document.createTextNode;

    document.createElement = function(tagName, content) {
        let element = originalCreateElement.apply(document, [tagName, content]);
        let textContent = content ? content : '';
        asyncMessage({action:'createNode',id: nodeId(element,'createElement'),tag:element.tagName, textContent});
        return new Proxy(element, windowProxy);
    };
    document.createTextNode = function(text) {
        let node = originalCreateTextNode.apply(document, args);
        asyncMessage({action:'createNode',id: nodeId(node),tag:'#text',textContent:text});
        return new Proxy(fragment, windowProxy);
    }
    document.createDocumentFragment = function() {
        let fragment = originalCreateDocumentFragment.apply(document, []);
        return new Proxy(fragment, windowProxy);
    };
    console.log('domPateched');
}

const transport = getTransport();
const implementation = getDOMImplementation();
initImplementation(implementation, transport, self);
createInitialDomStructure();
importApp();