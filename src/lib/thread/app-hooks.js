let APP_NODE_HOOKS = {
    'ember': {
        cloneNode() {
            return {
                _insertOrReplace() {
                            
                },
                cloneNode() {
                    return {
                        lastChild: {
                            checked: true
                        },
                        _insertOrReplace() {
    
                        }
                    }
                }
            };
        }
    }
};