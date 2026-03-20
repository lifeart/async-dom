var dt=Object.defineProperty;var pt=(n,e,t)=>e in n?dt(n,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):n[e]=t;var c=(n,e,t)=>pt(n,typeof e!="symbol"?e+"":e,t);(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))s(o);new MutationObserver(o=>{for(const a of o)if(a.type==="childList")for(const b of a.addedNodes)b.tagName==="LINK"&&b.rel==="modulepreload"&&s(b)}).observe(document,{childList:!0,subtree:!0});function t(o){const a={};return o.integrity&&(a.integrity=o.integrity),o.referrerPolicy&&(a.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?a.credentials="include":o.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function s(o){if(o.ep)return;o.ep=!0;const a=t(o);fetch(o.href,a)}})();const ue={MISSING_NODE:"ASYNC_DOM_MISSING_NODE",BLOCKED_PROPERTY:"ASYNC_DOM_BLOCKED_PROPERTY"},ht={warning(n){console.warn(`[async-dom] ${n.code}: ${n.message}`,n.context)},mutation(n){console.log(`[async-dom:${n.side}] mutation:${n.action}`,n.mutation)},event(n){console.log(`[async-dom:${n.side}] event:${n.phase} ${n.eventType} listenerId=${n.listenerId}`)},syncRead(n){console.log(`[async-dom] sync:${n.queryType} node=${n.nodeId} ${n.result} (${n.latencyMs.toFixed(1)}ms)`)},scheduler(n){console.log(`[async-dom] frame:${n.frameId} actions=${n.actionsProcessed} time=${n.frameTimeMs.toFixed(1)}ms queue=${n.queueDepth}`)}};class ut{constructor(){c(this,"mutationsAdded",0);c(this,"mutationsCoalesced",0);c(this,"mutationsFlushed",0);c(this,"mutationsApplied",0);c(this,"eventsForwarded",0);c(this,"eventsDispatched",0);c(this,"syncReadRequests",0);c(this,"syncReadTimeouts",0)}snapshot(){return{mutationsAdded:this.mutationsAdded,mutationsCoalesced:this.mutationsCoalesced,mutationsFlushed:this.mutationsFlushed,mutationsApplied:this.mutationsApplied,eventsForwarded:this.eventsForwarded,eventsDispatched:this.eventsDispatched,syncReadRequests:this.syncReadRequests,syncReadTimeouts:this.syncReadTimeouts}}reset(){this.mutationsAdded=0,this.mutationsCoalesced=0,this.mutationsFlushed=0,this.mutationsApplied=0,this.eventsForwarded=0,this.eventsDispatched=0,this.syncReadRequests=0,this.syncReadTimeouts=0}}function mt(n){if(!n)return{onMutation:null,onEvent:null,onSyncRead:null,onScheduler:null,onWarning:null};const e={...ht,...n.logger};return{onMutation:n.logMutations?t=>e.mutation(t):null,onEvent:n.logEvents?t=>e.event(t):null,onSyncRead:n.logSyncReads?t=>e.syncRead(t):null,onScheduler:n.logScheduler?t=>e.scheduler(t):null,onWarning:n.logWarnings?t=>e.warning(t):null}}const ft=1,gt=2,bt=3,tt=4;function nt(n){return n.type==="mutation"}function yt(n){return n.type==="event"}function Oe(n){return!nt(n)&&!yt(n)}class qe{constructor(){c(this,"cache",new Map)}get(e){return e===tt?document:this.cache.get(e)??null}set(e,t){this.cache.set(e,t)}delete(e){this.cache.delete(e)}clear(){this.cache.clear()}has(e){return this.cache.has(e)}}const vt=16,He=1500,je=3e3,xt=500,wt=60,Ct=10,Tt=1e3,Et=3e4,St=30;class Nt{constructor(e={}){c(this,"queue",[]);c(this,"actionTimes",new Map);c(this,"frameId",0);c(this,"running",!1);c(this,"rafId",0);c(this,"uidCounter",0);c(this,"timePerLastFrame",0);c(this,"totalActionsLastFrame",0);c(this,"isScrolling",!1);c(this,"scrollTimer",null);c(this,"scrollAbort",null);c(this,"viewportHeight",0);c(this,"viewportWidth",0);c(this,"boundingRectCache",new Map);c(this,"boundingRectCacheFrame",new Map);c(this,"frameBudgetMs");c(this,"enableViewportCulling");c(this,"enablePrioritySkipping");c(this,"applier",null);c(this,"appCount",0);c(this,"appBudgets",new Map);c(this,"lastTickTime",0);c(this,"healthCheckTimer",null);c(this,"queueOverflowWarned",!1);c(this,"lastEnqueueTime",0);c(this,"frameLog",[]);this.frameBudgetMs=e.frameBudgetMs??vt,this.enableViewportCulling=e.enableViewportCulling??!0,this.enablePrioritySkipping=e.enablePrioritySkipping??!0}setApplier(e){this.applier=e}setAppCount(e){this.appCount=e}enqueue(e,t,s="normal",o){this.lastEnqueueTime=performance.now();for(const a of e)this.uidCounter++,this.queue.push({mutation:a,priority:s,uid:this.uidCounter,appId:t,batchUid:o});this.queue.length>1e4&&!this.queueOverflowWarned&&(this.queueOverflowWarned=!0,console.warn(`[async-dom] Scheduler queue overflow: ${this.queue.length} pending mutations. Possible causes: tab hidden, applier not set, or mutations arriving faster than processing.`)),this.queue.length<=1e4&&(this.queueOverflowWarned=!1)}start(){this.running||(this.running=!0,this.lastTickTime=0,this.setupScrollListener(),this.scheduleFrame(),this.healthCheckTimer=setTimeout(()=>{this.running&&this.lastTickTime===0&&console.warn(`[async-dom] Scheduler started but tick() has not fired after 1 second. This usually means the tab is hidden (rAF does not fire in background tabs). Queue has ${this.queue.length} pending mutations.`)},1e3),console.debug("[async-dom] Scheduler started"))}scheduleFrame(){this.running&&(typeof document<"u"&&document.hidden?setTimeout(()=>this.tick(performance.now()),this.frameBudgetMs):this.rafId=requestAnimationFrame(e=>this.tick(e)))}stop(){this.running=!1,this.healthCheckTimer&&(clearTimeout(this.healthCheckTimer),this.healthCheckTimer=null),this.rafId&&(cancelAnimationFrame(this.rafId),this.rafId=0),this.scrollAbort&&(this.scrollAbort.abort(),this.scrollAbort=null),this.clearViewportCache()}clearViewportCache(){this.boundingRectCache.clear(),this.boundingRectCacheFrame.clear()}flush(){const e=this.applier;if(e){this.queue.sort(Xe);for(const t of this.queue)e(t.mutation,t.appId,t.batchUid);this.queue.length=0}}get pendingCount(){return this.queue.length}getStats(){return{pending:this.queue.length,frameId:this.frameId,lastFrameTimeMs:this.timePerLastFrame,lastFrameActions:this.totalActionsLastFrame,isRunning:this.running,lastTickTime:this.lastTickTime,enqueueToApplyMs:this.lastTickTime>0&&this.lastEnqueueTime>0?Math.max(0,this.lastTickTime-this.lastEnqueueTime):0}}getFrameLog(){return this.frameLog.slice()}tick(e){if(!this.running)return;this.lastTickTime=performance.now();const t=performance.now();this.frameId++,this.calcViewportSize(),this.queue.sort(Xe);const s=this.applier;if(!s){this.scheduleNext(t);return}let o=0;const a=this.getActionsForFrame(),b=[],m=new Map;this.appCount>1&&this.appBudgets.clear();let _=0;for(;_<this.queue.length&&o<a;){const K=performance.now()-t;if(this.queue.length<je&&K>=this.frameBudgetMs)break;const B=this.queue[_];if(_++,this.shouldSkip(B))continue;if(this.appCount>1){const G=this.appBudgets.get(B.appId)??0,ae=Math.ceil(a/this.appCount);if(G>=ae){b.push(B);continue}this.appBudgets.set(B.appId,G+1)}const ee=performance.now();s(B.mutation,B.appId,B.batchUid);const X=performance.now()-ee;this.recordTiming(B.mutation.action,X),m.set(B.mutation.action,(m.get(B.mutation.action)??0)+X),o++}_===this.queue.length?this.queue.length=0:_>0&&(this.queue=this.queue.slice(_)),b.length>0&&(this.queue=b.concat(this.queue));const F=performance.now()-t;o>0&&(this.timePerLastFrame=F,this.totalActionsLastFrame=o,this.frameLog.push({frameId:this.frameId,totalMs:F,actionCount:o,timingBreakdown:m}),this.frameLog.length>St&&this.frameLog.shift()),this.scheduleNext(t)}scheduleNext(e){const t=performance.now()-e;t+1>=this.frameBudgetMs?this.scheduleFrame():setTimeout(()=>{this.scheduleFrame()},this.frameBudgetMs-t)}getActionsForFrame(){const e=this.queue.length;if(e>25e3)return e;if(e>=je)return xt;if(e>He)return He;const t=this.getAvgActionTime();return t>0?Math.max(1,Math.floor(this.frameBudgetMs*3/t)):2e3}shouldSkip(e){if(!this.enablePrioritySkipping)return!1;const t=e.mutation;return"optional"in t&&t.optional?this.isScrolling||this.queue.length>He/2||this.timePerLastFrame>this.frameBudgetMs+.2?!0:(this.enableViewportCulling&&t.action,!1):!1}recordTiming(e,t){t>0&&this.actionTimes.set(e,t+.02)}getAvgActionTime(){return this.totalActionsLastFrame===0?0:this.timePerLastFrame/this.totalActionsLastFrame}calcViewportSize(){this.viewportHeight=window.innerHeight||document.documentElement.clientHeight,this.viewportWidth=window.innerWidth||document.documentElement.clientWidth}isInViewport(e){const t=e.id;if(!t)return!0;const s=this.boundingRectCacheFrame.get(t);if(s!==void 0&&s+wt>this.frameId)return this.boundingRectCache.get(t)??!0;const o=e.getBoundingClientRect(),a=o.top>=0&&o.left>=0&&o.bottom<=this.viewportHeight&&o.right<=this.viewportWidth;return this.boundingRectCache.set(t,a),this.boundingRectCacheFrame.set(t,this.frameId),a}setupScrollListener(){this.scrollAbort&&this.scrollAbort.abort(),this.scrollAbort=new AbortController,window.addEventListener("scroll",()=>{this.isScrolling=!0,this.scrollTimer!==null&&clearTimeout(this.scrollTimer),this.scrollTimer=setTimeout(()=>{this.isScrolling=!1},66)},{passive:!0,signal:this.scrollAbort.signal})}}function Xe(n,e){const t={high:0,normal:1,low:2},s=t[n.priority],o=t[e.priority];if(s!==o)return s-o;const a="optional"in n.mutation&&n.mutation.optional?1:0,b="optional"in e.mutation&&e.mutation.optional?1:0;return a!==b?a-b:n.uid-e.uid}const Fe=16,Pe=4096,kt=1,At=2;var ne=(n=>(n[n.BoundingRect=0]="BoundingRect",n[n.ComputedStyle=1]="ComputedStyle",n[n.NodeProperty=2]="NodeProperty",n[n.WindowProperty=3]="WindowProperty",n))(ne||{});class Mt{constructor(e){c(this,"signal");c(this,"meta");c(this,"requestRegion");c(this,"responseRegion");c(this,"encoder",new TextEncoder);c(this,"decoder",new TextDecoder);c(this,"polling",!1);c(this,"pollChannel",null);this.signal=new Int32Array(e,0,4),this.meta=this.signal,this.requestRegion=new Uint8Array(e,Fe,Pe),this.responseRegion=new Uint8Array(e,Fe+Pe,e.byteLength-Fe-Pe)}poll(){if(Atomics.load(this.signal,0)!==kt)return null;const t=Atomics.load(this.meta,1),s=Atomics.load(this.meta,2),o=this.requestRegion.slice(0,s),a=this.decoder.decode(o);return{queryType:t,data:a}}respond(e){const t=JSON.stringify(e),s=this.encoder.encode(t);this.responseRegion.set(s),Atomics.store(this.meta,3,s.byteLength),Atomics.store(this.signal,0,At),Atomics.notify(this.signal,0)}startPolling(e){if(!this.polling)if(this.polling=!0,typeof MessageChannel<"u"){this.pollChannel=new MessageChannel;let t=0;const s=()=>{var a,b;if(!this.polling)return;const o=this.poll();if(o){t=0;const m=e(o);this.respond(m),(a=this.pollChannel)==null||a.port2.postMessage(null)}else if(t++,t<=2)(b=this.pollChannel)==null||b.port2.postMessage(null);else{const m=Math.min(1<<t-3,16);setTimeout(()=>{var _;this.polling&&((_=this.pollChannel)==null||_.port2.postMessage(null))},m)}};this.pollChannel.port1.onmessage=s,this.pollChannel.port2.postMessage(null)}else{const t=setInterval(()=>{if(!this.polling){clearInterval(t);return}const s=this.poll();if(s){const o=e(s);this.respond(o)}},4)}}stopPolling(){this.polling=!1,this.pollChannel&&(this.pollChannel.port1.close(),this.pollChannel.port2.close(),this.pollChannel=null)}}const Lt=200,_t=200,Rt=200,$t=200,Z=[],oe=[],ce=[],de=[];let se=0,ve=null,pe=!1;function Dt(n){pe||(Z.push(n),Z.length>Lt&&Z.shift())}function It(n){pe||(ce.push(n),ce.length>Rt&&ce.shift())}function Ot(n){pe||(de.push(n),de.length>$t&&de.shift())}function Qe(n){oe.push(n),oe.length>_t&&oe.shift(),se++,ve==null||ve()}const Ht=`
:host {
  all: initial;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  color: #d4d4d4;
  line-height: 1.4;
}

*, *::before, *::after {
  box-sizing: border-box;
}

.panel {
  position: fixed;
  bottom: 8px;
  right: 8px;
  z-index: 2147483647;
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  width: 450px;
  height: 400px;
  resize: both;
  min-width: 300px;
  min-height: 200px;
  transition: width 0.15s, height 0.15s;
}

.panel.collapsed {
  width: auto !important;
  height: auto !important;
  min-width: 0;
  min-height: 0;
  resize: none;
  border-radius: 4px;
}

.toggle-tab {
  display: none;
  padding: 4px 12px;
  cursor: pointer;
  background: #2d2d2d;
  color: #d4d4d4;
  border: none;
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
  user-select: none;
}

.panel.collapsed .toggle-tab {
  display: block;
}

.panel.collapsed .app-bar,
.panel.collapsed .tab-bar,
.panel.collapsed .tab-content,
.panel.collapsed .header-bar {
  display: none;
}

.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  height: 28px;
  background: #2d2d2d;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.header-title {
  font-size: 11px;
  font-weight: 600;
  color: #cccccc;
}

.header-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.header-btn {
  background: none;
  border: none;
  color: #808080;
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
  font-family: inherit;
}
.header-btn:hover { color: #d4d4d4; }

/* ---- App bar (multi-app) ---- */

.app-bar {
  display: none;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
  padding: 0 4px;
  gap: 2px;
  align-items: center;
  height: 24px;
  overflow-x: auto;
}
.app-bar.visible { display: flex; }

.app-btn {
  padding: 2px 8px;
  background: none;
  border: 1px solid transparent;
  border-radius: 3px;
  color: #808080;
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  white-space: nowrap;
}
.app-btn:hover { color: #cccccc; }
.app-btn.active {
  color: #d4d4d4;
  background: #37373d;
  border-color: #007acc;
}

.app-label {
  color: #555;
  font-size: 10px;
  margin-right: 4px;
  flex-shrink: 0;
}

/* ---- Tab bar ---- */

.tab-bar {
  display: flex;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.tab-btn {
  padding: 4px 12px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #808080;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
}
.tab-btn:hover { color: #cccccc; }
.tab-btn.active {
  color: #d4d4d4;
  border-bottom-color: #007acc;
}

.tab-badge {
  display: inline-block;
  background: #f44747;
  color: #fff;
  font-size: 9px;
  padding: 0 4px;
  border-radius: 8px;
  margin-left: 4px;
  min-width: 14px;
  text-align: center;
  vertical-align: middle;
}

.tab-content {
  flex: 1;
  overflow: auto;
  padding: 6px 8px;
  display: none;
}
.tab-content.active { display: block; }

/* ---- Tree tab ---- */

.tree-refresh-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid #2d2d2d;
  margin-bottom: 4px;
}

.tree-refresh-btn {
  background: #3c3c3c;
  border: 1px solid #555;
  color: #d4d4d4;
  padding: 2px 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  border-radius: 3px;
}
.tree-refresh-btn:hover { background: #505050; }

.tree-status {
  color: #555;
  font-size: 10px;
}

.tree-node { padding-left: 14px; }
.tree-line {
  display: flex;
  align-items: baseline;
  gap: 3px;
  padding: 1px 0;
  cursor: pointer;
  white-space: nowrap;
}
.tree-line:hover { background: #2a2d2e; }

.tree-toggle {
  width: 12px;
  text-align: center;
  color: #808080;
  flex-shrink: 0;
  font-size: 9px;
}

.tree-tag { color: #569cd6; }
.tree-attr-name { color: #9cdcfe; }
.tree-attr-value { color: #ce9178; }
.tree-text-node { color: #6a9955; font-style: italic; }
.tree-comment { color: #6a9955; font-style: italic; }
.tree-nodeid { color: #555; font-size: 10px; margin-left: 4px; }

.tree-children { display: none; }
.tree-node.expanded > .tree-children { display: block; }

.tree-empty { color: #808080; padding: 16px; text-align: center; }

/* ---- Performance tab ---- */

.perf-section-title {
  color: #007acc;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 0 3px;
  border-bottom: 1px solid #2d2d2d;
  margin-bottom: 2px;
}
.perf-section-title:first-child { padding-top: 0; }

.perf-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  border-bottom: 1px solid #2d2d2d;
}
.perf-label { color: #808080; }
.perf-value { color: #d4d4d4; font-weight: 600; }
.perf-value.red { color: #f44747; }
.perf-value.yellow { color: #d7ba7d; }
.perf-value.green { color: #4ec9b0; }

.perf-sparkline {
  color: #555;
  font-size: 10px;
  letter-spacing: 1px;
}

/* ---- Log tab ---- */

.log-toolbar {
  display: flex;
  gap: 6px;
  align-items: center;
  padding-bottom: 4px;
  border-bottom: 1px solid #2d2d2d;
  margin-bottom: 4px;
}

.log-filter {
  flex: 1;
  background: #3c3c3c;
  border: 1px solid #555;
  color: #d4d4d4;
  padding: 2px 6px;
  font-family: inherit;
  font-size: 11px;
  border-radius: 3px;
  outline: none;
}
.log-filter:focus { border-color: #007acc; }

.log-btn {
  background: #3c3c3c;
  border: 1px solid #555;
  color: #d4d4d4;
  padding: 2px 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  border-radius: 3px;
  white-space: nowrap;
}
.log-btn:hover { background: #505050; }
.log-btn.active { background: #007acc; border-color: #007acc; }

.log-count {
  color: #555;
  font-size: 10px;
  flex-shrink: 0;
}

.log-list {
  overflow-y: auto;
  max-height: calc(100% - 32px);
}

.log-entry {
  display: flex;
  gap: 6px;
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 11px;
}
.log-time { color: #555; flex-shrink: 0; width: 80px; }
.log-action { color: #569cd6; flex-shrink: 0; width: 120px; overflow: hidden; text-overflow: ellipsis; }
.log-detail { color: #808080; overflow: hidden; text-overflow: ellipsis; }

.log-empty { color: #808080; padding: 16px; text-align: center; }

/* ---- Warnings tab ---- */

.warn-entry {
  padding: 4px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 11px;
}
.warn-time { color: #555; margin-right: 6px; }
.warn-code {
  font-weight: 600;
  margin-right: 6px;
}
.warn-code.ASYNC_DOM_MISSING_NODE { color: #f44747; }
.warn-code.ASYNC_DOM_SYNC_TIMEOUT { color: #f44747; }
.warn-code.ASYNC_DOM_LISTENER_NOT_FOUND { color: #d7ba7d; }
.warn-code.ASYNC_DOM_EVENT_ATTACH_FAILED { color: #d7ba7d; }
.warn-code.ASYNC_DOM_TRANSPORT_NOT_OPEN { color: #d7ba7d; }
.warn-code.ASYNC_DOM_BLOCKED_PROPERTY { color: #d7ba7d; }

.warn-msg { color: #d4d4d4; }
.warn-stack {
  margin: 4px 0 0 0; padding: 8px; background: #1a1a1a; border: 1px solid #333;
  border-radius: 3px; font-size: 11px; color: #ce9178; white-space: pre-wrap;
  word-break: break-all; max-height: 200px; overflow-y: auto; line-height: 1.4;
}
.warn-code.WORKER_ERROR, .warn-code.WORKER_UNHANDLED_REJECTION { color: #f44747; }
.warn-empty { color: #808080; padding: 16px; text-align: center; }

/* ---- Frame flamechart ---- */

.frame-section-title {
  color: #007acc;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 0 3px;
  border-bottom: 1px solid #2d2d2d;
  margin-bottom: 4px;
}

.frame-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 11px;
  cursor: pointer;
}
.frame-bar-row:hover { background: #2a2d2e; }

.frame-label {
  color: #808080;
  flex-shrink: 0;
  width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.frame-bar-track {
  flex: 1;
  height: 14px;
  background: #2d2d2d;
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.frame-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.15s;
}
.frame-bar-fill.green { background: #4ec9b0; }
.frame-bar-fill.yellow { background: #d7ba7d; }
.frame-bar-fill.red { background: #f44747; }

.frame-info {
  color: #808080;
  flex-shrink: 0;
  width: 130px;
  text-align: right;
  font-size: 10px;
  white-space: nowrap;
}

.frame-detail {
  padding: 4px 8px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  margin: 2px 0 4px 0;
  font-size: 10px;
  color: #d4d4d4;
}

.frame-detail-row {
  display: flex;
  justify-content: space-between;
  padding: 1px 0;
}
.frame-detail-action { color: #569cd6; }
.frame-detail-time { color: #d4d4d4; }

/* ---- Event tracer ---- */

.event-trace-section {
  margin-top: 8px;
  border-top: 1px solid #2d2d2d;
  padding-top: 4px;
}

.event-trace-title {
  color: #007acc;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 0 3px;
}

.event-trace-entry {
  font-size: 11px;
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  color: #808080;
}
.event-trace-type { color: #569cd6; font-weight: 600; }
.event-trace-time { color: #d7ba7d; }

/* ---- Node Inspector Sidebar ---- */

.tree-with-sidebar {
  display: flex;
  height: 100%;
}

.tree-main {
  flex: 1;
  overflow: auto;
  min-width: 0;
}

.node-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-left: 1px solid #3c3c3c;
  overflow-y: auto;
  padding: 6px;
  background: #1e1e1e;
  font-size: 11px;
  display: none;
}
.node-sidebar.visible { display: block; }

.sidebar-title {
  color: #007acc;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 0 2px;
  border-bottom: 1px solid #2d2d2d;
  margin-bottom: 2px;
}
.sidebar-title:first-child { padding-top: 0; }

.sidebar-row {
  display: flex;
  justify-content: space-between;
  padding: 1px 0;
  gap: 4px;
}
.sidebar-key { color: #9cdcfe; word-break: break-all; }
.sidebar-val { color: #ce9178; word-break: break-all; text-align: right; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }

.sidebar-empty { color: #555; font-style: italic; padding: 2px 0; }

.sidebar-mutation {
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 10px;
}
.sidebar-mut-action { color: #569cd6; }
.sidebar-mut-time { color: #555; }

.tree-line.selected { background: #094771; }

/* ---- Batch Diff View (Log tab) ---- */

.batch-group {
  margin: 2px 0;
  border: 1px solid #2d2d2d;
  border-radius: 3px;
}

.batch-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  background: #252526;
  cursor: pointer;
  font-size: 11px;
  user-select: none;
}
.batch-header:hover { background: #2a2d2e; }

.batch-toggle {
  color: #808080;
  font-size: 9px;
  width: 12px;
  text-align: center;
  flex-shrink: 0;
}

.batch-uid { color: #569cd6; font-weight: 600; }
.batch-count { color: #808080; }

.batch-entries {
  display: none;
  padding: 0 4px 2px 18px;
}
.batch-group.expanded .batch-entries { display: block; }

.log-entry.color-green .log-action { color: #4ec9b0; }
.log-entry.color-blue .log-action { color: #569cd6; }
.log-entry.color-red .log-action { color: #f44747; }

/* ---- Mutation Type Chart (Performance tab) ---- */

.chart-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  font-size: 11px;
}

.chart-bar-label {
  color: #808080;
  flex-shrink: 0;
  width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-bar-track {
  flex: 1;
  height: 12px;
  background: #2d2d2d;
  border-radius: 2px;
  overflow: hidden;
}

.chart-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: #569cd6;
  transition: width 0.15s;
}

.chart-bar-value {
  color: #d4d4d4;
  flex-shrink: 0;
  width: 50px;
  text-align: right;
  font-size: 10px;
}

/* ---- Coalescing Visualizer (Performance tab) ---- */

.coalesce-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 11px;
}
.coalesce-action { color: #569cd6; width: 120px; flex-shrink: 0; }
.coalesce-detail { color: #808080; flex: 1; }
.coalesce-pct { color: #d7ba7d; flex-shrink: 0; width: 60px; text-align: right; }

/* ---- Flush button ---- */

.flush-btn {
  background: #3c3c3c;
  border: 1px solid #555;
  color: #d4d4d4;
  padding: 1px 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  border-radius: 3px;
  white-space: nowrap;
  margin-left: 6px;
}
.flush-btn:hover { background: #505050; }

/* ---- Coalesced log (dimmed/strikethrough) ---- */

.coalesced-entry {
  display: flex;
  gap: 6px;
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 11px;
  opacity: 0.5;
  text-decoration: line-through;
}
.coalesced-entry .log-action { color: #808080; }

.coalesced-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  font-size: 11px;
  color: #808080;
}
.coalesced-toggle input { margin: 0; }
.coalesced-toggle label { cursor: pointer; }

/* ---- Event / Sync Read log entries ---- */

.log-section-title {
  color: #007acc;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 0 3px;
  border-top: 1px solid #2d2d2d;
  margin-top: 4px;
}

.log-entry.event-entry .log-action { color: #d7ba7d; }
.log-entry.syncread-entry .log-action { color: #c586c0; }

/* Responsive / mobile-friendly */
@media (max-width: 600px) {
  .panel { width: calc(100vw - 16px) !important; height: 50vh !important; left: 8px; right: 8px; bottom: 8px; }
  .panel.collapsed { width: auto; height: auto; }
  .tab-bar button { padding: 4px 8px; font-size: 10px; }
  .header-bar { padding: 2px 8px; }
  .tree-tag, .log-action { font-size: 11px; }
  .stat-row { font-size: 11px; }
}
@media (max-width: 400px) {
  .panel { width: calc(100vw - 8px) !important; left: 4px; right: 4px; }
  .tab-bar button { padding: 3px 6px; font-size: 9px; }
}
`;function z(n){return n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function me(n){const e=new Date(n);if(Number.isNaN(e.getTime())){const b=new Date,m=String(b.getHours()).padStart(2,"0"),_=String(b.getMinutes()).padStart(2,"0"),F=String(b.getSeconds()).padStart(2,"0");return`${m}:${_}:${F}`}const t=String(e.getHours()).padStart(2,"0"),s=String(e.getMinutes()).padStart(2,"0"),o=String(e.getSeconds()).padStart(2,"0"),a=String(e.getMilliseconds()).padStart(3,"0");return`${t}:${s}:${o}.${a}`}function ye(n,e){return n.length>e?`${n.slice(0,e)}...`:n}function Ft(n){if(n.length===0)return"";const e="▁▂▃▄▅▆▇█",t=Math.max(...n),s=Math.min(...n),o=t-s||1;return n.map(a=>e[Math.min(Math.floor((a-s)/o*7),7)]).join("")}function Pt(){const n=document.createElement("div");n.id="__async-dom-devtools__";const e=n.attachShadow({mode:"open"}),t=document.createElement("style");t.textContent=Ht,e.appendChild(t);const s=document.createElement("div");s.className="panel collapsed";const o=document.createElement("button");o.className="toggle-tab";const a=document.createElement("span");a.style.cssText="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background-color:#4ec9b0;vertical-align:middle;",o.appendChild(a);const b=document.createElement("span");b.textContent="async-dom ▲",o.appendChild(b),s.appendChild(o);const m=document.createElement("div");m.className="header-bar";const _=document.createElement("span");_.className="header-title",_.textContent="async-dom devtools",m.appendChild(_);const F=document.createElement("div");F.className="header-actions";const K=document.createElement("button");K.className="header-btn",K.textContent="⬤",K.title="Highlight DOM updates",K.style.fontSize="8px",K.style.color="#808080",K.addEventListener("click",()=>{Te=!Te,K.style.color=Te?"#4ec9b0":"#808080";const r=te();r&&r.enableHighlightUpdates(Te)}),F.appendChild(K);const B=document.createElement("button");B.className="header-btn",B.textContent="↻",B.title="Refresh data from workers",F.appendChild(B);const ee=document.createElement("button");ee.className="header-btn",ee.textContent="▼",ee.title="Collapse",F.appendChild(ee),m.appendChild(F),s.appendChild(m);const X=document.createElement("div");X.className="app-bar",s.appendChild(X);let G=null;const ae=document.createElement("div");ae.className="tab-bar";const he=["Tree","Performance","Log","Warnings"],le={},l={};for(const r of he){const i=document.createElement("button");i.className=`tab-btn${r==="Tree"?" active":""}`,i.textContent=r,i.dataset.tab=r,ae.appendChild(i),le[r]=i}s.appendChild(ae);const y=document.createElement("span");y.className="tab-badge",y.style.display="none";let C="Tree";function I(r){C=r;for(const i of he)le[i].classList.toggle("active",i===r),l[i].classList.toggle("active",i===r);r==="Warnings"&&(se=0,Re()),Ee()}for(const r of he)le[r].addEventListener("click",()=>I(r));const v=document.createElement("div");v.className="tab-content active",v.innerHTML='<div class="tree-empty">Click refresh to load virtual DOM tree from worker.</div>',l.Tree=v,s.appendChild(v);const S=document.createElement("div");S.className="tab-content",S.innerHTML='<div class="perf-row"><span class="perf-label">Loading...</span></div>',l.Performance=S,s.appendChild(S);const $=document.createElement("div");$.className="tab-content";const O=document.createElement("div");O.className="log-toolbar";const Q=document.createElement("input");Q.className="log-filter",Q.placeholder="Filter...",Q.type="text",O.appendChild(Q);const P=document.createElement("span");P.className="log-count",P.textContent="0",O.appendChild(P);const U=document.createElement("button");U.className="log-btn",U.textContent="Pause",O.appendChild(U);const D=document.createElement("button");D.className="log-btn active",D.textContent="Auto-scroll",O.appendChild(D);const J=document.createElement("button");J.className="log-btn",J.textContent="Clear",O.appendChild(J),$.appendChild(O);const q=document.createElement("div");q.className="log-list",q.innerHTML='<div class="log-empty">No mutations captured yet.</div>',$.appendChild(q),l.Log=$,s.appendChild($);const V=document.createElement("div");V.className="tab-content";const R=document.createElement("div");R.className="log-toolbar";const re=document.createElement("button");re.className="log-btn",re.textContent="Clear",R.appendChild(re),V.appendChild(R);const W=document.createElement("div");W.className="log-list",W.innerHTML='<div class="warn-empty">No warnings captured yet.</div>',V.appendChild(W),l.Warnings=V,s.appendChild(V),le.Warnings.appendChild(y),e.appendChild(s),document.body.appendChild(n);let ie=null,xe=null,we=null,Ce=!0;const fe=[],We=30;let Te=!1,Me=null,Le=null;function ot(){var d;const r=te();if(!((d=r==null?void 0:r.scheduler)!=null&&d.stats))return;const i=r.scheduler.stats(),k=i.pending;k>1e3||!i.isRunning?a.style.backgroundColor="#f44747":k>100?a.style.backgroundColor="#d7ba7d":a.style.backgroundColor="#4ec9b0"}const at=setInterval(ot,2e3);function te(){return globalThis.__ASYNC_DOM_DEVTOOLS__}function rt(){s.classList.remove("collapsed"),Be(),ct()}function it(){s.classList.add("collapsed"),$e()}o.addEventListener("click",rt),ee.addEventListener("click",it);function Be(){const r=te();r&&(r.refreshDebugData(),setTimeout(()=>{ze(),Ee()},250))}B.addEventListener("click",Be);function ze(){const r=te();if(!r)return;const i=r.apps();if(i.length<=1){X.classList.remove("visible"),G=i[0]??null;return}X.classList.add("visible"),X.innerHTML="";const k=document.createElement("span");k.className="app-label",k.textContent="Apps:",X.appendChild(k),(G===null||!i.includes(G))&&(G=i[0]);for(const d of i){const L=document.createElement("button");L.className=`app-btn${d===G?" active":""}`,L.textContent=d,L.addEventListener("click",()=>{G=d,ze(),Ee()}),X.appendChild(L)}}function Ee(){C==="Tree"?Ye():C==="Performance"?Se():C==="Log"?ke():C==="Warnings"&&Ge()}function Ue(r,i){var x;if(r.innerHTML="",i.id!=null){const h=document.createElement("div");h.className="sidebar-title",h.textContent="Node",r.appendChild(h);const g=document.createElement("div");g.className="sidebar-row",g.innerHTML=`<span class="sidebar-key">_nodeId</span><span class="sidebar-val">${i.id}</span>`,r.appendChild(g)}const k=document.createElement("div");if(k.className="sidebar-row",k.innerHTML=`<span class="sidebar-key">type</span><span class="sidebar-val">${z(i.type)}</span>`,r.appendChild(k),i.tag){const h=document.createElement("div");h.className="sidebar-row",h.innerHTML=`<span class="sidebar-key">tag</span><span class="sidebar-val">${z(i.tag)}</span>`,r.appendChild(h)}const d=((x=i.children)==null?void 0:x.length)??0,L=document.createElement("div");L.className="sidebar-row",L.innerHTML=`<span class="sidebar-key">children</span><span class="sidebar-val">${d}</span>`,r.appendChild(L);const w=te();if(w&&i.id!=null){const h=w.findRealNode(i.id),g=h?h.isConnected:!1,f=document.createElement("div");f.className="sidebar-row",f.innerHTML=`<span class="sidebar-key">isConnected</span><span class="sidebar-val">${g}</span>`,r.appendChild(f)}const u=i.attributes??{},p=Object.keys(u);if(p.length>0){const h=document.createElement("div");h.className="sidebar-title",h.textContent="Attributes",r.appendChild(h);for(const g of p){const f=document.createElement("div");f.className="sidebar-row",f.innerHTML=`<span class="sidebar-key">${z(g)}</span><span class="sidebar-val" title="${z(u[g])}">${z(ye(u[g],30))}</span>`,r.appendChild(f)}}else if(i.type==="element"){const h=document.createElement("div");h.className="sidebar-title",h.textContent="Attributes",r.appendChild(h);const g=document.createElement("div");g.className="sidebar-empty",g.textContent="none",r.appendChild(g)}if(u.style){const h=document.createElement("div");h.className="sidebar-title",h.textContent="Inline Styles",r.appendChild(h);const g=u.style.split(";").filter(f=>f.trim());for(const f of g){const M=f.indexOf(":");if(M===-1)continue;const Y=f.slice(0,M).trim(),A=f.slice(M+1).trim(),T=document.createElement("div");T.className="sidebar-row",T.innerHTML=`<span class="sidebar-key">${z(Y)}</span><span class="sidebar-val">${z(A)}</span>`,r.appendChild(T)}}if(i.id!=null){const h=i.id,g=Z.filter(M=>M.mutation.id===h),f=document.createElement("div");if(f.className="sidebar-title",f.textContent=`Mutations (${g.length})`,r.appendChild(f),g.length===0){const M=document.createElement("div");M.className="sidebar-empty",M.textContent="none captured",r.appendChild(M)}else{const M=g.slice(-10);for(const Y of M){const A=document.createElement("div");A.className="sidebar-mutation",A.innerHTML=`<span class="sidebar-mut-time">${me(Y.timestamp)}</span> <span class="sidebar-mut-action">${z(Y.action)}</span>`,r.appendChild(A)}}}r.classList.add("visible")}function Ye(){const r=te();if(!r){v.innerHTML='<div class="tree-empty">Devtools API not available.</div>';return}const i=r.getAllAppsData(),k=Object.keys(i);if(k.length===0){v.innerHTML='<div class="tree-empty">No apps registered. Click ↻ to refresh.</div>';return}const d=G&&i[G]?G:k[0],L=i[d];if(!L||!L.tree){v.innerHTML='<div class="tree-empty">No virtual DOM tree received yet. Click ↻ to refresh.</div>';return}const w=L.tree,u=document.createElement("div");u.className="tree-with-sidebar";const p=document.createElement("div");p.className="tree-main";const x=document.createElement("div");x.className="tree-refresh-bar";const h=document.createElement("span");h.className="tree-status",h.textContent=`Virtual DOM for app: ${d}`,x.appendChild(h),p.appendChild(x);const g=document.createElement("div");g.className="node-sidebar",Ve(p,w,0,!0,r,g),u.appendChild(p),u.appendChild(g),v.innerHTML="",v.appendChild(u),Me&&Ue(g,Me)}function Ve(r,i,k,d,L,w){const u=document.createElement("div");u.className=`tree-node${d?" expanded":""}`;const p=document.createElement("div");p.className="tree-line",p.style.paddingLeft=`${k*14}px`;function x(){var N;const E=(N=r.closest(".tree-with-sidebar"))==null?void 0:N.querySelector(".tree-line.selected");E&&E.classList.remove("selected"),p.classList.add("selected"),Me=i,Ue(w,i)}if(i.type==="text"){const E=document.createElement("span");E.className="tree-toggle",p.appendChild(E);const N=document.createElement("span");if(N.className="tree-text-node",N.textContent=`"${ye((i.text??"").trim(),50)}"`,p.appendChild(N),i.id!=null){const j=document.createElement("span");j.className="tree-nodeid",j.textContent=`_${i.id}`,p.appendChild(j)}p.addEventListener("click",x),u.appendChild(p),r.appendChild(u);return}if(i.type==="comment"){const E=document.createElement("span");E.className="tree-toggle",p.appendChild(E);const N=document.createElement("span");N.className="tree-comment",N.textContent=`<!-- ${ye(i.text??"",40)} -->`,p.appendChild(N),p.addEventListener("click",x),u.appendChild(p),r.appendChild(u);return}const h=i.children??[],g=h.length>0,f=document.createElement("span");f.className="tree-toggle",f.textContent=g?d?"▼":"▶":" ",p.appendChild(f);const M=(i.tag??"???").toLowerCase(),Y=document.createElement("span");let A=`<span class="tree-tag">&lt;${z(M)}</span>`;const T=i.attributes??{};if(T.id&&(A+=` <span class="tree-attr-name">id</span>=<span class="tree-attr-value">"${z(T.id)}"</span>`),i.className){const E=ye(i.className,30);A+=` <span class="tree-attr-name">class</span>=<span class="tree-attr-value">"${z(E)}"</span>`}let H=0;for(const E in T)if(!(E==="id"||E==="class")){if(H>=2)break;A+=` <span class="tree-attr-name">${z(E)}</span>=<span class="tree-attr-value">"${z(ye(T[E],20))}"</span>`,H++}if(A+='<span class="tree-tag">&gt;</span>',Y.innerHTML=A,p.appendChild(Y),i.id!=null){const E=document.createElement("span");E.className="tree-nodeid",E.textContent=`_${i.id}`,p.appendChild(E)}if(p.addEventListener("click",E=>{if(g&&E.target===f){u.classList.toggle("expanded"),f.textContent=u.classList.contains("expanded")?"▼":"▶";return}if(x(),i.id!=null){const N=L.findRealNode(i.id);if(N&&"scrollIntoView"in N){N.scrollIntoView({behavior:"smooth",block:"center"});const j=N.style.outline,be=N.style.outlineOffset;N.style.outline="3px solid #007acc",N.style.outlineOffset="2px",setTimeout(()=>{N.style.outline=j,N.style.outlineOffset=be},1500)}}}),u.appendChild(p),g){const E=document.createElement("div");E.className="tree-children";for(const N of h)Ve(E,N,k+1,k<2,L,w);u.appendChild(E)}r.appendChild(u)}function Se(){const r=te();if(!r){S.innerHTML='<div class="perf-row"><span class="perf-label">Devtools API not available.</span></div>';return}const i=r.scheduler.stats(),k=i.pending;fe.push(k),fe.length>We&&fe.shift();let d="";d+='<div class="perf-section-title">Scheduler<button class="flush-btn" id="flush-btn">⏩ Flush</button></div>';let L="";k>1e3?L="red":k>100?L="yellow":L="green",d+=`<div class="perf-row"><span class="perf-label">Pending</span><span class="perf-value ${L}">${k}</span></div>`,d+=`<div class="perf-row"><span class="perf-label">Frame ID</span><span class="perf-value">${i.frameId}</span></div>`;const w=i.lastFrameTimeMs>16?"red":i.lastFrameTimeMs>12?"yellow":"green";d+=`<div class="perf-row"><span class="perf-label">Frame Time</span><span class="perf-value ${w}">${i.lastFrameTimeMs.toFixed(1)}ms</span></div>`,d+=`<div class="perf-row"><span class="perf-label">Frame Actions</span><span class="perf-value">${i.lastFrameActions}</span></div>`;const u=i.isRunning?"green":"yellow";d+=`<div class="perf-row"><span class="perf-label">Running</span><span class="perf-value ${u}">${i.isRunning?"Yes":"No"}</span></div>`,d+=`<div class="perf-row"><span class="perf-label">Last Tick</span><span class="perf-value">${i.lastTickTime>0?`${i.lastTickTime.toFixed(0)}ms`:"N/A"}</span></div>`;const p=i.enqueueToApplyMs,x=p>16?"red":p>5?"yellow":"green";d+=`<div class="perf-row"><span class="perf-label">Enqueue→Apply</span><span class="perf-value ${x}">${p>0?`${p.toFixed(1)}ms`:"N/A"}</span></div>`,fe.length>1&&(d+=`<div class="perf-row"><span class="perf-label">Queue (${We}f)</span><span class="perf-sparkline">${Ft(fe)}</span></div>`);const h=r.apps();d+=`<div class="perf-row"><span class="perf-label">Apps</span><span class="perf-value">${h.length}</span></div>`;const g=r.getAllAppsData();for(const A of h){const T=g[A];if(!(T!=null&&T.workerStats))continue;const H=T.workerStats;d+=`<div class="perf-section-title">Worker: ${z(A)}</div>`,d+=`<div class="perf-row"><span class="perf-label">Mutations Added</span><span class="perf-value">${H.added}</span></div>`,d+=`<div class="perf-row"><span class="perf-label">Mutations Coalesced</span><span class="perf-value">${H.coalesced}</span></div>`,d+=`<div class="perf-row"><span class="perf-label">Mutations Flushed</span><span class="perf-value">${H.flushed}</span></div>`;const E=H.added>0?(H.coalesced/H.added*100).toFixed(1):"0.0",N=Number.parseFloat(E)>50?"green":Number.parseFloat(E)>20?"yellow":"";d+=`<div class="perf-row"><span class="perf-label">Coalescing Ratio</span><span class="perf-value ${N}">${E}%</span></div>`}if(r.debugStats){const A=r.debugStats();d+='<div class="perf-section-title">Main Thread Stats</div>';const T=[["mutationsAdded","Mutations Added"],["mutationsCoalesced","Mutations Coalesced"],["mutationsFlushed","Mutations Flushed"],["mutationsApplied","Mutations Applied"],["eventsForwarded","Events Forwarded"],["eventsDispatched","Events Dispatched"],["syncReadRequests","Sync Read Requests"],["syncReadTimeouts","Sync Read Timeouts"]];for(const[H,E]of T){const N=A[H]??0,j=H==="syncReadTimeouts"&&N>0?"red":"";d+=`<div class="perf-row"><span class="perf-label">${z(E)}</span><span class="perf-value ${j}">${N}</span></div>`}}const f=r.scheduler.frameLog();if(f.length>0){d+='<div class="frame-section-title">Frames</div>';const A=16;for(const T of f){const H=Math.min(T.totalMs/A*100,100),E=T.totalMs/A;let N;E>1?N="red":E>.5?N="yellow":N="green";const j=T.totalMs>A?" !":"";if(d+=`<div class="frame-bar-row" data-frame-id="${T.frameId}">`,d+=`<span class="frame-label">#${T.frameId}</span>`,d+=`<span class="frame-bar-track"><span class="frame-bar-fill ${N}" style="width:${H.toFixed(1)}%"></span></span>`,d+=`<span class="frame-info">${T.totalMs.toFixed(1)}ms / ${A}ms (${T.actionCount})${j}</span>`,d+="</div>",Le===T.frameId){d+='<div class="frame-detail">';const be=[...T.timingBreakdown.entries()].sort((De,Ie)=>Ie[1]-De[1]);for(const[De,Ie]of be)d+=`<div class="frame-detail-row"><span class="frame-detail-action">${z(De)}</span><span class="frame-detail-time">${Ie.toFixed(2)}ms</span></div>`;d+="</div>"}}}for(const A of h){const T=g[A];if(!(T!=null&&T.perTypeCoalesced))continue;const H=T.perTypeCoalesced,E=Object.keys(H);if(E.length!==0){d+=`<div class="perf-section-title">Coalescing: ${z(A)}</div>`;for(const N of E){const j=H[N],be=j.added>0?(j.coalesced/j.added*100).toFixed(0):"0";d+='<div class="coalesce-row">',d+=`<span class="coalesce-action">${z(N)}</span>`,d+=`<span class="coalesce-detail">${j.added} added, ${j.coalesced} coalesced</span>`,d+=`<span class="coalesce-pct">(${be}%)</span>`,d+="</div>"}}}if(Z.length>0){const A=new Map;for(const E of Z)A.set(E.action,(A.get(E.action)??0)+1);const T=[...A.entries()].sort((E,N)=>N[1]-E[1]),H=T.length>0?T[0][1]:1;d+='<div class="perf-section-title">Mutation Types</div>';for(const[E,N]of T){const j=Math.max(N/H*100,2);d+='<div class="chart-bar-row">',d+=`<span class="chart-bar-label">${z(E)}</span>`,d+=`<span class="chart-bar-track"><span class="chart-bar-fill" style="width:${j.toFixed(1)}%"></span></span>`,d+=`<span class="chart-bar-value">${N}</span>`,d+="</div>"}}S.innerHTML=d;const M=S.querySelector("#flush-btn");M&&M.addEventListener("click",A=>{A.stopPropagation();const T=te();T&&T.scheduler.flush(),Se()});const Y=S.querySelectorAll(".frame-bar-row");for(const A of Y)A.addEventListener("click",()=>{const T=Number(A.dataset.frameId);Le=Le===T?null:T,Se()})}let Ne=0,_e=!1;U.addEventListener("click",()=>{pe=!pe,U.textContent=pe?"Resume":"Pause",U.classList.toggle("active",pe)}),D.addEventListener("click",()=>{Ce=!Ce,D.classList.toggle("active",Ce)});function lt(r){switch(r){case"createNode":case"createComment":case"appendChild":case"bodyAppendChild":case"headAppendChild":case"insertBefore":return"color-green";case"setAttribute":case"removeAttribute":case"setStyle":case"setClassName":case"setProperty":case"setTextContent":case"setHTML":case"insertAdjacentHTML":return"color-blue";case"removeNode":case"removeChild":return"color-red";default:return""}}function Ke(r){const i=document.createElement("div"),k=lt(r.action);i.className=`log-entry${k?` ${k}`:""}`;const d=document.createElement("span");d.className="log-time",d.textContent=me(r.timestamp),i.appendChild(d);const L=document.createElement("span");L.className="log-action",L.textContent=r.action,i.appendChild(L);const w=document.createElement("span");w.className="log-detail";const u="id"in r.mutation?r.mutation.id:void 0;let p=u!=null?`#${u}`:"";const x=r.mutation;return x.tag&&(p+=` tag=${x.tag}`),x.name&&r.action!=="addEventListener"&&(p+=` ${x.name}`),x.property&&(p+=` ${x.property}`),w.textContent=p,i.appendChild(w),i}function ke(){if(P.textContent=String(Z.length),Z.length===0){Ne!==0&&(q.innerHTML='<div class="log-empty">No mutations captured yet.</div>',Ne=0);return}const r=Q.value.toLowerCase().trim(),i=document.createDocumentFragment(),k=[];let d=null;for(const w of Z){if(r&&!w.action.toLowerCase().includes(r))continue;const u=w.batchUid;u!=null&&d!==null&&d.batchUid===u?d.entries.push(w):(d={batchUid:u,entries:[w]},k.push(d))}for(const w of k){if(w.batchUid==null||w.entries.length<=1){for(const M of w.entries)i.appendChild(Ke(M));continue}const u=document.createElement("div");u.className="batch-group";const p=document.createElement("div");p.className="batch-header";const x=document.createElement("span");x.className="batch-toggle",x.textContent="▶",p.appendChild(x);const h=document.createElement("span");h.className="batch-uid",h.textContent=`Batch #${w.batchUid}`,p.appendChild(h);const g=document.createElement("span");g.className="batch-count",g.textContent=`— ${w.entries.length} mutations`,p.appendChild(g),p.addEventListener("click",()=>{u.classList.toggle("expanded"),x.textContent=u.classList.contains("expanded")?"▼":"▶"}),u.appendChild(p);const f=document.createElement("div");f.className="batch-entries";for(const M of w.entries)f.appendChild(Ke(M));u.appendChild(f),i.appendChild(u)}q.innerHTML="",q.appendChild(i);const L=te();if(L){const w=L.getEventTraces();if(w.length>0){const u=document.createElement("div");u.className="event-trace-section";const p=document.createElement("div");p.className="event-trace-title",p.textContent=`Events (${w.length})`,u.appendChild(p);const x=w.slice(-20);for(const h of x){const g=h.timestamp,f=Z.filter(Y=>Y.timestamp>=g&&Y.timestamp<=g+100).length,M=document.createElement("div");M.className="event-trace-entry",M.innerHTML=`[<span class="event-trace-type">${z(h.eventType)}</span>] serialize <span class="event-trace-time">${h.serializeMs.toFixed(1)}ms</span> transport dispatch${f>0?` ${f} mutations`:""}`,u.appendChild(M)}q.appendChild(u)}}if(ce.length>0){const w=document.createElement("div");w.className="log-section-title",w.textContent=`Events (${ce.length})`,q.appendChild(w);const u=ce.slice(-50);for(const p of u){const x=document.createElement("div");x.className="log-entry event-entry";const h=document.createElement("span");h.className="log-time",h.textContent=me(p.timestamp),x.appendChild(h);const g=document.createElement("span");g.className="log-action",g.textContent=p.eventType,x.appendChild(g);const f=document.createElement("span");f.className="log-detail",f.textContent=`${p.phase}→${p.phase==="serialize"?"dispatch":"done"} targetId=${p.targetId??"?"}`,x.appendChild(f),q.appendChild(x)}}if(de.length>0){const w=document.createElement("div");w.className="log-section-title",w.textContent=`Sync Reads (${de.length})`,q.appendChild(w);const u=de.slice(-50);for(const p of u){const x=document.createElement("div");x.className="log-entry syncread-entry";const h=document.createElement("span");h.className="log-time",h.textContent=me(p.timestamp),x.appendChild(h);const g=document.createElement("span");g.className="log-action";const f=["boundingRect","computedStyle","nodeProperty","windowProperty"];g.textContent=f[p.queryType]??`query:${p.queryType}`,x.appendChild(g);const M=document.createElement("span");M.className="log-detail",M.textContent=`node=${p.nodeId} ${p.latencyMs.toFixed(1)}ms ${p.result}`,x.appendChild(M),q.appendChild(x)}}{const w=document.createElement("div");w.className="coalesced-toggle";const u=document.createElement("input");u.type="checkbox",u.id="coalesced-toggle-cb",u.checked=_e;const p=document.createElement("label");if(p.htmlFor="coalesced-toggle-cb",p.textContent="Show coalesced",w.appendChild(u),w.appendChild(p),q.appendChild(w),u.addEventListener("change",()=>{_e=u.checked,ke()}),_e){const x=L?L.getAllAppsData():{};let h=[];for(const f of Object.values(x))f!=null&&f.coalescedLog&&Array.isArray(f.coalescedLog)&&(h=h.concat(f.coalescedLog));h.sort((f,M)=>M.timestamp-f.timestamp);const g=h.slice(0,50);if(g.length>0){const f=document.createElement("div");f.className="log-section-title",f.textContent=`Coalesced (${g.length} of ${h.length})`,q.appendChild(f);for(const M of g){const Y=document.createElement("div");Y.className="coalesced-entry";const A=document.createElement("span");A.className="log-time",A.textContent=me(M.timestamp),Y.appendChild(A);const T=document.createElement("span");T.className="log-action",T.textContent=M.action,Y.appendChild(T);const H=document.createElement("span");H.className="log-detail",H.textContent=M.key,Y.appendChild(H),q.appendChild(Y)}}}}Ce&&(q.scrollTop=q.scrollHeight),Ne=Z.length}Q.addEventListener("input",ke),J.addEventListener("click",()=>{Z.length=0,Ne=0,q.innerHTML='<div class="log-empty">No mutations captured yet.</div>',P.textContent="0"});let ge=0;function Ge(){if(oe.length===0){ge!==0&&(W.innerHTML='<div class="warn-empty">No warnings captured yet.</div>',ge=0);return}if(oe.length===ge)return;const r=document.createDocumentFragment();for(const i of oe){const k=document.createElement("div");k.className="warn-entry";const d=document.createElement("span");d.className="warn-time",d.textContent=me(i.timestamp),k.appendChild(d);const L=document.createElement("span");L.className=`warn-code ${i.code}`,L.textContent=i.code,k.appendChild(L);const w=document.createElement("span");w.className="warn-msg";const u=i.message.split(`
`)[0],p=i.message.includes(`
`);if(w.textContent=u,k.appendChild(w),p){k.style.cursor="pointer";const x=document.createElement("pre");x.className="warn-stack",x.textContent=i.message,x.style.display="none",k.appendChild(x),k.addEventListener("click",()=>{x.style.display=x.style.display==="none"?"block":"none"})}r.appendChild(k)}W.innerHTML="",W.appendChild(r),W.scrollTop=W.scrollHeight,ge=oe.length}re.addEventListener("click",()=>{oe.length=0,se=0,ge=0,W.innerHTML='<div class="warn-empty">No warnings captured yet.</div>',Re()});function Re(){se>0&&C!=="Warnings"?(y.textContent=String(se>99?"99+":se),y.style.display="inline-block"):y.style.display="none",b.textContent=se>0?`async-dom (${se>99?"99+":se}) ▲`:"async-dom ▲"}ve=Re;function ct(){$e(),ie=setInterval(()=>{if(C==="Tree"){const r=te();r&&r.refreshDebugData(),setTimeout(Ye,250)}},2e3),xe=setInterval(()=>{if(C==="Performance"){const r=te();r&&r.refreshDebugData(),setTimeout(Se,250)}},1e3),we=setInterval(()=>{C==="Log"&&ke(),C==="Warnings"&&Ge()},500),Ee()}function $e(){ie&&(clearInterval(ie),ie=null),xe&&(clearInterval(xe),xe=null),we&&(clearInterval(we),we=null)}return{destroy(){$e(),clearInterval(at),ve=null,Z.length=0,oe.length=0,ce.length=0,de.length=0,se=0,n.remove()}}}const qt=100;class Wt{constructor(e,t){c(this,"listeners",new Map);c(this,"eventConfig",new Map);c(this,"nodeCache");c(this,"transport",null);c(this,"appId");c(this,"eventTraces",[]);this.appId=e,this.nodeCache=t??new qe}setTransport(e){this.transport=e}setNodeCache(e){this.nodeCache=e}configureEvent(e,t,s){if(this.eventConfig.set(`${e}_${t}`,s),s.preventDefault&&Je(t)){for(const[o,a]of this.listeners.entries())if(a.nodeId===e&&a.eventName===t){a.controller.abort(),this.attach(e,t,o);break}}}attach(e,t,s){const o=this.nodeCache.get(e);if(!o)return;const a=new AbortController;this.listeners.set(s,{controller:a,nodeId:e,eventName:t});const b=this._isPassiveForListener(s,t);o.addEventListener(t,m=>{var X;const _=`${e}_${t}`,F=this.eventConfig.get(_);F!=null&&F.preventDefault&&m.preventDefault();const K=performance.now(),B=zt(m),ee=performance.now()-K;this.eventTraces.push({eventType:m.type,serializeMs:ee,timestamp:performance.now()}),this.eventTraces.length>qt&&this.eventTraces.shift(),(X=this.transport)==null||X.send({type:"event",appId:this.appId,listenerId:s,event:B})},{signal:a.signal,passive:b})}detach(e){const t=this.listeners.get(e);t&&(t.controller.abort(),this.listeners.delete(e))}detachByNodeId(e){for(const[t,s]of this.listeners)s.nodeId===e&&(s.controller.abort(),this.listeners.delete(t))}getEventTraces(){return this.eventTraces.slice()}detachAll(){for(const e of this.listeners.values())e.controller.abort();this.listeners.clear()}_isPassiveForListener(e,t){for(const[s,o]of this.eventConfig.entries())if(s.endsWith(`_${t}`)&&o.preventDefault)return!1;return Je(t)}}const Bt=new Set(["scroll","touchstart","touchmove","wheel","mousewheel"]);function Je(n){return Bt.has(n)}function Ae(n){if(!n)return null;const e=n.__asyncDomId;return e!=null?String(e):n.getAttribute("data-async-dom-id")??n.id??null}function zt(n){var a;const e=((a=n.composedPath)==null?void 0:a.call(n)[0])??n.target,t={type:n.type,target:Ae(e),currentTarget:Ae(n.currentTarget),bubbles:n.bubbles,cancelable:n.cancelable,composed:n.composed,eventPhase:n.eventPhase,isTrusted:n.isTrusted,timeStamp:n.timeStamp};n.type==="click"&&(n.target instanceof HTMLAnchorElement||n.currentTarget instanceof HTMLAnchorElement)&&n.preventDefault(),n instanceof MouseEvent&&(t.clientX=n.clientX,t.clientY=n.clientY,t.pageX=n.pageX,t.pageY=n.pageY,t.screenX=n.screenX,t.screenY=n.screenY,t.offsetX=n.offsetX,t.offsetY=n.offsetY,t.button=n.button,t.buttons=n.buttons,t.altKey=n.altKey,t.ctrlKey=n.ctrlKey,t.metaKey=n.metaKey,t.shiftKey=n.shiftKey,t.relatedTarget=Ae(n.relatedTarget),t.detail=n.detail),n instanceof KeyboardEvent&&(t.key=n.key,t.code=n.code,t.keyCode=n.keyCode,t.altKey=n.altKey,t.ctrlKey=n.ctrlKey,t.metaKey=n.metaKey,t.shiftKey=n.shiftKey),n instanceof InputEvent&&(t.data=n.data??void 0,t.inputType=n.inputType);const s=n.target;s instanceof HTMLInputElement?(t.value=s.value,t.checked=s.checked):s instanceof HTMLTextAreaElement?t.value=s.value:s instanceof HTMLSelectElement&&(t.value=s.value,t.selectedIndex=s.selectedIndex);const o=n.target;return o instanceof HTMLMediaElement&&(t.currentTime=o.currentTime,t.duration=Number.isFinite(o.duration)?o.duration:0,t.paused=o.paused,t.ended=o.ended,t.readyState=o.readyState),n instanceof FocusEvent&&(t.relatedTarget=n.relatedTarget instanceof Element?Ae(n.relatedTarget):null),n instanceof WheelEvent&&Object.assign(t,{deltaX:n.deltaX,deltaY:n.deltaY,deltaZ:n.deltaZ,deltaMode:n.deltaMode}),t}const Ut=new Set(["script","iframe","object","embed","form","base","meta","link","style"]),Yt=/^on/i,Vt=new Set(["href","src","data","action","formaction","xlink:href"]),Kt=new Set(["srcdoc","formaction"]);function Gt(n){const e=n.trim().toLowerCase();return/^\s*javascript\s*:/i.test(e)||/^\s*vbscript\s*:/i.test(e)||/^\s*data\s*:\s*text\/html/i.test(e)}function Ze(n){const s=new DOMParser().parseFromString(`<body>${n}</body>`,"text/html").body;return st(s),s.innerHTML}function st(n){const e=Array.from(n.childNodes);for(const t of e)if(t.nodeType===Node.ELEMENT_NODE){const s=t,o=s.tagName.toLowerCase();if(Ut.has(o)){s.remove();continue}const a=[];for(let b=0;b<s.attributes.length;b++){const m=s.attributes[b],_=m.name.toLowerCase();(Yt.test(_)||Kt.has(_)||Vt.has(_)&&Gt(m.value))&&a.push(m.name)}for(const b of a)s.removeAttribute(b);st(s)}}const jt=new Set(["srcdoc","formaction"]),Xt=new Set(["href","src","data","action","xlink:href"]);function Qt(n){const e=n.trim().toLowerCase();return/^\s*javascript\s*:/i.test(e)||/^\s*vbscript\s*:/i.test(e)||/^\s*data\s*:\s*text\/html/i.test(e)}const Jt={allowHeadAppend:!1,allowBodyAppend:!1,allowNavigation:!0,allowScroll:!0,allowUnsafeHTML:!1},Zt=new Set(["value","checked","disabled","selectedIndex","indeterminate","readOnly","required","placeholder","type","name","scrollTop","scrollLeft","textContent","nodeValue","src","currentTime","volume","muted","controls","loop","poster","autoplay","tabIndex","title","lang","dir","hidden","draggable","contentEditable","htmlFor","open","selected","multiple","width","height","colSpan","rowSpan"]),en=new Set(["play","pause","load","focus","blur","click","scrollIntoView","requestFullscreen","select","setCustomValidity","reportValidity","showModal","close"]),tn=new Set(["svg","path","circle","ellipse","line","polygon","polyline","rect","g","defs","use","text","tspan","clippath","mask","image","symbol","marker","lineargradient","radialgradient","stop","filter","fegaussianblur","feoffset","feblend","foreignobject"]),nn="http://www.w3.org/2000/svg";class sn{constructor(e,t,s){c(this,"nodeCache");c(this,"permissions");c(this,"root");c(this,"_additionalAllowedProperties");c(this,"onNodeRemoved",null);c(this,"_onWarning",null);c(this,"_onMutation",null);c(this,"highlightEnabled",!1);this.nodeCache=e??new qe,this.permissions={...Jt,...t},this._additionalAllowedProperties=new Set(this.permissions.additionalAllowedProperties??[]),this.root=s??{body:document.body,head:document.head,html:document.documentElement}}setDebugHooks(e){this._onWarning=e.onWarning??null,this._onMutation=e.onMutation??null}enableHighlightUpdates(e){this.highlightEnabled=e}highlightNode(e){if(!this.highlightEnabled)return;const t=this.nodeCache.get(e);if(!(t!=null&&t.style))return;const s=t.style.outline;t.style.outline="2px solid rgba(78, 201, 176, 0.8)",setTimeout(()=>{t.style.outline=s},300)}apply(e,t){switch(this._onMutation&&this._onMutation({side:"main",action:e.action,mutation:e,timestamp:performance.now(),batchUid:t}),e.action){case"createNode":this.createNode(e.id,e.tag,e.textContent);break;case"createComment":this.createComment(e.id,e.textContent);break;case"appendChild":this.appendChild(e.id,e.childId);break;case"removeNode":this.removeNode(e.id);break;case"removeChild":this.removeChild(e.id,e.childId);break;case"insertBefore":this.insertBefore(e.id,e.newId,e.refId);break;case"setAttribute":this.setAttribute(e.id,e.name,e.value);break;case"removeAttribute":this.removeAttribute(e.id,e.name);break;case"setStyle":this.setStyle(e.id,e.property,e.value);break;case"setProperty":this.setProperty(e.id,e.property,e.value);break;case"setTextContent":this.setTextContent(e.id,e.textContent);break;case"setClassName":this.setClassName(e.id,e.name);break;case"setHTML":this.setHTML(e.id,e.html);break;case"addEventListener":break;case"configureEvent":break;case"removeEventListener":break;case"headAppendChild":this.headAppendChild(e.id);break;case"bodyAppendChild":this.bodyAppendChild(e.id);break;case"pushState":this.permissions.allowNavigation&&window.history.pushState(e.state,e.title,e.url);break;case"replaceState":this.permissions.allowNavigation&&window.history.replaceState(e.state,e.title,e.url);break;case"scrollTo":this.permissions.allowScroll&&window.scrollTo(e.x,e.y);break;case"insertAdjacentHTML":this.insertAdjacentHTML(e.id,e.position,e.html);break;case"callMethod":this.callMethod(e.id,e.method,e.args);break}if(this.highlightEnabled&&"id"in e){const s=e.action;(s==="appendChild"||s==="setAttribute"||s==="setStyle"||s==="setClassName"||s==="setTextContent"||s==="setHTML")&&this.highlightNode(e.id)}}getNode(e){return this.nodeCache.get(e)}clear(){this.nodeCache.clear()}getRoot(){return this.root}createNode(e,t,s){if(this.nodeCache.has(e))return;if(t==="HTML"){this.nodeCache.set(e,this.root.html);return}if(t==="BODY"){this.nodeCache.set(e,this.root.body);return}if(t==="HEAD"){this.nodeCache.set(e,this.root.head);return}if(t.charAt(0)==="#"){const m=document.createTextNode(s??"");this.nodeCache.set(e,m);return}const o=t.toLowerCase();let a;tn.has(o)?a=document.createElementNS(nn,o):a=document.createElement(t);const b=String(e);a.setAttribute("data-async-dom-id",b),a.__asyncDomId=e,s&&(a.textContent=s),this.nodeCache.set(e,a)}createComment(e,t){if(this.nodeCache.has(e))return;const s=document.createComment(t);this.nodeCache.set(e,s)}appendChild(e,t){var a;const s=this.nodeCache.get(e),o=this.nodeCache.get(t);if(!s||!o){const b=`appendChild: ${s?"child":"parent"} not found`;console.warn(`[async-dom] ${b}`,{parentId:e,childId:t}),(a=this._onWarning)==null||a.call(this,{code:ue.MISSING_NODE,message:b,context:{parentId:e,childId:t},timestamp:performance.now()});return}s.appendChild(o)}removeNode(e){var s;const t=this.nodeCache.get(e);if(!t){const o="removeNode: node not found";console.warn(`[async-dom] ${o}`,{id:e}),(s=this._onWarning)==null||s.call(this,{code:ue.MISSING_NODE,message:o,context:{id:e},timestamp:performance.now()});return}this._cleanupSubtreeListeners(t,e),this.nodeCache.delete(e),t.parentNode?t.parentNode.removeChild(t):"remove"in t&&typeof t.remove=="function"&&t.remove()}removeChild(e,t){var a;const s=this.nodeCache.get(e),o=this.nodeCache.get(t);s&&(o!=null&&o.parentNode)&&(o.parentNode.removeChild(o),this.nodeCache.delete(t),(a=this.onNodeRemoved)==null||a.call(this,t))}insertBefore(e,t,s){var m;if(e===t)return;const o=this.nodeCache.get(e),a=this.nodeCache.get(t);if(!o||!a){const _=`insertBefore: ${o?"newNode":"parent"} not found`;console.warn(`[async-dom] ${_}`,{parentId:e,newId:t,refId:s}),(m=this._onWarning)==null||m.call(this,{code:ue.MISSING_NODE,message:_,context:{parentId:e,newId:t,refId:s},timestamp:performance.now()});return}const b=s?this.nodeCache.get(s):null;o.insertBefore(a,b??null)}setAttribute(e,t,s){var b;const o=this.nodeCache.get(e);if(!o||!("setAttribute"in o)){const m="setAttribute: node not found";console.warn(`[async-dom] ${m}`,{id:e,name:t,value:s}),(b=this._onWarning)==null||b.call(this,{code:ue.MISSING_NODE,message:m,context:{id:e,name:t,value:s},timestamp:performance.now()});return}const a=t.toLowerCase();/^on/i.test(a)||jt.has(a)||Xt.has(a)&&Qt(s)||(t==="id"&&this.nodeCache.set(s,o),o.setAttribute(t,s))}removeAttribute(e,t){const s=this.nodeCache.get(e);!s||!("removeAttribute"in s)||s.removeAttribute(t)}setStyle(e,t,s){var a;const o=this.nodeCache.get(e);if(!(o!=null&&o.style)){const b="setStyle: node not found";console.warn(`[async-dom] ${b}`,{id:e,property:t,value:s}),(a=this._onWarning)==null||a.call(this,{code:ue.MISSING_NODE,message:b,context:{id:e,property:t,value:s},timestamp:performance.now()});return}o.style.setProperty(t,s)}setProperty(e,t,s){var a;const o=this.nodeCache.get(e);if(o){if(!Zt.has(t)&&!this._additionalAllowedProperties.has(t)){(a=this._onWarning)==null||a.call(this,{code:ue.BLOCKED_PROPERTY,message:`setProperty: property "${t}" is not in the allowed list`,context:{id:e,property:t},timestamp:performance.now()});return}o[t]=s}}setTextContent(e,t){const s=this.nodeCache.get(e);s&&(s.textContent=t)}setClassName(e,t){const s=this.nodeCache.get(e);s&&(s.className=t)}setHTML(e,t){const s=this.nodeCache.get(e);s&&(s.innerHTML=this.permissions.allowUnsafeHTML?t:Ze(t))}insertAdjacentHTML(e,t,s){const o=this.nodeCache.get(e);!o||!("insertAdjacentHTML"in o)||o.insertAdjacentHTML(t,this.permissions.allowUnsafeHTML?s:Ze(s))}headAppendChild(e){if(!this.permissions.allowHeadAppend)return;const t=this.nodeCache.get(e);t&&this.root.head.appendChild(t)}bodyAppendChild(e){if(!this.permissions.allowBodyAppend)return;const t=this.nodeCache.get(e);t&&this.root.body.appendChild(t)}callMethod(e,t,s){const o=this.nodeCache.get(e);if(!o)return;if(!en.has(t)){console.warn(`[async-dom] Blocked callMethod: "${t}" is not allowed`);return}const a=o[t];typeof a=="function"&&a.apply(o,s)}_cleanupSubtreeListeners(e,t){var s;if((s=this.onNodeRemoved)==null||s.call(this,t),"children"in e){const o=e;for(let a=0;a<o.children.length;a++){const b=o.children[a],m=b.__asyncDomId;m&&(this._cleanupSubtreeListeners(b,m),this.nodeCache.delete(m))}}}}class on{constructor(e){c(this,"handlers",[]);c(this,"_readyState","open");c(this,"onError");c(this,"onClose");this.worker=e,e.onmessage=t=>{for(const s of this.handlers)try{s(t.data)}catch(o){console.error("[async-dom] Handler error:",o)}},e.onerror=t=>{var o,a;const s=new Error(t.message??"Worker error");(o=this.onError)==null||o.call(this,s),this._readyState!=="closed"&&(this._readyState="closed",(a=this.onClose)==null||a.call(this))},e.onmessageerror=()=>{var s;const t=new Error("Worker message deserialization failed");(s=this.onError)==null||s.call(this,t)}}send(e){this._readyState==="open"&&this.worker.postMessage(e)}onMessage(e){this.handlers.push(e)}close(){this._readyState="closed",this.worker.terminate()}get readyState(){return this._readyState}}class an{constructor(e,t){c(this,"ws",null);c(this,"handlers",[]);c(this,"_readyState","connecting");c(this,"onError");c(this,"onClose");c(this,"attempt",0);c(this,"messageQueue",[]);c(this,"closed",!1);c(this,"reconnectTimer",null);c(this,"maxRetries");c(this,"baseDelay");c(this,"maxDelay");this.url=e,this.maxRetries=(t==null?void 0:t.maxRetries)??Ct,this.baseDelay=(t==null?void 0:t.baseDelay)??Tt,this.maxDelay=(t==null?void 0:t.maxDelay)??Et,this.connect()}connect(){this.closed||(this._readyState="connecting",this.ws=new WebSocket(this.url),this.ws.onopen=()=>{this._readyState="open",this.attempt=0,this.flushQueue()},this.ws.onmessage=e=>{try{const t=JSON.parse(e.data);for(const s of this.handlers)try{s(t)}catch(o){console.error("[async-dom] Handler error:",o)}}catch{console.error("[async-dom] Failed to parse WebSocket message")}},this.ws.onclose=()=>{this.closed||this.scheduleReconnect()},this.ws.onerror=()=>{var e;(e=this.ws)==null||e.close()})}scheduleReconnect(){if(this.attempt>=this.maxRetries){this._readyState="closed",console.error(`[async-dom] WebSocket reconnection failed after ${this.maxRetries} attempts`);return}const e=Math.min(this.baseDelay*2**this.attempt+Math.random()*1e3,this.maxDelay);this.attempt++,this.reconnectTimer=setTimeout(()=>{this.connect()},e)}flushQueue(){for(;this.messageQueue.length>0;){const e=this.messageQueue.shift();if(!e)break;this.sendRaw(e)}}sendRaw(e){var t;(t=this.ws)==null||t.send(JSON.stringify(e))}send(e){var t;this._readyState==="open"&&((t=this.ws)==null?void 0:t.readyState)===WebSocket.OPEN?this.sendRaw(e):this._readyState!=="closed"&&this.messageQueue.push(e)}onMessage(e){this.handlers.push(e)}close(){var e;this.closed=!0,this._readyState="closed",this.reconnectTimer!==null&&clearTimeout(this.reconnectTimer),(e=this.ws)==null||e.close(),this.messageQueue.length=0}get readyState(){return this._readyState}}class rn{constructor(){c(this,"threads",new Map);c(this,"messageHandlers",[])}createWorkerThread(e){const t=et(),s=e.transport??new on(e.worker);return s.onMessage(o=>{this.notifyHandlers(t,o)}),this.threads.set(t,{transport:s,appId:t}),t}createWebSocketThread(e){const t=et(),s=new an(e.url,e.options);return s.onMessage(o=>{this.notifyHandlers(t,o)}),this.threads.set(t,{transport:s,appId:t}),t}sendToThread(e,t){const s=this.threads.get(e);s&&s.transport.send(t)}broadcast(e){for(const t of this.threads.values())t.transport.send(e)}destroyThread(e){const t=this.threads.get(e);t&&(t.transport.close(),this.threads.delete(e))}destroyAll(){for(const e of[...this.threads.keys()])this.destroyThread(e)}onMessage(e){this.messageHandlers.push(e)}getTransport(e){var t;return((t=this.threads.get(e))==null?void 0:t.transport)??null}notifyHandlers(e,t){for(const s of this.messageHandlers)s(e,t)}}function et(){return Math.random().toString(36).slice(2,7)}const ln=new Set(["innerWidth","innerHeight","outerWidth","outerHeight","devicePixelRatio","screen.width","screen.height","screen.availWidth","screen.availHeight","screen.colorDepth","screen.pixelDepth","screen.orientation.type","scrollX","scrollY","visualViewport.width","visualViewport.height","navigator.language","navigator.languages","navigator.userAgent","navigator.hardwareConcurrency","document.visibilityState","document.hidden","localStorage.getItem","localStorage.setItem","localStorage.removeItem","localStorage.length","localStorage.key","sessionStorage.getItem","sessionStorage.setItem","sessionStorage.removeItem","sessionStorage.length","sessionStorage.key"]);function dn(n){var he,le;const e=new Nt(n.scheduler),t=new rn,s=new Map,o=new Map,a=mt(n.debug),b=new ut,m=new Map;let _=null,F=null;const K=new Map;function B(l){t.sendToThread(l,{type:"debugQuery",query:"tree"}),t.sendToThread(l,{type:"debugQuery",query:"stats"}),t.sendToThread(l,{type:"debugQuery",query:"perTypeCoalesced"}),t.sendToThread(l,{type:"debugQuery",query:"coalescedLog"})}function ee(l,y){try{const C=JSON.parse(y.data),I=C.nodeId,v=C.property;switch(y.queryType){case ne.BoundingRect:{const S=l.getNode(I);if(!S||!("getBoundingClientRect"in S))return null;const $=S.getBoundingClientRect();return{top:$.top,left:$.left,right:$.right,bottom:$.bottom,width:$.width,height:$.height,x:$.x,y:$.y}}case ne.ComputedStyle:{const S=l.getNode(I);if(!S)return{};const $=window.getComputedStyle(S),O={},Q=["display","position","top","left","right","bottom","width","height","color","background-color","font-size","font-family","font-weight","line-height","text-align","visibility","opacity","overflow","z-index","float","clear","cursor","pointer-events","box-sizing","flex-direction","justify-content","align-items","flex-wrap","flex-grow","flex-shrink","flex-basis","grid-template-columns","grid-template-rows","gap","transform","border-radius","box-shadow","text-decoration","white-space","word-break","overflow-wrap","min-width","max-width","min-height","max-height","margin-top","margin-right","margin-bottom","margin-left","padding-top","padding-right","padding-bottom","padding-left"];for(const P of Q){const U=$.getPropertyValue(P);U&&(O[P]=U)}return O}case ne.NodeProperty:{const S=l.getNode(I);return!S||!v?null:S[v]??null}case ne.WindowProperty:{if(!v||!ln.has(v))return null;if(v.startsWith("localStorage.")||v.startsWith("sessionStorage.")){const O=v.indexOf("."),Q=v.slice(0,O),P=v.slice(O+1),U=Q==="localStorage"?window.localStorage:window.sessionStorage,D=C.args;return P==="getItem"&&(D==null?void 0:D[0])!=null?U.getItem(D[0]):P==="setItem"&&(D==null?void 0:D[0])!=null&&D[1]!==void 0?(U.setItem(D[0],D[1]),null):P==="removeItem"&&(D==null?void 0:D[0])!=null?(U.removeItem(D[0]),null):P==="length"?U.length:P==="key"&&(D==null?void 0:D[0])!==void 0?U.key(Number(D[0])):null}const S=v.split(".");let $=window;for(const O of S){if($==null)return null;$=$[O]}return $??null}default:return null}}catch{return null}}e.setApplier((l,y,C)=>{if(l.action==="addEventListener"){const v=s.get(y);v&&(v.attach(l.id,l.name,l.listenerId),b.eventsForwarded++);return}if(l.action==="configureEvent"){const v=s.get(y);v&&v.configureEvent(l.id,l.name,{preventDefault:l.preventDefault,passive:l.passive});return}if(l.action==="removeEventListener"){const v=s.get(y);v&&v.detach(l.listenerId);return}let I;y===F&&_?I=_:(I=m.get(y),I&&(_=I,F=y)),I&&(I.apply(l,C),b.mutationsApplied++)}),t.onMessage((l,y)=>{if(nt(y)){e.enqueue(y.mutations,l,y.priority??"normal",y.uid);return}if(Oe(y)&&y.type==="debugResult"){const C=y,I=K.get(l)??{tree:null,workerStats:null,perTypeCoalesced:null,coalescedLog:null};C.query==="tree"&&(I.tree=C.result),C.query==="stats"&&(I.workerStats=C.result),C.query==="perTypeCoalesced"&&(I.perTypeCoalesced=C.result),C.query==="coalescedLog"&&(I.coalescedLog=C.result),K.set(l,I)}}),n.worker&&X(n.worker,n.target);function X(l,y,C,I,v){const S=t.createWorkerThread({worker:l,transport:I}),$=new qe;let O=null;y&&(O=typeof y=="string"?document.querySelector(y):y);let Q;if(O&&C){const V=C===!0?{mode:"open"}:C,R=O.attachShadow(V);Q={body:R,head:R,html:O}}else O&&(Q={body:O,head:document.head,html:O});const P=new sn($,void 0,Q);(a.onWarning||a.onMutation)&&P.setDebugHooks({onWarning:a.onWarning,onMutation:a.onMutation});const U=P.getRoot();$.set(ft,U.body),$.set(gt,U.head),$.set(bt,U.html),$.set(tt,document),P.onNodeRemoved=V=>{const R=s.get(S);R&&R.detachByNodeId(V)},m.set(S,P);const D=new Wt(S,$),J=t.getTransport(S);if(J){D.setTransport(J);const V=()=>{D.detachAll(),s.delete(S),P.clear(),m.delete(S),F===S&&(_=null,F=null);const R=o.get(S);R&&(R.stopPolling(),o.delete(S)),e.setAppCount(m.size)};console.debug("[async-dom] App",S,"transport ready, readyState:",J.readyState),J.onError=R=>{console.error("[async-dom] App",S,"worker error:",R.message),v==null||v({message:R.message,stack:R.stack,name:R.name},S)},J.onClose=()=>{console.warn("[async-dom] App",S,"worker disconnected, cleaning up"),V()},J.onMessage(R=>{if(Oe(R)&&R.type==="error"&&"error"in R){const re=R;v==null||v(re.error,S);const W=re.error,ie=W.filename?` at ${W.filename}:${W.lineno??"?"}:${W.colno??"?"}`:"";Qe({code:W.isUnhandledRejection?"WORKER_UNHANDLED_REJECTION":"WORKER_ERROR",message:`[${String(S)}] ${W.name??"Error"}: ${W.message}${ie}${W.stack?`
${W.stack}`:""}`,context:{appId:String(S),error:W},timestamp:performance.now()})}})}s.set(S,D),e.setAppCount(m.size);let q;if(typeof SharedArrayBuffer<"u")try{q=new SharedArrayBuffer(65536);const V=new Mt(q);V.startPolling(R=>ee(P,R)),o.set(S,V)}catch{q=void 0}return J&&J.onMessage(V=>{if(Oe(V)&&V.type==="query"){const R=V,W={boundingRect:ne.BoundingRect,computedStyle:ne.ComputedStyle,nodeProperty:ne.NodeProperty,windowProperty:ne.WindowProperty}[R.query]??ne.NodeProperty,ie=ee(P,{queryType:W,data:JSON.stringify({nodeId:R.nodeId,property:R.property})});J.send({type:"queryResult",uid:R.uid,result:ie})}}),t.sendToThread(S,{type:"init",appId:S,location:{hash:window.location.hash,href:window.location.href,port:window.location.port,host:window.location.host,origin:window.location.origin,hostname:window.location.hostname,pathname:window.location.pathname,protocol:window.location.protocol,search:window.location.search,state:window.history.state},sharedBuffer:q}),S}let G=null;if((he=n.debug)!=null&&he.exposeDevtools&&(globalThis.__ASYNC_DOM_DEVTOOLS__={scheduler:{pending:()=>e.pendingCount,stats:()=>e.getStats(),frameLog:()=>e.getFrameLog(),flush:()=>e.flush()},getEventTraces:()=>{const l=[];for(const y of s.values())l.push(...y.getEventTraces());return l.sort((y,C)=>y.timestamp-C.timestamp),l},enableHighlightUpdates:l=>{for(const y of m.values())y.enableHighlightUpdates(l)},findRealNode:l=>{for(const y of m.values()){const C=y.getNode(l);if(C)return C}return null},debugStats:()=>b.snapshot(),apps:()=>[...m.keys()],renderers:()=>{const l={};for(const[y,C]of m)l[String(y)]={root:C.getRoot()};return l},refreshDebugData:()=>{for(const l of m.keys())B(l)},getAppData:l=>K.get(l),getAllAppsData:()=>{const l={};for(const[y,C]of K)l[String(y)]=C;return l}},typeof document<"u"&&(G=Pt())),(le=n.debug)!=null&&le.exposeDevtools){const l=a.onMutation,y=a.onWarning,C=a.onEvent,I=a.onSyncRead;a.onMutation=v=>{l==null||l(v),Dt(v)},a.onWarning=v=>{y==null||y(v),Qe(v)},a.onEvent=v=>{C==null||C(v),It(v)},a.onSyncRead=v=>{I==null||I(v),Ot(v)}}console.debug("[async-dom] Initialized",{apps:n.worker?1:0,debug:!!n.debug,scheduler:n.scheduler??"default"});const ae=()=>{t.broadcast({type:"visibility",state:document.visibilityState})};return document.addEventListener("visibilitychange",ae),{start(){e.start()},stop(){e.stop()},destroy(){e.stop(),e.flush();for(const l of m.values())l.clear();m.clear(),_=null,F=null;for(const l of s.values())l.detachAll();for(const l of o.values())l.stopPolling();o.clear(),document.removeEventListener("visibilitychange",ae),t.destroyAll(),G&&(G.destroy(),G=null)},addApp(l){return X(l.worker,l.mountPoint,l.shadow,l.transport,l.onError)},removeApp(l){const y=s.get(l);y&&(y.detachAll(),s.delete(l));const C=m.get(l);C&&(C.clear(),m.delete(l)),F===l&&(_=null,F=null);const I=o.get(l);I&&(I.stopPolling(),o.delete(l)),t.destroyThread(l),e.setAppCount(m.size)}}}export{dn as c};
