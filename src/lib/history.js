class History {
    constructor(parent = () => {}) {
        this.currentStateIndex =  0;
        this.currentState = null;
        this.states = [];
        this.parent = parent;
    }
    get length() {
        return this.states.length;
    }
    _sync(method, ...args) {
        this.parent(method, args);
    }
    back() {
        this.go(-1);
    }
    forward() {
        this.go(1);
    }
    go(index = 0) {

        if (index === 0) {
            return;
        }

        const newIndex = this.currentStateIndex + index;

        if (!this.states[newIndex]) {
            return;
        }

        this.currentState = this.states[newIndex];
        this.currentStateIndex = newIndex;

        this._sync('go', index);
    }
    pushState(state, title, url) {
        this.states.push([state, title, url]);
        this.go(1);
    }
    replaceState(state, title, url) {
        this.states[this.currentStateIndex][0] = state;
        this.states[this.currentStateIndex][1] = title;
        this.states[this.currentStateIndex][2] = url;
        this._sync('replaceState', state, title, url);
    }
}