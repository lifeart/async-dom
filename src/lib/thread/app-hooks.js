let APP_NODE_HOOKS = {
	'ember': {
		ownerDocument() {
			console.log('ownerDocument',arguments);
		},
		querySelector(selector) {
			//		.querySelector('meta[name="'
			if (selector.startsWith('meta[name=')) {
				return {
					getAttribute() {
						return encodeURIComponent(JSON.stringify({
							'modulePrefix':'ember-api-docs',
							'environment':'production',
							'rootURL':'/',
							'routerRootURL':'/api/',
							'locationType':'auto',
							'API_HOST':'https://ember-api-docs.global.ssl.fastly.net',
							'gaTrackingId':'UA-27675533-1',
							'EmberENV':{
								'EXTEND_PROTOTYPES':false,
								'FEATURES':{}
							},
							'APP':{
								'scrollContainerSelector':'body, html',
								'cdnUrl':'https://ember-api-docs-frontend.global.ssl.fastly.net',
								'name':'ember-api-docs',
								'version':'0.1.0'
							},
							'fastboot':{
								'hostWhitelist':[{},{}]
							},
							'ember-algolia':{
								'algoliaId':'Y1OMR4C7MF',
								'algoliaKey':'c35425b69b31be1bb4786f0a72146306'
							},
							'contentSecurityPolicy':{
								'default-src':'\'self\' *.fastly.net','connect-src':'\'self\' *.algolia.net *.algolianet.com *.fastly.net',
								'script-src':'\'self\' unsafe-inline use.typekit.net \'sha256-LEXBvGgYbhXJLZxA/dKnIx07iQsbEcS9SDWq01pWVAk=\' *.fastly.net https://www.google-analytics.com',
								'font-src':'\'self\' data://* https://fonts.gstatic.com  *.fastly.net',
								'img-src':'\'self\' data://*  *.fastly.net https://www.google-analytics.com',
								'style-src':'\'self\' \'unsafe-inline\' https://fonts.googleapis.com  *.fastly.net',
								'media-src':['\'self\'']
							},
							'contentSecurityPolicyHeader':'Content-Security-Policy-Report-Only',
							'emberAnchor':{
								'anchorQueryParam':'anchor'
							},
							'exportApplicationGlobal':false
						}));
					}
				};
			} else {
				return this.querySelector(selector);
			}
			console.log('querySelector', arguments);
		},
		cloneNode() {
			return {
				style: {
					// ember hook
				},
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