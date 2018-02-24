function importApp(appName='glimmer') {
    require(`/apps/${appName}.js`)
}

function getDOMImplementation() {
    require('../dom/domino-async-bundle.js');
    // require('../dom/pseudo-dom.js');
    return self.domino;
}

function getTransport() {
    require('../transport/ww-legacy.js');
    return {
        sendMessage: self.asyncSendMessage,
        receiveMessage: self.onmessage
    };
}

function originalNode(node) {
    if (!node) {
        return null;
    }
    return node[ORIGINAL_KEY] || node;
}

function nodeId(maybeElement,debug) {
    let element = maybeElement[ORIGINAL_KEY] || maybeElement;
    if (!_cache.has(element)) {
        nodeCounter++;
        // console.log('element.tagName',element.tagName);
        if (element.tagName === 'BODY') {
            _cache.set(element, `async-body`);
        } else {
            if (element.id === 'app') {
                _cache.set(element, `app`);
            } else {
                _cache.set(element, `n-${nodeCounter}`);
            }
         
        }
     
    }
    return _cache.get(element);
}