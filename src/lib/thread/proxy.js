

function getProxy(obj, proxyName='asyncProxy') {
    // const allowed = ['asyncProxy','window','document'];
    // if (!(allowed.includes(proxyName))) {
    //     console.log('proxyName',proxyName);
    //     return obj;
    // }
    return new Proxy(obj, proxyList[proxyName]);
}

const proxyList = {
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
}

const NOOP_HOOKS = {
    insertAfter() {
        console.log('insertAfter',insertAfter);
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

const NODE_HOOKS = {
    removeChild(child) {
        let result = this.removeChild.apply(this, [originalNode(child)]);
        asyncMessage({action:'removeChild',id: nodeId(this),childrenId:nodeId(child)});
        return result;
    },
    remove() {
        asyncMessage({action:'removeNode',id: nodeId(this)});
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
    setAttribute(attribute, value) {
        let result = this.setAttribute.apply(this, [attribute, value]);
        asyncMessage({action:'setAttribute',id:nodeId(this),attribute:attribute,value:value});
        return result;
    },
    removeAttribute(attribute) {
        asyncMessage({action:'removeAttribute',id:nodeId(this),attribute:attribute});
        return this.removeAttribute(attribute);
    }
};

const DOCUMENT_HOOKS = {
    // document
    getElementById(id) {
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
        asyncMessage({action:'createNode',id: nodeId(element),tag:element.tagName, textContent});
        return getProxy(element);
    },
    createDocumentFragment() {
        let fragment = this.createDocumentFragment.apply(this, []);
        return getProxy(fragment);
    },
    createTextNode(text) {
        let node = this.createTextNode.apply(this, [text]);
        asyncMessage({action:'createNode',id: nodeId(node),tag:'#text',textContent:text});
        return getProxy(node);
    }
};

const proxyGet = Object.assign(
    {},
    DOCUMENT_HOOKS,
    NODE_HOOKS,
    NOOP_HOOKS,
    {
        [ORIGINAL_KEY]() {
            return this;
        }
    }   
);


const proxySet = {
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
        asyncMessage({action:'setAttribute',id:nodeId(this),attribute:'style',value:value});
        return  this.style = value;
    },
    id(newId) {
        let result = this.id = newId;
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
        console.log('textContent', value);
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
};


let documentProxy = null;
let bodyProxy = null;

const patches = {
    insertAdjacentHTML: function() {
        this.childNodes.length = 2;
        return this;
    }
};

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

    return target[prop] || self[prop];
}