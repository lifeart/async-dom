function initDominoImplementation() {
    const implementation = getDOMImplementation();
    asyncMessage = transport.sendMessage;
    Element = implementation.impl.Element; // etc
    window = getProxy(implementation.createWindow('', 'http://localhost:8080/'),'window');
    document = window.document;
    window.screen = {
        width: 1280,
        height: 720
    };
}

function createInitialDomStructure() {
    document.body.id = 'async-body';
    window.chrome = {};
    let node = document.createElement('div');
    node.id = 'app';
    document.body.appendChild(node);

    // let secondNode = document.createElement('div');
    // secondNode.innerHTML = 'foo-bar';

    // node.insertBefore(secondNode, null);


    // let firdNode = document.createElement('div');
   
    // firdNode.innerHTML = 'lool';

   


    // node.insertBefore(firdNode,secondNode);
}
