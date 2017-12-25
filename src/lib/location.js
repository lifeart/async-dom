class Location {
    constructor(url, parent = () => {}) {
        this.url = new URL(url);
        this.parent = parent;
        Object.keys(this.url).forEach((key)=>{
            Object.defineProperty(this, key, {
                get() {
                    return this.url.key;
                }
            })
        });
    }
    _sync(methodName, ...args) {
        this.parent(methodName, args);
    }
    assign(url) {
        this._sync('assign', url);
    }
    reload(forcedReload) {
        this._sync('reload', forcedReload);
    }
    replace(url) {
        this._sync('replace', url);
    }
}