(function(){function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}return e})()({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var Node = function Node(nodeName, nodeValue) {
    this.nodeName = nodeName;
    this.nodeValue = nodeValue;
    this.parentNode = null;
    this.previousSibling = null;
    this.nextSibling = null;
    this.firstChild = null;
    this.lastChild = null;
    this._childNodes = undefined;
};

var prototypeAccessors = { childNodes: { configurable: true } };
prototypeAccessors.childNodes.get = function () {
    var children = this._childNodes;
    if (children === undefined) {
        children = this._childNodes = new ChildNodes(this);
    }
    return children;
};
Node.prototype.cloneNode = function cloneNode (deep) {
    var node = this._cloneNode();
    if (deep === true) {
        var child = this.firstChild;
        var nextChild = child;
        while (child !== null) {
            nextChild = child.nextSibling;
            node.appendChild(child.cloneNode(true));
            child = nextChild;
        }
    }
    return node;
};
Node.prototype.appendChild = function appendChild (newChild) {
    if (newChild.nodeType === 11 /* DOCUMENT_FRAGMENT_NODE */) {
        insertFragment(newChild, this, this.lastChild, null);
        return newChild;
    }
    if (newChild.parentNode) {
        newChild.parentNode.removeChild(newChild);
    }
    newChild.parentNode = this;
    var refNode = this.lastChild;
    if (refNode === null) {
        this.firstChild = newChild;
        this.lastChild = newChild;
    }
    else {
        newChild.previousSibling = refNode;
        refNode.nextSibling = newChild;
        this.lastChild = newChild;
    }
    return newChild;
};
Node.prototype.insertBefore = function insertBefore (newChild, refChild) {
    if (refChild == null) {
        return this.appendChild(newChild);
    }
    if (newChild.nodeType === 11 /* DOCUMENT_FRAGMENT_NODE */) {
        insertFragment(newChild, this, refChild.previousSibling, refChild);
        return newChild;
    }
    if (newChild.parentNode) {
        newChild.parentNode.removeChild(newChild);
    }
    newChild.parentNode = this;
    var previousSibling = refChild.previousSibling;
    if (previousSibling) {
        previousSibling.nextSibling = newChild;
        newChild.previousSibling = previousSibling;
    }
    else {
        newChild.previousSibling = null;
    }
    refChild.previousSibling = newChild;
    newChild.nextSibling = refChild;
    if (this.firstChild === refChild) {
        this.firstChild = newChild;
    }
    return newChild;
};
Node.prototype.removeChild = function removeChild (oldChild) {
    if (this.firstChild === oldChild) {
        this.firstChild = oldChild.nextSibling;
    }
    if (this.lastChild === oldChild) {
        this.lastChild = oldChild.previousSibling;
    }
    if (oldChild.previousSibling) {
        oldChild.previousSibling.nextSibling = oldChild.nextSibling;
    }
    if (oldChild.nextSibling) {
        oldChild.nextSibling.previousSibling = oldChild.previousSibling;
    }
    oldChild.parentNode = null;
    oldChild.nextSibling = null;
    oldChild.previousSibling = null;
    return oldChild;
};

Object.defineProperties( Node.prototype, prototypeAccessors );

function insertFragment(fragment, newParent, before, after) {
    if (!fragment.firstChild) {
        return;
    }
    var firstChild = fragment.firstChild;
    fragment.firstChild = fragment.lastChild = null;
    var lastChild = firstChild;
    var node = firstChild;
    firstChild.previousSibling = before;
    if (before) {
        before.nextSibling = firstChild;
    }
    else {
        newParent.firstChild = firstChild;
    }
    while (node) {
        node.parentNode = newParent;
        lastChild = node;
        node = node.nextSibling;
    }
    lastChild.nextSibling = after;
    if (after) {
        after.previousSibling = lastChild;
    }
    else {
        newParent.lastChild = lastChild;
    }
}
var ChildNodes = function ChildNodes(node) {
    this.node = node;
};
ChildNodes.prototype.item = function item (index) {
    var child = this.node.firstChild;
    for (var i = 0; child && index !== i; i++) {
        child = child.nextSibling;
    }
    return child;
};

var Element = (function (Node$$1) {
    function Element(tagName) {
        Node$$1.call(this, tagName.toUpperCase(), null);
        this.nodeType = 1 /* ELEMENT_NODE */;
        this.attributes = [];
    }

    if ( Node$$1 ) Element.__proto__ = Node$$1;
    Element.prototype = Object.create( Node$$1 && Node$$1.prototype );
    Element.prototype.constructor = Element;

    var prototypeAccessors = { tagName: { configurable: true } };
    prototypeAccessors.tagName.get = function () {
        return this.nodeName;
    };
    Element.prototype.getAttribute = function getAttribute (name) {
        var attributes = this.attributes;
        var n = name.toLowerCase();
        var attr;
        for (var i = 0, l = attributes.length; i < l; i++) {
            attr = attributes[i];
            if (attr.name === n) {
                return attr.value;
            }
        }
        return null;
    };
    Element.prototype.setAttribute = function setAttribute (name, value) {
        var attributes = this.attributes;
        var n = name.toLowerCase();
        var v;
        if (typeof value === 'string') {
            v = value;
        }
        else {
            v = '' + value;
        }
        var attr;
        for (var i = 0, l = attributes.length; i < l; i++) {
            attr = attributes[i];
            if (attr.name === n) {
                attr.value = v;
                return;
            }
        }
        attributes.push({
            name: n,
            specified: true,
            value: v,
        });
    };
    Element.prototype.removeAttribute = function removeAttribute (name) {
        var n = name.toLowerCase();
        var attributes = this.attributes;
        for (var i = 0, l = attributes.length; i < l; i++) {
            var attr = attributes[i];
            if (attr.name === n) {
                attributes.splice(i, 1);
                return;
            }
        }
    };
    Element.prototype._cloneNode = function _cloneNode () {
        var node = new Element(this.tagName);
        var attrs = node.attributes = [];
        var src = this.attributes;
        for (var i = 0; i < src.length; i++) {
            var attr = src[i];
            attrs.push({ name: attr.name, specified: attr.specified, value: attr.value });
        }
        return node;
    };

    Object.defineProperties( Element.prototype, prototypeAccessors );

    return Element;
}(Node));

var DocumentFragment = (function (Node$$1) {
    function DocumentFragment() {
        Node$$1.call(this, '#document-fragment', null);
        this.nodeType = 11 /* DOCUMENT_FRAGMENT_NODE */;
    }

    if ( Node$$1 ) DocumentFragment.__proto__ = Node$$1;
    DocumentFragment.prototype = Object.create( Node$$1 && Node$$1.prototype );
    DocumentFragment.prototype.constructor = DocumentFragment;
    DocumentFragment.prototype._cloneNode = function _cloneNode () {
        return new DocumentFragment();
    };

    return DocumentFragment;
}(Node));

var Comment = (function (Node$$1) {
    function Comment(text) {
        Node$$1.call(this, '#comment', text);
        this.nodeType = 8 /* COMMENT_NODE */;
    }

    if ( Node$$1 ) Comment.__proto__ = Node$$1;
    Comment.prototype = Object.create( Node$$1 && Node$$1.prototype );
    Comment.prototype.constructor = Comment;
    Comment.prototype._cloneNode = function _cloneNode () {
        return new Comment(this.nodeValue);
    };

    return Comment;
}(Node));

var RawHTMLSection = (function (Node$$1) {
    function RawHTMLSection(text) {
        Node$$1.call(this, '#raw-html-section', text);
        this.nodeType = -1 /* RAW */;
    }

    if ( Node$$1 ) RawHTMLSection.__proto__ = Node$$1;
    RawHTMLSection.prototype = Object.create( Node$$1 && Node$$1.prototype );
    RawHTMLSection.prototype.constructor = RawHTMLSection;
    RawHTMLSection.prototype._cloneNode = function _cloneNode () {
        return new RawHTMLSection(this.nodeValue);
    };

    return RawHTMLSection;
}(Node));

var Text = (function (Node$$1) {
    function Text(text) {
        Node$$1.call(this, '#text', text);
        this.nodeType = 3 /* TEXT_NODE */;
    }

    if ( Node$$1 ) Text.__proto__ = Node$$1;
    Text.prototype = Object.create( Node$$1 && Node$$1.prototype );
    Text.prototype.constructor = Text;
    Text.prototype._cloneNode = function _cloneNode () {
        return new Text(this.nodeValue);
    };

    return Text;
}(Node));

var Document = (function (Node$$1) {
    function Document() {
        Node$$1.call(this, '#document', null);
        this.nodeType = 9 /* DOCUMENT_NODE */;
        this.documentElement = new Element('html');
        this.head = new Element('head');
        this.body = new Element('body');
        this.documentElement.appendChild(this.head);
        this.documentElement.appendChild(this.body);
        this.appendChild(this.documentElement);
    }

    if ( Node$$1 ) Document.__proto__ = Node$$1;
    Document.prototype = Object.create( Node$$1 && Node$$1.prototype );
    Document.prototype.constructor = Document;
    Document.prototype.createElement = function createElement (tagName) {
        return new Element(tagName);
    };
    Document.prototype.createTextNode = function createTextNode (text) {
        return new Text(text);
    };
    Document.prototype.createComment = function createComment (text) {
        return new Comment(text);
    };
    Document.prototype.createRawHTMLSection = function createRawHTMLSection (text) {
        return new RawHTMLSection(text);
    };
    Document.prototype.createDocumentFragment = function createDocumentFragment () {
        return new DocumentFragment();
    };
    Document.prototype._cloneNode = function _cloneNode () {
        return new Document();
    };

    return Document;
}(Node));

exports.Node = Node;
exports.Element = Element;
exports.DocumentFragment = DocumentFragment;
exports.Document = Document;

},{}],2:[function(require,module,exports){
'use strict';

var HTMLParser = function HTMLParser(tokenize, document, voidMap) {
    this.tokenize = tokenize;
    this.document = document;
    this.voidMap = voidMap;
    this.tokenize = tokenize;
    this.document = document;
    this.voidMap = voidMap;
    this.parentStack = [];
};
HTMLParser.prototype.isVoid = function isVoid (element) {
    return this.voidMap[element.nodeName] === true;
};
HTMLParser.prototype.pushElement = function pushElement (token) {
    var el = this.document.createElement(token.tagName);
    var attributes = token.attributes;
    for (var i = 0; i < attributes.length; i++) {
        var attr = attributes[i];
        el.setAttribute(attr[0], attr[1]);
    }
    if (this.isVoid(el)) {
        return this.appendChild(el);
    }
    this.parentStack.push(el);
};
HTMLParser.prototype.popElement = function popElement (token) {
    var el = this.parentStack.pop();
    if (el.nodeName !== token.tagName.toUpperCase()) {
        throw new Error('unbalanced tag');
    }
    this.appendChild(el);
};
HTMLParser.prototype.appendText = function appendText (token) {
    this.appendChild(this.document.createTextNode(token.chars));
};
HTMLParser.prototype.appendComment = function appendComment (token) {
    this.appendChild(this.document.createComment(token.chars));
};
HTMLParser.prototype.appendChild = function appendChild (node) {
    var parentNode = this.parentStack[this.parentStack.length - 1];
    parentNode.appendChild(node);
};
HTMLParser.prototype.parse = function parse (html) {
        var this$1 = this;

    var fragment = this.document.createDocumentFragment();
    this.parentStack.push(fragment);
    var tokens = this.tokenize(html);
    for (var i = 0, l = tokens.length; i < l; i++) {
        var token = tokens[i];
        switch (token.type) {
            case 'StartTag':
                this$1.pushElement(token);
                break;
            case 'EndTag':
                this$1.popElement(token);
                break;
            case 'Chars':
                this$1.appendText(token);
                break;
            case 'Comment':
                this$1.appendComment(token);
                break;
        }
    }
    return this.parentStack.pop();
};

module.exports = HTMLParser;

},{}],3:[function(require,module,exports){
'use strict';

var ESC = {
    '"': '&quot;',
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
};
function matcher(char) {
    return ESC[char];
}
var HTMLSerializer = function HTMLSerializer(voidMap) {
    this.voidMap = voidMap;
};
HTMLSerializer.prototype.openTag = function openTag (element) {
    return '<' + element.nodeName.toLowerCase() + this.attributes(element.attributes) + '>';
};
HTMLSerializer.prototype.closeTag = function closeTag (element) {
    return '</' + element.nodeName.toLowerCase() + '>';
};
HTMLSerializer.prototype.isVoid = function isVoid (element) {
    return this.voidMap[element.nodeName] === true;
};
HTMLSerializer.prototype.attributes = function attributes (attributes$1) {
        var this$1 = this;

    var buffer = '';
    for (var i = 0, l = attributes$1.length; i < l; i++) {
        buffer += this$1.attr(attributes$1[i]);
    }
    return buffer;
};
HTMLSerializer.prototype.escapeAttrValue = function escapeAttrValue (attrValue) {
    if (attrValue.indexOf('&') > -1 || attrValue.indexOf('"') > -1) {
        return attrValue.replace(/[&"]/g, matcher);
    }
    return attrValue;
};
HTMLSerializer.prototype.attr = function attr (attr$1) {
    if (!attr$1.specified) {
        return '';
    }
    if (attr$1.value) {
        return ' ' + attr$1.name + '="' + this.escapeAttrValue(attr$1.value) + '"';
    }
    return ' ' + attr$1.name;
};
HTMLSerializer.prototype.escapeText = function escapeText (textNodeValue) {
    if (textNodeValue.indexOf('>') > -1 ||
        textNodeValue.indexOf('<') > -1 ||
        textNodeValue.indexOf('&') > -1) {
        return textNodeValue.replace(/[&<>]/g, matcher);
    }
    return textNodeValue;
};
HTMLSerializer.prototype.text = function text (text$1) {
    return this.escapeText(text$1.nodeValue);
};
HTMLSerializer.prototype.rawHTMLSection = function rawHTMLSection (text) {
    return text.nodeValue;
};
HTMLSerializer.prototype.comment = function comment (comment$1) {
    return '<!--' + comment$1.nodeValue + '-->';
};
HTMLSerializer.prototype.serializeChildren = function serializeChildren (node) {
        var this$1 = this;

    var buffer = '';
    var next = node.firstChild;
    while (next !== null) {
        buffer += this$1.serialize(next);
        next = next.nextSibling;
    }
    return buffer;
};
HTMLSerializer.prototype.serialize = function serialize (node) {
    var buffer = '';
    // open
    switch (node.nodeType) {
        case 1:
            buffer += this.openTag(node);
            break;
        case 3:
            buffer += this.text(node);
            break;
        case -1:
            buffer += this.rawHTMLSection(node);
            break;
        case 8:
            buffer += this.comment(node);
            break;
        default:
            break;
    }
    buffer += this.serializeChildren(node);
    if (node.nodeType === 1 && !this.isVoid(node)) {
        buffer += this.closeTag(node);
    }
    return buffer;
};

module.exports = HTMLSerializer;

},{}],4:[function(require,module,exports){
'use strict';

var index = {
    AREA: true,
    BASE: true,
    BR: true,
    COL: true,
    COMMAND: true,
    EMBED: true,
    HR: true,
    IMG: true,
    INPUT: true,
    KEYGEN: true,
    LINK: true,
    META: true,
    PARAM: true,
    SOURCE: true,
    TRACK: true,
    WBR: true,
};

module.exports = index;

},{}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var document = require('@simple-dom/document');
var parser = _interopDefault(require('@simple-dom/parser'));
var serializer = _interopDefault(require('@simple-dom/serializer'));
var voidMap = _interopDefault(require('@simple-dom/void-map'));



exports.Node = document.Node;
exports.Element = document.Element;
exports.DocumentFragment = document.DocumentFragment;
exports.Document = document.Document;
exports.HTMLParser = parser;
exports.HTMLSerializer = serializer;
exports.voidMap = voidMap;

},{"@simple-dom/document":1,"@simple-dom/parser":2,"@simple-dom/serializer":3,"@simple-dom/void-map":4}],6:[function(require,module,exports){
self.simpleDom = require('simple-dom');
},{"simple-dom":5}]},{},[6]);
