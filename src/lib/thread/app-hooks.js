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
					};
				}
			};
		}
	}
};

if (typeof module === 'undefined') {
	module = {
		exports: {}
	};	
}

module.exports.APP_NODE_HOOKS = APP_NODE_HOOKS;