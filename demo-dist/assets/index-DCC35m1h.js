var In=Object.defineProperty;var _n=(n,e,t)=>e in n?In(n,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):n[e]=t;var c=(n,e,t)=>_n(n,typeof e!="symbol"?e+"":e,t);const Qe={MISSING_NODE:"ASYNC_DOM_MISSING_NODE",BLOCKED_PROPERTY:"ASYNC_DOM_BLOCKED_PROPERTY"},Rn={ASYNC_DOM_MISSING_NODE:{description:"A DOM mutation referenced a node ID that doesn't exist in the node cache.",suggestion:"Ensure nodes are created before being referenced. Check for race conditions between create and update mutations."},ASYNC_DOM_SYNC_TIMEOUT:{description:"A synchronous read (getBoundingClientRect, computedStyle) timed out waiting for the main thread response.",suggestion:"Reduce sync read frequency, increase timeout, or use cached values when possible."},ASYNC_DOM_LISTENER_NOT_FOUND:{description:"An event was received for a listener ID that is not registered.",suggestion:"This may indicate a timing issue where a listener was removed before its event was processed."},ASYNC_DOM_EVENT_ATTACH_FAILED:{description:"Failed to attach an event listener to a DOM node.",suggestion:"Verify the target node exists in the DOM when the listener is being attached."},ASYNC_DOM_TRANSPORT_NOT_OPEN:{description:"Attempted to send a message through a closed or connecting transport.",suggestion:"Ensure the transport connection is established before sending mutations."},ASYNC_DOM_BLOCKED_PROPERTY:{description:"A setProperty call was blocked because the property is not in the allowed list.",suggestion:"Add the property to additionalAllowedProperties in the renderer permissions if it's safe."},WORKER_ERROR:{description:"An unhandled error occurred in the worker thread.",suggestion:"Check the stack trace for the error source. Add error handling in your worker code."},WORKER_UNHANDLED_REJECTION:{description:"An unhandled promise rejection occurred in the worker thread.",suggestion:"Add .catch() handlers to promises or use try/catch with async/await in your worker code."}},Dn={warning(n){console.warn(`[async-dom] ${n.code}: ${n.message}`,n.context)},mutation(n){console.log(`[async-dom:${n.side}] mutation:${n.action}`,n.mutation)},event(n){console.log(`[async-dom:${n.side}] event:${n.phase} ${n.eventType} listenerId=${n.listenerId}`)},syncRead(n){console.log(`[async-dom] sync:${n.queryType} node=${n.nodeId} ${n.result} (${n.latencyMs.toFixed(1)}ms)`)},scheduler(n){console.log(`[async-dom] frame:${n.frameId} actions=${n.actionsProcessed} time=${n.frameTimeMs.toFixed(1)}ms queue=${n.queueDepth}`)}};class Bn{constructor(){c(this,"mutationsAdded",0);c(this,"mutationsCoalesced",0);c(this,"mutationsFlushed",0);c(this,"mutationsApplied",0);c(this,"eventsForwarded",0);c(this,"eventsDispatched",0);c(this,"syncReadRequests",0);c(this,"syncReadTimeouts",0)}snapshot(){return{mutationsAdded:this.mutationsAdded,mutationsCoalesced:this.mutationsCoalesced,mutationsFlushed:this.mutationsFlushed,mutationsApplied:this.mutationsApplied,eventsForwarded:this.eventsForwarded,eventsDispatched:this.eventsDispatched,syncReadRequests:this.syncReadRequests,syncReadTimeouts:this.syncReadTimeouts}}reset(){this.mutationsAdded=0,this.mutationsCoalesced=0,this.mutationsFlushed=0,this.mutationsApplied=0,this.eventsForwarded=0,this.eventsDispatched=0,this.syncReadRequests=0,this.syncReadTimeouts=0}}class On{constructor(){c(this,"nodeIndex",new Map);c(this,"maxEntriesPerNode",20);c(this,"batchEventMap",new Map)}registerBatchEvent(e,t){if(this.batchEventMap.set(e,t),this.batchEventMap.size>500){const s=this.batchEventMap.keys().next().value;s!==void 0&&this.batchEventMap.delete(s)}}indexMutation(e){const s=e.mutation.id;if(s==null)return;const a=e.batchUid!=null?this.batchEventMap.get(e.batchUid)??null:null;let o=this.nodeIndex.get(s);o||(o=[],this.nodeIndex.set(s,o)),o.push({batchUid:e.batchUid,action:e.action,timestamp:e.timestamp,causalEvent:a}),o.length>this.maxEntriesPerNode&&o.shift()}getWhyUpdated(e){return this.nodeIndex.get(e)??[]}clear(){this.nodeIndex.clear(),this.batchEventMap.clear()}}function Fn(n){if(!n)return{onMutation:null,onEvent:null,onSyncRead:null,onScheduler:null,onWarning:null};const e={...Dn,...n.logger};return{onMutation:n.logMutations?t=>e.mutation(t):null,onEvent:n.logEvents?t=>e.event(t):null,onSyncRead:n.logSyncReads?t=>e.syncRead(t):null,onScheduler:n.logScheduler?t=>e.scheduler(t):null,onWarning:n.logWarnings?t=>e.warning(t):null}}function Pn(n){const e=new Map,t=[],s=new Map,a=[];for(const o of n)if(o.causalEvent){const f=`event:${o.causalEvent.eventType}:${o.causalEvent.listenerId}:${o.causalEvent.timestamp}`;s.has(f)||s.set(f,[]),s.get(f).push(o)}else a.push(o);for(const[o,f]of s){const F=f[0].causalEvent,q={type:"event",id:o,label:`${F.eventType} (${F.listenerId})`,children:[]};for(const j of f){const B=`batch:${j.batchUid}`,se={type:"batch",id:B,label:`Batch #${j.batchUid} (${j.mutationCount} muts)`,children:[]};for(const z of j.nodeIds){const te=`node:${z}`;e.has(te)||e.set(te,{type:"node",id:te,label:`#${z}`,children:[]}),se.children.push(te)}e.set(B,se),q.children.push(B)}e.set(o,q),t.push(o)}for(const o of a){const f=`batch:${o.batchUid}`,E={type:"batch",id:f,label:`Batch #${o.batchUid} (${o.mutationCount} muts, no event)`,children:[]};for(const F of o.nodeIds){const q=`node:${F}`;e.has(q)||e.set(q,{type:"node",id:q,label:`#${F}`,children:[]}),E.children.push(q)}e.set(f,E),t.push(f)}return{nodes:e,roots:t}}class Hn{constructor(){c(this,"batches",[]);c(this,"maxBatches",100)}recordBatch(e,t,s,a){this.batches.push({batchUid:e,causalEvent:a,nodeIds:new Set(t),mutationCount:s,timestamp:Date.now()}),this.batches.length>this.maxBatches&&this.batches.shift()}getBatches(){return this.batches.slice()}buildGraph(){return Pn(this.batches)}findBatchesForNode(e){return this.batches.filter(t=>t.nodeIds.has(e))}clear(){this.batches.length=0}}const zn=1,Wn=2,qn=3,fn=4;function mn(n){return n.type==="mutation"}function Un(n){return n.type==="event"}function it(n){return!mn(n)&&!Un(n)}class Wt{constructor(){c(this,"cache",new Map)}get(e){return e===fn?document:this.cache.get(e)??null}set(e,t){this.cache.set(e,t)}delete(e){this.cache.delete(e)}clear(){this.cache.clear()}has(e){return this.cache.has(e)}}const Kn=16,Dt=1500,nn=3e3,Yn=500,jn=60,Vn=10,Gn=1e3,Xn=3e4,Jn=30;class Qn{constructor(e={}){c(this,"queue",[]);c(this,"actionTimes",new Map);c(this,"frameId",0);c(this,"running",!1);c(this,"rafId",0);c(this,"uidCounter",0);c(this,"timePerLastFrame",0);c(this,"totalActionsLastFrame",0);c(this,"isScrolling",!1);c(this,"scrollTimer",null);c(this,"scrollAbort",null);c(this,"viewportHeight",0);c(this,"viewportWidth",0);c(this,"boundingRectCache",new Map);c(this,"boundingRectCacheFrame",new Map);c(this,"frameBudgetMs");c(this,"enableViewportCulling");c(this,"enablePrioritySkipping");c(this,"applier",null);c(this,"appCount",0);c(this,"appBudgets",new Map);c(this,"lastTickTime",0);c(this,"healthCheckTimer",null);c(this,"queueOverflowWarned",!1);c(this,"lastEnqueueTime",0);c(this,"droppedFrameCount",0);c(this,"lastWorkerToMainLatencyMs",0);c(this,"frameLog",[]);this.frameBudgetMs=e.frameBudgetMs??Kn,this.enableViewportCulling=e.enableViewportCulling??!0,this.enablePrioritySkipping=e.enablePrioritySkipping??!0}setApplier(e){this.applier=e}setAppCount(e){this.appCount=e}enqueue(e,t,s="normal",a){this.lastEnqueueTime=performance.now();for(const o of e)this.uidCounter++,this.queue.push({mutation:o,priority:s,uid:this.uidCounter,appId:t,batchUid:a});this.queue.length>1e4&&!this.queueOverflowWarned&&(this.queueOverflowWarned=!0,console.warn(`[async-dom] Scheduler queue overflow: ${this.queue.length} pending mutations. Possible causes: tab hidden, applier not set, or mutations arriving faster than processing.`)),this.queue.length<=1e4&&(this.queueOverflowWarned=!1)}start(){this.running||(this.running=!0,this.lastTickTime=0,this.setupScrollListener(),this.scheduleFrame(),this.healthCheckTimer=setTimeout(()=>{this.running&&this.lastTickTime===0&&console.warn(`[async-dom] Scheduler started but tick() has not fired after 1 second. This usually means the tab is hidden (rAF does not fire in background tabs). Queue has ${this.queue.length} pending mutations.`)},1e3),console.debug("[async-dom] Scheduler started"))}scheduleFrame(){this.running&&(typeof document<"u"&&document.hidden?setTimeout(()=>this.tick(performance.now()),this.frameBudgetMs):this.rafId=requestAnimationFrame(e=>this.tick(e)))}stop(){this.running=!1,this.healthCheckTimer&&(clearTimeout(this.healthCheckTimer),this.healthCheckTimer=null),this.rafId&&(cancelAnimationFrame(this.rafId),this.rafId=0),this.scrollAbort&&(this.scrollAbort.abort(),this.scrollAbort=null),this.clearViewportCache()}clearViewportCache(){this.boundingRectCache.clear(),this.boundingRectCacheFrame.clear()}flush(){const e=this.applier;if(e){this.queue.sort(sn);for(const t of this.queue)e(t.mutation,t.appId,t.batchUid);this.queue.length=0}}get pendingCount(){return this.queue.length}recordWorkerLatency(e){this.lastWorkerToMainLatencyMs=Math.max(0,Date.now()-e)}getStats(){return{pending:this.queue.length,frameId:this.frameId,lastFrameTimeMs:this.timePerLastFrame,lastFrameActions:this.totalActionsLastFrame,isRunning:this.running,lastTickTime:this.lastTickTime,enqueueToApplyMs:this.lastTickTime>0&&this.lastEnqueueTime>0?Math.max(0,this.lastTickTime-this.lastEnqueueTime):0,droppedFrameCount:this.droppedFrameCount,workerToMainLatencyMs:this.lastWorkerToMainLatencyMs}}getFrameLog(){return this.frameLog.slice()}tick(e){if(!this.running)return;this.lastTickTime=performance.now();const t=performance.now();this.frameId++,this.calcViewportSize(),this.queue.sort(sn);const s=this.applier;if(!s){this.scheduleNext(t);return}let a=0;const o=this.getActionsForFrame(),f=[],E=new Map,F=new Map,q=new Map;this.appCount>1&&this.appBudgets.clear();let j=0;for(;j<this.queue.length&&a<o;){const se=performance.now()-t;if(this.queue.length<nn&&se>=this.frameBudgetMs)break;const z=this.queue[j];if(j++,this.shouldSkip(z))continue;if(this.appCount>1){const he=this.appBudgets.get(z.appId)??0,ge=Math.ceil(o/this.appCount);if(he>=ge){f.push(z);const Te=String(z.appId);q.set(Te,(q.get(Te)??0)+1);continue}this.appBudgets.set(z.appId,he+1)}const te=performance.now();s(z.mutation,z.appId,z.batchUid);const we=performance.now()-te;{const he=String(z.appId);F.set(he,(F.get(he)??0)+1)}this.recordTiming(z.mutation.action,we),E.set(z.mutation.action,(E.get(z.mutation.action)??0)+we),a++}j===this.queue.length?this.queue.length=0:j>0&&(this.queue=this.queue.slice(j)),f.length>0&&(this.queue=f.concat(this.queue));const B=performance.now()-t;if(a>0){B>this.frameBudgetMs&&this.droppedFrameCount++,this.timePerLastFrame=B,this.totalActionsLastFrame=a;let se;if(F.size>0||q.size>0){se=new Map;const z=new Set([...F.keys(),...q.keys()]);for(const te of z)se.set(te,{mutations:F.get(te)??0,deferred:q.get(te)??0})}this.frameLog.push({frameId:this.frameId,totalMs:B,actionCount:a,timingBreakdown:E,perApp:se}),this.frameLog.length>Jn&&this.frameLog.shift()}this.scheduleNext(t)}scheduleNext(e){const t=performance.now()-e;t+1>=this.frameBudgetMs?this.scheduleFrame():setTimeout(()=>{this.scheduleFrame()},this.frameBudgetMs-t)}getActionsForFrame(){const e=this.queue.length;if(e>25e3)return e;if(e>=nn)return Yn;if(e>Dt)return Dt;const t=this.getAvgActionTime();return t>0?Math.max(1,Math.floor(this.frameBudgetMs*3/t)):2e3}shouldSkip(e){if(!this.enablePrioritySkipping)return!1;const t=e.mutation;return"optional"in t&&t.optional?this.isScrolling||this.queue.length>Dt/2||this.timePerLastFrame>this.frameBudgetMs+.2?!0:(this.enableViewportCulling&&t.action,!1):!1}recordTiming(e,t){t>0&&this.actionTimes.set(e,t+.02)}getAvgActionTime(){return this.totalActionsLastFrame===0?0:this.timePerLastFrame/this.totalActionsLastFrame}calcViewportSize(){this.viewportHeight=window.innerHeight||document.documentElement.clientHeight,this.viewportWidth=window.innerWidth||document.documentElement.clientWidth}isInViewport(e){const t=e.id;if(!t)return!0;const s=this.boundingRectCacheFrame.get(t);if(s!==void 0&&s+jn>this.frameId)return this.boundingRectCache.get(t)??!0;const a=e.getBoundingClientRect(),o=a.top>=0&&a.left>=0&&a.bottom<=this.viewportHeight&&a.right<=this.viewportWidth;return this.boundingRectCache.set(t,o),this.boundingRectCacheFrame.set(t,this.frameId),o}setupScrollListener(){this.scrollAbort&&this.scrollAbort.abort(),this.scrollAbort=new AbortController,window.addEventListener("scroll",()=>{this.isScrolling=!0,this.scrollTimer!==null&&clearTimeout(this.scrollTimer),this.scrollTimer=setTimeout(()=>{this.isScrolling=!1},66)},{passive:!0,signal:this.scrollAbort.signal})}}function sn(n,e){const t={high:0,normal:1,low:2},s=t[n.priority],a=t[e.priority];if(s!==a)return s-a;const o="optional"in n.mutation&&n.mutation.optional?1:0,f="optional"in e.mutation&&e.mutation.optional?1:0;return o!==f?o-f:n.uid-e.uid}const Bt=16,Ot=4096,Zn=1,es=2;var Me=(n=>(n[n.BoundingRect=0]="BoundingRect",n[n.ComputedStyle=1]="ComputedStyle",n[n.NodeProperty=2]="NodeProperty",n[n.WindowProperty=3]="WindowProperty",n))(Me||{});class ts{constructor(e){c(this,"signal");c(this,"meta");c(this,"requestRegion");c(this,"responseRegion");c(this,"encoder",new TextEncoder);c(this,"decoder",new TextDecoder);c(this,"polling",!1);c(this,"pollChannel",null);this.signal=new Int32Array(e,0,4),this.meta=this.signal,this.requestRegion=new Uint8Array(e,Bt,Ot),this.responseRegion=new Uint8Array(e,Bt+Ot,e.byteLength-Bt-Ot)}poll(){if(Atomics.load(this.signal,0)!==Zn)return null;const t=Atomics.load(this.meta,1),s=Atomics.load(this.meta,2),a=this.requestRegion.slice(0,s),o=this.decoder.decode(a);return{queryType:t,data:o}}respond(e){const t=JSON.stringify(e),s=this.encoder.encode(t);this.responseRegion.set(s),Atomics.store(this.meta,3,s.byteLength),Atomics.store(this.signal,0,es),Atomics.notify(this.signal,0)}startPolling(e){if(!this.polling)if(this.polling=!0,typeof MessageChannel<"u"){this.pollChannel=new MessageChannel;let t=0;const s=()=>{var o,f;if(!this.polling)return;const a=this.poll();if(a){t=0;const E=e(a);this.respond(E),(o=this.pollChannel)==null||o.port2.postMessage(null)}else if(t++,t<=2)(f=this.pollChannel)==null||f.port2.postMessage(null);else{const E=Math.min(1<<t-3,16);setTimeout(()=>{var F;this.polling&&((F=this.pollChannel)==null||F.port2.postMessage(null))},E)}};this.pollChannel.port1.onmessage=s,this.pollChannel.port2.postMessage(null)}else{const t=setInterval(()=>{if(!this.polling){clearInterval(t);return}const s=this.poll();if(s){const a=e(s);this.respond(a)}},4)}}stopPolling(){this.polling=!1,this.pollChannel&&(this.pollChannel.port1.close(),this.pollChannel.port2.close(),this.pollChannel=null)}}function Ht(n){const e={type:n.type};return n.tag!==void 0&&(e.tag=n.tag),n.id!==void 0&&(e.id=n.id),n.className!==void 0&&(e.className=n.className),n.text!==void 0&&(e.text=n.text),n.attributes&&(e.attributes={...n.attributes}),n.children&&(e.children=n.children.map(Ht)),e}function ns(n,e){return!n&&!e?null:!n&&e?dt(e):n&&!e?pt(n):zt(n,e)}function dt(n){const e={diffType:"added",node:n};return n.children&&(e.children=n.children.map(dt)),e}function pt(n){const e={diffType:"removed",node:n};return n.children&&(e.children=n.children.map(pt)),e}function zt(n,e){const t=[];if(n.type!==e.type||n.tag!==e.tag)return{diffType:"changed",node:e,changes:["replaced"],children:[pt(n),dt(e)]};if(n.type==="element"&&e.type==="element"){const F=n.attributes??{},q=e.attributes??{},j=new Set([...Object.keys(F),...Object.keys(q)]);for(const B of j)F[B]!==q[B]&&t.push(`attr:${B}`);n.className!==e.className&&t.push("className")}n.text!==e.text&&t.push("text");const s=n.children??[],a=e.children??[],o=ss(s,a),E={diffType:t.length>0?"changed":"unchanged",node:e};return t.length>0&&(E.changes=t),o.length>0&&(E.children=o),E}function ss(n,e){const t=[],s=new Map,a=[];for(const f of n)f.id!=null?s.set(f.id,{node:f,used:!1}):a.push(f);let o=0;for(const f of e)if(f.id!=null){const E=s.get(f.id);E?(E.used=!0,t.push(zt(E.node,f))):t.push(dt(f))}else o<a.length?(t.push(zt(a[o],f)),o++):t.push(dt(f));for(const[,f]of s)f.used||t.push(pt(f.node));for(let f=o;f<a.length;f++)t.push(pt(a[f]));return t}function gn(n){return n.diffType!=="unchanged"?!0:n.children?n.children.some(gn):!1}function Ft(n,e){if(n.length===0)return 0;const t=Math.ceil(e/100*n.length)-1;return n[Math.max(0,t)]}function an(n){if(n.length===0)return{p50:0,p95:0,p99:0};const e=[...n].sort((t,s)=>t-s);return{p50:Ft(e,50),p95:Ft(e,95),p99:Ft(e,99)}}function lt(n){return n>16?"red":n>5?"yellow":"green"}function on(n){return n>50?"red":n>5?"yellow":"green"}function Et(n){return n===0?"0 B":n<1024?`${n} B`:n<1024*1024?`${(n/1024).toFixed(1)} KB`:`${(n/(1024*1024)).toFixed(1)} MB`}function as(n){return{entries:[...n],currentIndex:0,isPlaying:!1}}function rn(n){return n.currentIndex>=n.entries.length?null:n.entries[n.currentIndex++]}function Pt(n,e){n.currentIndex=Math.max(0,Math.min(e,n.entries.length))}function os(n){n.currentIndex=0,n.isPlaying=!1}function rs(n){const e={version:1,exportedAt:new Date().toISOString(),...n};return JSON.stringify(e,is,2)}function is(n,e){return e instanceof Map?Object.fromEntries(e):e}function ls(n){const e=JSON.parse(n);if(!e||typeof e!="object")throw new Error("Invalid session: not an object");if(e.version!==1)throw new Error(`Unsupported session version: ${e.version}`);if(!Array.isArray(e.mutationLog))throw new Error("Invalid session: mutationLog must be an array");if(!Array.isArray(e.warningLog))throw new Error("Invalid session: warningLog must be an array");if(!Array.isArray(e.eventLog))throw new Error("Invalid session: eventLog must be an array");if(!Array.isArray(e.syncReadLog))throw new Error("Invalid session: syncReadLog must be an array");const t=1e4;return e.mutationLog.length>t&&(e.mutationLog=e.mutationLog.slice(-t)),e.warningLog.length>t&&(e.warningLog=e.warningLog.slice(-t)),e.eventLog.length>t&&(e.eventLog=e.eventLog.slice(-t)),e.syncReadLog.length>t&&(e.syncReadLog=e.syncReadLog.slice(-t)),e}function cs(n,e){const t=new Blob([n],{type:"application/json"}),s=URL.createObjectURL(t),a=document.createElement("a");a.href=s,a.download=e,a.click(),URL.revokeObjectURL(s)}const ds=200,ps=200,hs=200,us=200,Ee=[],Ke=[],et=[],Se=[];let Le=0,ct=null,Ye=!1;function fs(n){Ye||(Ee.push(n),Ee.length>ds&&Ee.shift())}function ms(n){Ye||(et.push(n),et.length>hs&&et.shift())}function gs(n){Ye||(Se.push(n),Se.length>us&&Se.shift())}function ln(n){Ke.push(n),Ke.length>ps&&Ke.shift(),Le++,ct==null||ct()}const ys=`
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

/* Grouped Warnings */
.warn-group { margin: 4px 0; border: 1px solid #2d2d2d; border-radius: 3px; }
.warn-group-header { display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: #252526; cursor: pointer; font-size: 11px; user-select: none; }
.warn-group-header:hover { background: #2a2d2e; }
.warn-group-toggle { color: #808080; font-size: 9px; width: 12px; text-align: center; flex-shrink: 0; }
.warn-group-code { font-weight: 600; }
.warn-group-count { color: #808080; font-size: 10px; }
.warn-group-entries { display: none; padding: 0 6px 4px 18px; }
.warn-group.expanded .warn-group-entries { display: block; }
.warn-group-doc { padding: 4px 6px; background: #1a1a1a; border-bottom: 1px solid #2d2d2d; font-size: 10px; }
.warn-group-desc { color: #9cdcfe; }
.warn-group-suggestion { color: #4ec9b0; margin-top: 2px; }
.warn-suppress-btn { background: #3c3c3c; border: 1px solid #555; color: #808080; padding: 1px 6px; cursor: pointer; font-family: inherit; font-size: 10px; border-radius: 3px; margin-left: auto; }
.warn-suppress-btn:hover { color: #d4d4d4; background: #505050; }
.warn-suppressed-note { color: #555; font-size: 10px; padding: 4px; text-align: center; font-style: italic; }
.warn-view-toggle { font-size: 10px; }

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

.event-timeline { display: flex; align-items: center; gap: 2px; height: 16px; margin: 2px 0; cursor: pointer; }
.event-timeline:hover { background: #2a2d2e; }
.event-phase { height: 12px; border-radius: 2px; min-width: 4px; position: relative; }
.event-phase.serialize { background: #569cd6; }
.event-phase.transport { background: #d7ba7d; }
.event-phase.dispatch { background: #4ec9b0; }
.event-phase-label { font-size: 9px; color: #808080; white-space: nowrap; }
.event-mutation-count { color: #ce9178; font-weight: 600; font-size: 10px; }
.event-timeline-detail {
  padding: 4px 8px; background: #1a1a1a; border: 1px solid #333;
  border-radius: 3px; margin: 2px 0 4px 0; font-size: 10px; color: #d4d4d4; display: none;
}
.event-timeline-detail.visible { display: block; }

.sidebar-listener {
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 10px;
}
.sidebar-listener-event { color: #d7ba7d; font-weight: 600; }
.sidebar-listener-id { color: #555; margin-left: 4px; }
.sidebar-computed-val { color: #b5cea8; }

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

/* Sync Read Heatmap */
.heatmap-container { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px 0; }
.heatmap-block { width: 14px; height: 14px; border-radius: 2px; cursor: pointer; position: relative; }
.heatmap-block.green { background: #4ec9b0; }
.heatmap-block.yellow { background: #d7ba7d; }
.heatmap-block.red { background: #f44747; }
.heatmap-tooltip { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: #1a1a1a; border: 1px solid #555; padding: 2px 6px; border-radius: 3px; font-size: 10px; white-space: nowrap; z-index: 10; color: #d4d4d4; pointer-events: none; }

/* Latency sparkline color coding */
.perf-latency-val.green { color: #4ec9b0; }
.perf-latency-val.yellow { color: #d7ba7d; }
.perf-latency-val.red { color: #f44747; }

/* Threshold line on sparkline */
.sparkline-with-threshold { position: relative; display: inline-block; }
.sparkline-threshold { position: absolute; bottom: 50%; left: 0; right: 0; border-top: 1px dashed #f44747; opacity: 0.5; pointer-events: none; }
.transport-warn { color: #f44747; font-size: 10px; margin-left: 4px; }

/* ---- Replay bar ---- */

.replay-bar { display: flex; align-items: center; gap: 4px; padding: 4px 0; border-bottom: 1px solid #2d2d2d; margin-bottom: 4px; background: #1a1a1a; }
.replay-btn { background: #3c3c3c; border: 1px solid #555; color: #d4d4d4; padding: 2px 6px; cursor: pointer; font-family: inherit; font-size: 11px; border-radius: 3px; }
.replay-btn:hover { background: #505050; }
.replay-btn.active { background: #007acc; border-color: #007acc; }
.replay-slider { flex: 1; height: 4px; accent-color: #007acc; }
.replay-position { color: #808080; font-size: 10px; flex-shrink: 0; min-width: 60px; text-align: center; }
.replay-exit { color: #f44747; border-color: #f44747; }
.replay-exit:hover { background: #f44747; color: #fff; }
.replay-highlight { background: #094771 !important; }

/* ---- Import indicator ---- */

.import-indicator { color: #d7ba7d; font-size: 10px; margin-left: 6px; }
/* ---- Feature 15: Causality Graph tab ---- */

.graph-container {
  padding: 4px;
}

.graph-node {
  display: flex;
  align-items: flex-start;
  margin: 2px 0;
  padding: 3px 6px;
  border-left: 2px solid #3c3c3c;
  font-size: 11px;
}
.graph-node.event-node { border-left-color: #d7ba7d; }
.graph-node.batch-node { border-left-color: #569cd6; }
.graph-node.dom-node { border-left-color: #4ec9b0; }

.graph-node-label {
  color: #d4d4d4;
  cursor: pointer;
}
.graph-node-label:hover { text-decoration: underline; }

.graph-node-type {
  font-weight: 600;
  margin-right: 6px;
  font-size: 9px;
  text-transform: uppercase;
  flex-shrink: 0;
  width: 40px;
}
.graph-node-type.event { color: #d7ba7d; }
.graph-node-type.batch { color: #569cd6; }
.graph-node-type.node { color: #4ec9b0; }

.graph-children {
  padding-left: 16px;
}

.graph-empty {
  color: #808080;
  padding: 16px;
  text-align: center;
}

/* ---- Feature 16: Worker CPU Profiler ---- */

.worker-perf-section {
  margin-top: 8px;
}

.worker-perf-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 0;
  font-size: 10px;
}

.worker-perf-name {
  color: #808080;
  flex-shrink: 0;
  width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.worker-perf-duration {
  color: #d4d4d4;
  flex-shrink: 0;
  width: 60px;
  text-align: right;
}

.worker-perf-track {
  flex: 1;
  height: 10px;
  background: #2d2d2d;
  border-radius: 2px;
  overflow: hidden;
}

.worker-perf-fill {
  height: 100%;
  border-radius: 2px;
  background: #c586c0;
}

.worker-util {
  font-size: 11px;
  padding: 2px 0;
}
.worker-util-label { color: #808080; }
.worker-util-value { color: #d4d4d4; font-weight: 600; }

/* ---- Feature 17: Tree Diff ---- */

.snapshot-bar {
  display: flex;
  gap: 6px;
  align-items: center;
  padding-bottom: 4px;
  flex-wrap: wrap;
}

.snapshot-btn {
  background: #3c3c3c;
  border: 1px solid #555;
  color: #d4d4d4;
  padding: 2px 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  border-radius: 3px;
}
.snapshot-btn:hover { background: #505050; }
.snapshot-btn:disabled { opacity: 0.4; cursor: default; }

.snapshot-info {
  color: #555;
  font-size: 10px;
}

.diff-marker {
  display: inline-block;
  font-size: 9px;
  padding: 0 3px;
  border-radius: 2px;
  margin-left: 4px;
  font-weight: 600;
}
.diff-marker.added { background: #2ea04333; color: #4ec9b0; }
.diff-marker.removed { background: #f4474733; color: #f44747; }
.diff-marker.changed { background: #d7ba7d33; color: #d7ba7d; }

.tree-line.diff-added { background: #2ea04315; }
.tree-line.diff-removed { background: #f4474715; text-decoration: line-through; opacity: 0.7; }
.tree-line.diff-changed { background: #d7ba7d15; }

/* ---- Feature 18: Multi-App Interleaving ---- */

.multiapp-frame {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 10px;
}

.multiapp-frame-label {
  color: #808080;
  flex-shrink: 0;
  width: 50px;
}

.multiapp-stacked-bar {
  flex: 1;
  height: 14px;
  display: flex;
  border-radius: 2px;
  overflow: hidden;
  background: #2d2d2d;
}

.multiapp-segment {
  height: 100%;
  min-width: 1px;
}

.multiapp-info {
  color: #808080;
  flex-shrink: 0;
  font-size: 10px;
  white-space: nowrap;
  width: 100px;
  text-align: right;
}

.multiapp-legend {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  font-size: 10px;
  flex-wrap: wrap;
}

.multiapp-legend-item {
  display: flex;
  align-items: center;
  gap: 3px;
}

.multiapp-legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* ---- Feature 19: Why Updated? ---- */

.why-updated-section {
  margin-top: 4px;
}

.why-updated-title {
  color: #c586c0;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 0 2px;
  border-bottom: 1px solid #2d2d2d;
  margin-bottom: 2px;
}

.why-updated-chain {
  padding: 2px 0;
  font-size: 10px;
  border-bottom: 1px solid #2a2a2a;
}

.why-chain-mutation { color: #569cd6; }
.why-chain-arrow { color: #555; margin: 0 3px; }
.why-chain-batch { color: #d7ba7d; }
.why-chain-event { color: #4ec9b0; }
.why-chain-none { color: #555; font-style: italic; }

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
`;function H(n){return n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function Ze(n){const e=new Date(n);if(Number.isNaN(e.getTime())){const f=new Date,E=String(f.getHours()).padStart(2,"0"),F=String(f.getMinutes()).padStart(2,"0"),q=String(f.getSeconds()).padStart(2,"0");return`${E}:${F}:${q}`}const t=String(e.getHours()).padStart(2,"0"),s=String(e.getMinutes()).padStart(2,"0"),a=String(e.getSeconds()).padStart(2,"0"),o=String(e.getMilliseconds()).padStart(3,"0");return`${t}:${s}:${a}.${o}`}function Ne(n,e){return n.length>e?`${n.slice(0,e)}...`:n}function cn(n){if(n.length===0)return"";const e="▁▂▃▄▅▆▇█",t=Math.max(...n),s=Math.min(...n),a=t-s||1;return n.map(o=>e[Math.min(Math.floor((o-s)/a*7),7)]).join("")}function bs(){const n=document.createElement("div");n.id="__async-dom-devtools__";const e=n.attachShadow({mode:"open"}),t=document.createElement("style");t.textContent=ys,e.appendChild(t);const s=document.createElement("div");s.className="panel collapsed";const a=document.createElement("button");a.className="toggle-tab";const o=document.createElement("span");o.style.cssText="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background-color:#4ec9b0;vertical-align:middle;",a.appendChild(o);const f=document.createElement("span");f.textContent="async-dom ▲",a.appendChild(f),s.appendChild(a);const E=document.createElement("div");E.className="header-bar";const F=document.createElement("span");F.className="header-title",F.textContent="async-dom devtools";const q=document.createElement("span");q.className="import-indicator",q.style.display="none",F.appendChild(q),E.appendChild(F);const j=document.createElement("div");j.className="header-actions";const B=document.createElement("button");B.className="header-btn",B.textContent="⬤",B.title="Highlight DOM updates",B.style.fontSize="8px",B.style.color="#808080",B.addEventListener("click",()=>{yt=!yt,B.style.color=yt?"#4ec9b0":"#808080";const r=ye();r&&r.enableHighlightUpdates(yt)}),j.appendChild(B);const se=document.createElement("button");se.className="header-btn",se.textContent="↓",se.title="Export debug session",j.appendChild(se);const z=document.createElement("button");z.className="header-btn",z.textContent="↑",z.title="Import debug session",j.appendChild(z);const te=document.createElement("button");te.className="header-btn",te.textContent="↻",te.title="Refresh data from workers",j.appendChild(te);const we=document.createElement("button");we.className="header-btn",we.textContent="▼",we.title="Collapse",j.appendChild(we),E.appendChild(j),s.appendChild(E);const he=document.createElement("div");he.className="app-bar",s.appendChild(he);let ge=null;const Te=document.createElement("div");Te.className="tab-bar";const je=["Tree","Performance","Log","Warnings","Graph"],Fe={},Ae={};for(const r of je){const i=document.createElement("button");i.className=`tab-btn${r==="Tree"?" active":""}`,i.textContent=r,i.dataset.tab=r,Te.appendChild(i),Fe[r]=i}s.appendChild(Te);const p=document.createElement("span");p.className="tab-badge",p.style.display="none";let u="Tree";function L(r){u=r;for(const i of je)Fe[i].classList.toggle("active",i===r),Ae[i].classList.toggle("active",i===r);r==="Warnings"&&(Le=0,_t()),Xe()}for(const r of je)Fe[r].addEventListener("click",()=>L(r));const S=document.createElement("div");S.className="tab-content active",S.innerHTML='<div class="tree-empty">Click refresh to load virtual DOM tree from worker.</div>',Ae.Tree=S,s.appendChild(S);const R=document.createElement("div");R.className="tab-content",R.innerHTML='<div class="perf-row"><span class="perf-label">Loading...</span></div>',Ae.Performance=R,s.appendChild(R);const D=document.createElement("div");D.className="tab-content";const G=document.createElement("div");G.className="log-toolbar";const ie=document.createElement("input");ie.className="log-filter",ie.placeholder="Filter...",ie.type="text",G.appendChild(ie);const xe=document.createElement("span");xe.className="log-count",xe.textContent="0",G.appendChild(xe);const Z=document.createElement("button");Z.className="log-btn",Z.textContent="Pause",G.appendChild(Z);const le=document.createElement("button");le.className="log-btn active",le.textContent="Auto-scroll",G.appendChild(le);const V=document.createElement("button");V.className="log-btn",V.textContent="Clear",G.appendChild(V);const ae=document.createElement("button");ae.className="log-btn",ae.textContent="Replay",G.appendChild(ae),D.appendChild(G);const ue=document.createElement("div");ue.className="replay-bar",ue.style.display="none";const Pe=document.createElement("button");Pe.className="replay-btn",Pe.textContent="⏮",ue.appendChild(Pe);const He=document.createElement("button");He.className="replay-btn",He.textContent="◀",ue.appendChild(He);const ne=document.createElement("button");ne.className="replay-btn",ne.textContent="▶",ue.appendChild(ne);const U=document.createElement("button");U.className="replay-btn",U.textContent="▶❘",U.title="Step forward one entry",ue.appendChild(U);const $e=document.createElement("button");$e.className="replay-btn",$e.textContent="⏭",$e.title="Skip to end",ue.appendChild($e);const oe=document.createElement("input");oe.type="range",oe.className="replay-slider",oe.min="0",oe.max="0",oe.value="0",ue.appendChild(oe);const De=document.createElement("span");De.className="replay-position",De.textContent="0 / 0",ue.appendChild(De);const tt=document.createElement("button");tt.className="replay-btn",tt.textContent="1x",ue.appendChild(tt);const ht=document.createElement("button");ht.className="replay-btn replay-exit",ht.textContent="✕ Exit",ue.appendChild(ht);const fe=document.createElement("div");fe.className="log-list",fe.innerHTML='<div class="log-empty">No mutations captured yet.</div>',D.appendChild(fe),D.insertBefore(ue,fe),Ae.Log=D,s.appendChild(D);const nt=document.createElement("div");nt.className="tab-content";const st=document.createElement("div");st.className="log-toolbar";const Ve=document.createElement("input");Ve.className="log-filter",Ve.placeholder="Filter warnings...",Ve.type="text",st.appendChild(Ve);const Ge=document.createElement("button");Ge.className="log-btn warn-view-toggle",Ge.textContent="Chronological",st.appendChild(Ge);const Be=document.createElement("button");Be.className="log-btn",Be.textContent="Clear",st.appendChild(Be),nt.appendChild(st);const ke=document.createElement("div");ke.className="log-list",ke.innerHTML='<div class="warn-empty">No warnings captured yet.</div>',nt.appendChild(ke),Ae.Warnings=nt,s.appendChild(nt);const Oe=document.createElement("div");Oe.className="tab-content",Oe.innerHTML='<div class="graph-empty">No causality data yet. Interact with the app to generate event-mutation data.</div>',Ae.Graph=Oe,s.appendChild(Oe),Fe.Warnings.appendChild(p),e.appendChild(s),document.body.appendChild(n);let ut=null,ft=null,mt=null,gt=!0;const at=[],qt=30;let yt=!1,Tt=null,Nt=null;const ze=[],Ut=60;let A=null,be=null,bt=1;const kt=[1,2,5];let J=null,Ie=null,We=null,qe=!1,Ue=null;function _e(){A&&(oe.max=String(A.entries.length),oe.value=String(A.currentIndex),De.textContent=`${A.currentIndex} / ${A.entries.length}`,ne.textContent=A.isPlaying?"⏸":"▶",ne.classList.toggle("active",A.isPlaying))}function bn(){J||(A=as(Ee),ue.style.display="flex",ae.classList.add("active"),_e(),Ce())}function Mt(){be&&(clearInterval(be),be=null),A&&(A.isPlaying=!1,A=null),ue.style.display="none",ae.classList.remove("active"),Ce()}function Kt(r){const i=ye();if(!(i!=null&&i.replayMutation))return;const C=i.apps()[0];C&&i.replayMutation(r.mutation,C)}function vt(r){if(!A)return;const i=ye();i!=null&&i.clearAndReapply&&i.clearAndReapply(A.entries,r)}function vn(){if(!A)return;const r=rn(A);r&&Kt(r),_e(),Ce()}function xn(){A&&(A.currentIndex>0&&(Pt(A,A.currentIndex-1),vt(A.currentIndex)),_e(),Ce())}function wn(){A&&(os(A),vt(0),_e(),Ce())}function Cn(){A&&(Pt(A,A.entries.length),vt(A.entries.length),_e(),Ce())}function Yt(){if(A){if(A.isPlaying=!A.isPlaying,A.isPlaying){const r=Math.max(50,500/bt);be=setInterval(()=>{if(!A||A.currentIndex>=A.entries.length){A&&(A.isPlaying=!1),be&&(clearInterval(be),be=null),_e();return}const i=rn(A);i&&Kt(i),_e(),Ce()},r)}else be&&(clearInterval(be),be=null);_e()}}function En(){const r=kt.indexOf(bt);bt=kt[(r+1)%kt.length],tt.textContent=`${bt}x`,A!=null&&A.isPlaying&&(be&&(clearInterval(be),be=null),A.isPlaying=!1,Yt())}ae.addEventListener("click",()=>{A?Mt():bn()}),Pe.addEventListener("click",wn),He.addEventListener("click",xn),ne.addEventListener("click",Yt),U.addEventListener("click",vn),$e.addEventListener("click",Cn),oe.addEventListener("input",()=>{if(!A)return;const r=Number(oe.value);Pt(A,r),vt(A.currentIndex),_e(),Ce()}),tt.addEventListener("click",En),ht.addEventListener("click",Mt),se.addEventListener("click",()=>{var w;const r=ye(),i=((w=r==null?void 0:r.scheduler)==null?void 0:w.stats())??{},C=(r==null?void 0:r.getAllAppsData())??{},l=Object.values(C)[0],$=rs({mutationLog:J?J.mutationLog:[...Ee],warningLog:J?J.warningLog:[...Ke],eventLog:J?J.eventLog:[...et],syncReadLog:J?J.syncReadLog:[...Se],schedulerStats:i,tree:l==null?void 0:l.tree,appData:C}),W=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);cs($,`async-dom-session-${W}.json`)}),z.addEventListener("click",()=>{const r=document.createElement("input");r.type="file",r.accept=".json",r.addEventListener("change",()=>{var l;const i=(l=r.files)==null?void 0:l[0];if(!i)return;const C=new FileReader;C.onload=()=>{try{const $=ls(C.result);Sn($)}catch($){console.error("[async-dom devtools] Import failed:",$)}},C.readAsText(i)}),r.click()});function jt(r){V.disabled=r,Z.disabled=r,le.disabled=r,ae.disabled=r,Be.disabled=r;const i=r?"0.4":"1";V.style.opacity=i,Z.style.opacity=i,le.style.opacity=i,ae.style.opacity=i,Be.style.opacity=i,r?(V.style.pointerEvents="none",Z.style.pointerEvents="none",le.style.pointerEvents="none",ae.style.pointerEvents="none",Be.style.pointerEvents="none"):(V.style.pointerEvents="",Z.style.pointerEvents="",le.style.pointerEvents="",ae.style.pointerEvents="",Be.style.pointerEvents="")}function Sn(r){J=r,A&&Mt(),q.textContent="[IMPORTED]",q.style.display="inline",jt(!0);let i=j.querySelector(".close-import-btn");i||(i=document.createElement("button"),i.className="header-btn close-import-btn",i.textContent="✕",i.title="Close imported session",i.style.color="#d7ba7d",i.addEventListener("click",Tn),j.insertBefore(i,j.firstChild)),Xe()}function Tn(){J=null,q.style.display="none",q.textContent="",jt(!1);const r=j.querySelector(".close-import-btn");r&&r.remove(),Xe()}function Nn(){var l;const r=ye();if(!((l=r==null?void 0:r.scheduler)!=null&&l.stats))return;const i=r.scheduler.stats(),C=i.pending;C>1e3||!i.isRunning||i.lastFrameTimeMs>16?o.style.backgroundColor="#f44747":C>100||i.lastFrameTimeMs>12?o.style.backgroundColor="#d7ba7d":o.style.backgroundColor="#4ec9b0"}const kn=setInterval(Nn,2e3);function ye(){return globalThis.__ASYNC_DOM_DEVTOOLS__}function Mn(){s.classList.remove("collapsed"),Vt(),$n()}function Ln(){s.classList.add("collapsed"),Rt()}a.addEventListener("click",Mn),we.addEventListener("click",Ln);function Vt(){const r=ye();r&&(r.refreshDebugData(),setTimeout(()=>{Gt(),Xe()},250))}te.addEventListener("click",Vt);function Gt(){const r=ye();if(!r)return;const i=r.apps();if(i.length<=1){he.classList.remove("visible"),ge=i[0]??null;return}he.classList.add("visible"),he.innerHTML="";const C=document.createElement("span");C.className="app-label",C.textContent="Apps:",he.appendChild(C),(ge===null||!i.includes(ge))&&(ge=i[0]);for(const l of i){const $=document.createElement("button");$.className=`app-btn${l===ge?" active":""}`,$.textContent=l,$.addEventListener("click",()=>{ge=l,Gt(),Xe()}),he.appendChild($)}}function Xe(){u==="Tree"?xt():u==="Performance"?wt():u==="Log"?Ce():u==="Warnings"?Je():u==="Graph"&&Qt()}function Xt(r,i){var M;if(r.innerHTML="",i.id!=null){const d=document.createElement("div");d.className="sidebar-title",d.textContent="Node",r.appendChild(d);const h=document.createElement("div");h.className="sidebar-row",h.innerHTML=`<span class="sidebar-key">_nodeId</span><span class="sidebar-val">${i.id}</span>`,r.appendChild(h)}const C=document.createElement("div");if(C.className="sidebar-row",C.innerHTML=`<span class="sidebar-key">type</span><span class="sidebar-val">${H(i.type)}</span>`,r.appendChild(C),i.tag){const d=document.createElement("div");d.className="sidebar-row",d.innerHTML=`<span class="sidebar-key">tag</span><span class="sidebar-val">${H(i.tag)}</span>`,r.appendChild(d)}const l=((M=i.children)==null?void 0:M.length)??0,$=document.createElement("div");$.className="sidebar-row",$.innerHTML=`<span class="sidebar-key">children</span><span class="sidebar-val">${l}</span>`,r.appendChild($);const W=ye();if(W&&i.id!=null){const d=W.findRealNode(i.id),h=d?d.isConnected:!1,g=document.createElement("div");g.className="sidebar-row",g.innerHTML=`<span class="sidebar-key">isConnected</span><span class="sidebar-val">${h}</span>`,r.appendChild(g)}const w=i.attributes??{},m=Object.keys(w);if(m.length>0){const d=document.createElement("div");d.className="sidebar-title",d.textContent="Attributes",r.appendChild(d);for(const h of m){const g=document.createElement("div");g.className="sidebar-row",g.innerHTML=`<span class="sidebar-key">${H(h)}</span><span class="sidebar-val" title="${H(w[h])}">${H(Ne(w[h],30))}</span>`,r.appendChild(g)}}else if(i.type==="element"){const d=document.createElement("div");d.className="sidebar-title",d.textContent="Attributes",r.appendChild(d);const h=document.createElement("div");h.className="sidebar-empty",h.textContent="none",r.appendChild(h)}if(W&&i.id!=null){const d=W.getListenersForNode(i.id),h=document.createElement("div");if(h.className="sidebar-title",h.textContent=`Event Listeners (${d.length})`,r.appendChild(h),d.length===0){const g=document.createElement("div");g.className="sidebar-empty",g.textContent="none",r.appendChild(g)}else for(const g of d){const T=document.createElement("div");T.className="sidebar-listener",T.innerHTML=`<span class="sidebar-listener-event">${H(g.eventName)}</span><span class="sidebar-listener-id">${H(g.listenerId)}</span>`,r.appendChild(T)}}if(w.style){const d=document.createElement("div");d.className="sidebar-title",d.textContent="Inline Styles",r.appendChild(d);const h=w.style.split(";").filter(g=>g.trim());for(const g of h){const T=g.indexOf(":");if(T===-1)continue;const I=g.slice(0,T).trim(),y=g.slice(T+1).trim(),b=document.createElement("div");b.className="sidebar-row",b.innerHTML=`<span class="sidebar-key">${H(I)}</span><span class="sidebar-val">${H(y)}</span>`,r.appendChild(b)}}if(W&&i.id!=null){const d=W.findRealNode(i.id);if(d&&d.nodeType===1&&typeof getComputedStyle=="function"){const h=getComputedStyle(d),g=["display","position","width","height","margin","padding","color","backgroundColor","fontSize","fontFamily","overflow","visibility","opacity","zIndex"],T=document.createElement("div");T.className="sidebar-title",T.textContent="Computed Styles",r.appendChild(T);for(const I of g){const y=h.getPropertyValue(I.replace(/([A-Z])/g,"-$1").toLowerCase());if(y){const b=document.createElement("div");b.className="sidebar-row",b.innerHTML=`<span class="sidebar-key">${H(I)}</span><span class="sidebar-val sidebar-computed-val">${H(Ne(y,24))}</span>`,r.appendChild(b)}}}}if(i.id!=null){const d=i.id,h=Ee.filter(T=>T.mutation.id===d),g=document.createElement("div");if(g.className="sidebar-title",g.textContent=`Mutation History (${h.length})`,r.appendChild(g),h.length===0){const T=document.createElement("div");T.className="sidebar-empty",T.textContent="none captured",r.appendChild(T)}else{const T=h.slice(-10);for(const I of T){const y=I.mutation;let b="";y.name&&(b+=` ${y.name}`),y.property&&(b+=` .${y.property}`),y.value!==void 0&&(b+=`="${Ne(String(y.value),20)}"`),y.tag&&(b+=` <${y.tag}>`),y.textContent!==void 0&&(b+=` "${Ne(String(y.textContent),20)}"`),y.childId!==void 0&&(b+=` child:${y.childId}`);const k=document.createElement("div");k.className="sidebar-mutation",k.innerHTML=`<span class="sidebar-mut-time">${Ze(I.timestamp)}</span> <span class="sidebar-mut-action">${H(I.action)}</span>`+(b?`<br><span style="color:#808080;font-size:9px;padding-left:4px">${H(b.trim())}</span>`:""),r.appendChild(k)}}}if(i.id!=null){const d=i.id,h=ye();if(h!=null&&h.getMutationCorrelation){const T=h.getMutationCorrelation().getWhyUpdated(d),I=document.createElement("div");if(I.className="why-updated-title",I.textContent=`Why Updated? (${T.length})`,r.appendChild(I),T.length===0){const y=document.createElement("div");y.className="sidebar-empty",y.textContent="no correlation data",r.appendChild(y)}else{const y=T.slice(-8);for(const b of y){const k=document.createElement("div");k.className="why-updated-chain";let x=`<span class="why-chain-mutation">${H(b.action)}</span>`;b.batchUid!=null&&(x+='<span class="why-chain-arrow">→</span>',x+=`<span class="why-chain-batch">Batch #${b.batchUid}</span>`),b.causalEvent?(x+='<span class="why-chain-arrow">→</span>',x+=`<span class="why-chain-event">${H(b.causalEvent.eventType)}</span>`):(x+='<span class="why-chain-arrow">→</span>',x+='<span class="why-chain-none">no event</span>'),k.innerHTML=x,r.appendChild(k)}}}}r.classList.add("visible")}function xt(){if(J){if(J.tree){const y=J.tree,b=document.createElement("div");b.className="tree-with-sidebar";const k=document.createElement("div");k.className="tree-main";const x=document.createElement("div");x.className="tree-refresh-bar";const O=document.createElement("span");O.className="tree-status",O.textContent="Imported session tree (read-only)",x.appendChild(O),k.appendChild(x);const ce=document.createElement("div");ce.className="node-sidebar";const N=ye();N&&Lt(k,y,0,!0,N,ce),b.appendChild(k),b.appendChild(ce),S.innerHTML="",S.appendChild(b)}else S.innerHTML='<div class="tree-empty">Imported session has no tree data.</div>';return}const r=ye();if(!r){S.innerHTML='<div class="tree-empty">Devtools API not available.</div>';return}const i=r.getAllAppsData(),C=Object.keys(i);if(C.length===0){S.innerHTML='<div class="tree-empty">No apps registered. Click ↻ to refresh.</div>';return}const l=ge&&i[ge]?ge:C[0],$=i[l];if(!$||!$.tree){S.innerHTML='<div class="tree-empty">No virtual DOM tree received yet. Click ↻ to refresh.</div>';return}const W=$.tree,w=document.createElement("div");w.className="tree-with-sidebar";const m=document.createElement("div");m.className="tree-main";const M=document.createElement("div");M.className="snapshot-bar";const d=document.createElement("button");if(d.className="snapshot-btn",d.textContent=Ie?We?"Reset Snapshots":"Snapshot B":"Snapshot A",d.addEventListener("click",()=>{Ie&&We?(Ie=null,We=null,qe=!1,Ue=null):Ie?We=Ht(W):Ie=Ht(W),xt()}),M.appendChild(d),Ie&&We){const y=document.createElement("button");y.className="snapshot-btn",y.textContent=qe?"Hide Diff":"Show Diff",y.addEventListener("click",()=>{qe=!qe,qe?Ue=ns(Ie,We):Ue=null,xt()}),M.appendChild(y)}const h=document.createElement("span");h.className="snapshot-info",Ie&&We?(h.textContent="2 snapshots captured",qe&&Ue&&(h.textContent+=gn(Ue)?" (changes found)":" (no changes)")):Ie&&(h.textContent="1 snapshot captured"),M.appendChild(h),m.appendChild(M);const g=document.createElement("div");g.className="tree-refresh-bar";const T=document.createElement("span");T.className="tree-status",T.textContent=`Virtual DOM for app: ${l}`,g.appendChild(T),m.appendChild(g);const I=document.createElement("div");I.className="node-sidebar",qe&&Ue?Jt(m,Ue,0,!0):Lt(m,W,0,!0,r,I),w.appendChild(m),w.appendChild(I),S.innerHTML="",S.appendChild(w),Tt&&Xt(I,Tt)}function Lt(r,i,C,l,$,W){const w=document.createElement("div");w.className=`tree-node${l?" expanded":""}`;const m=document.createElement("div");m.className="tree-line",m.style.paddingLeft=`${C*14}px`;function M(){var O;const x=(O=r.closest(".tree-with-sidebar"))==null?void 0:O.querySelector(".tree-line.selected");x&&x.classList.remove("selected"),m.classList.add("selected"),Tt=i,Xt(W,i)}if(i.type==="text"){const x=document.createElement("span");x.className="tree-toggle",m.appendChild(x);const O=document.createElement("span");if(O.className="tree-text-node",O.textContent=`"${Ne((i.text??"").trim(),50)}"`,m.appendChild(O),i.id!=null){const ce=document.createElement("span");ce.className="tree-nodeid",ce.textContent=`_${i.id}`,m.appendChild(ce)}m.addEventListener("click",M),w.appendChild(m),r.appendChild(w);return}if(i.type==="comment"){const x=document.createElement("span");x.className="tree-toggle",m.appendChild(x);const O=document.createElement("span");O.className="tree-comment",O.textContent=`<!-- ${Ne(i.text??"",40)} -->`,m.appendChild(O),m.addEventListener("click",M),w.appendChild(m),r.appendChild(w);return}const d=i.children??[],h=d.length>0,g=document.createElement("span");g.className="tree-toggle",g.textContent=h?l?"▼":"▶":" ",m.appendChild(g);const T=(i.tag??"???").toLowerCase(),I=document.createElement("span");let y=`<span class="tree-tag">&lt;${H(T)}</span>`;const b=i.attributes??{};if(b.id&&(y+=` <span class="tree-attr-name">id</span>=<span class="tree-attr-value">"${H(b.id)}"</span>`),i.className){const x=Ne(i.className,30);y+=` <span class="tree-attr-name">class</span>=<span class="tree-attr-value">"${H(x)}"</span>`}let k=0;for(const x in b)if(!(x==="id"||x==="class")){if(k>=2)break;y+=` <span class="tree-attr-name">${H(x)}</span>=<span class="tree-attr-value">"${H(Ne(b[x],20))}"</span>`,k++}if(y+='<span class="tree-tag">&gt;</span>',I.innerHTML=y,m.appendChild(I),i.id!=null){const x=document.createElement("span");x.className="tree-nodeid",x.textContent=`_${i.id}`,m.appendChild(x)}if(m.addEventListener("click",x=>{if(h&&x.target===g){w.classList.toggle("expanded"),g.textContent=w.classList.contains("expanded")?"▼":"▶";return}if(M(),i.id!=null){const O=$.findRealNode(i.id);if(O&&"scrollIntoView"in O){O.scrollIntoView({behavior:"smooth",block:"center"});const ce=O.style.outline,N=O.style.outlineOffset;O.style.outline="3px solid #007acc",O.style.outlineOffset="2px",setTimeout(()=>{O.style.outline=ce,O.style.outlineOffset=N},1500)}}}),w.appendChild(m),h){const x=document.createElement("div");x.className="tree-children";for(const O of d)Lt(x,O,C+1,C<2,$,W);w.appendChild(x)}r.appendChild(w)}function Jt(r,i,C,l,$,W){const w=i.node,m=document.createElement("div");m.className=`tree-node${l?" expanded":""}`;const M=document.createElement("div");M.className="tree-line",M.style.paddingLeft=`${C*14}px`,i.diffType==="added"?M.classList.add("diff-added"):i.diffType==="removed"?M.classList.add("diff-removed"):i.diffType==="changed"&&M.classList.add("diff-changed");const d=i.children??[],h=d.length>0;if(w.type==="text"){const k=document.createElement("span");k.className="tree-toggle",M.appendChild(k);const x=document.createElement("span");x.className="tree-text-node",x.textContent=`"${Ne((w.text??"").trim(),50)}"`,M.appendChild(x),At(M,i),m.appendChild(M),r.appendChild(m);return}if(w.type==="comment"){const k=document.createElement("span");k.className="tree-toggle",M.appendChild(k);const x=document.createElement("span");x.className="tree-comment",x.textContent=`<!-- ${Ne(w.text??"",40)} -->`,M.appendChild(x),At(M,i),m.appendChild(M),r.appendChild(m);return}const g=document.createElement("span");g.className="tree-toggle",g.textContent=h?l?"▼":"▶":" ",M.appendChild(g);const T=(w.tag??"???").toLowerCase(),I=document.createElement("span");let y=`<span class="tree-tag">&lt;${H(T)}</span>`;const b=w.attributes??{};if(b.id&&(y+=` <span class="tree-attr-name">id</span>=<span class="tree-attr-value">"${H(b.id)}"</span>`),w.className&&(y+=` <span class="tree-attr-name">class</span>=<span class="tree-attr-value">"${H(Ne(w.className,30))}"</span>`),y+='<span class="tree-tag">&gt;</span>',I.innerHTML=y,M.appendChild(I),w.id!=null){const k=document.createElement("span");k.className="tree-nodeid",k.textContent=`_${w.id}`,M.appendChild(k)}if(At(M,i),h&&g.addEventListener("click",k=>{k.stopPropagation(),m.classList.toggle("expanded"),g.textContent=m.classList.contains("expanded")?"▼":"▶"}),m.appendChild(M),h){const k=document.createElement("div");k.className="tree-children";for(const x of d)Jt(k,x,C+1,C<2);m.appendChild(k)}r.appendChild(m)}function At(r,i){if(i.diffType==="unchanged")return;const C=document.createElement("span");C.className=`diff-marker ${i.diffType}`,i.diffType==="added"?C.textContent="+ADD":i.diffType==="removed"?C.textContent="-DEL":i.diffType==="changed"&&(C.textContent=`~${(i.changes??[]).join(",")}`),r.appendChild(C)}function wt(){if(J){const N=J.schedulerStats;let v='<div class="perf-section-title">Imported Session (read-only)</div>';for(const[P,_]of Object.entries(N))v+=`<div class="perf-row"><span class="perf-label">${H(String(P))}</span><span class="perf-value">${H(String(_))}</span></div>`;v+=`<div class="perf-row"><span class="perf-label">Exported At</span><span class="perf-value">${H(J.exportedAt)}</span></div>`,v+=`<div class="perf-row"><span class="perf-label">Mutations</span><span class="perf-value">${J.mutationLog.length}</span></div>`,v+=`<div class="perf-row"><span class="perf-label">Warnings</span><span class="perf-value">${J.warningLog.length}</span></div>`,v+=`<div class="perf-row"><span class="perf-label">Events</span><span class="perf-value">${J.eventLog.length}</span></div>`,v+=`<div class="perf-row"><span class="perf-label">Sync Reads</span><span class="perf-value">${J.syncReadLog.length}</span></div>`,R.innerHTML=v;return}const r=ye();if(!r){R.innerHTML='<div class="perf-row"><span class="perf-label">Devtools API not available.</span></div>';return}const i=r.scheduler.stats(),C=i.pending;at.push(C),at.length>qt&&at.shift();let l="";l+='<div class="perf-section-title">Scheduler<button class="flush-btn" id="flush-btn">⏩ Flush</button></div>';let $="";C>1e3?$="red":C>100?$="yellow":$="green",l+=`<div class="perf-row"><span class="perf-label">Pending</span><span class="perf-value ${$}">${C}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Frame ID</span><span class="perf-value">${i.frameId}</span></div>`;const W=i.lastFrameTimeMs>16?"red":i.lastFrameTimeMs>12?"yellow":"green";l+=`<div class="perf-row"><span class="perf-label">Frame Time</span><span class="perf-value ${W}">${i.lastFrameTimeMs.toFixed(1)}ms</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Frame Actions</span><span class="perf-value">${i.lastFrameActions}</span></div>`;const w=i.isRunning?"green":"yellow";l+=`<div class="perf-row"><span class="perf-label">Running</span><span class="perf-value ${w}">${i.isRunning?"Yes":"No"}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Last Tick</span><span class="perf-value">${i.lastTickTime>0?`${i.lastTickTime.toFixed(0)}ms`:"N/A"}</span></div>`;const m=i.workerToMainLatencyMs;m>0&&(ze.push(m),ze.length>Ut&&ze.shift());const M=lt(m);l+=`<div class="perf-row"><span class="perf-label">Worker→Main</span><span class="perf-value ${M}">${m>0?`${m.toFixed(1)}ms`:"N/A"}</span></div>`;const d=i.enqueueToApplyMs,h=lt(d);if(l+=`<div class="perf-row"><span class="perf-label">Enqueue→Apply</span><span class="perf-value ${h}">${d>0?`${d.toFixed(1)}ms`:"N/A"}</span></div>`,ze.length>0){const N=an(ze);l+=`<div class="perf-row"><span class="perf-label">Latency P50</span><span class="perf-value ${lt(N.p50)}">${N.p50.toFixed(1)}ms</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Latency P95</span><span class="perf-value ${lt(N.p95)}">${N.p95.toFixed(1)}ms</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Latency P99</span><span class="perf-value ${lt(N.p99)}">${N.p99.toFixed(1)}ms</span></div>`}ze.length>1&&(l+=`<div class="perf-row"><span class="perf-label">Latency (${Ut})</span><span class="perf-sparkline">${cn(ze)}</span></div>`);const g=i.droppedFrameCount,T=g>0?"red":"green";l+=`<div class="perf-row"><span class="perf-label">Dropped Frames</span><span class="perf-value ${T}">${g}</span></div>`,at.length>1&&(l+=`<div class="perf-row"><span class="perf-label">Queue (${qt}f)</span><span class="sparkline-with-threshold"><span class="perf-sparkline">${cn(at)}</span><span class="sparkline-threshold"></span></span></div>`);const I=r.apps();l+=`<div class="perf-row"><span class="perf-label">Apps</span><span class="perf-value">${I.length}</span></div>`;const y=r.getAllAppsData();for(const N of I){const v=y[N];if(!(v!=null&&v.workerStats))continue;const P=v.workerStats;l+=`<div class="perf-section-title">Worker: ${H(N)}</div>`,l+=`<div class="perf-row"><span class="perf-label">Mutations Added</span><span class="perf-value">${P.added}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Mutations Coalesced</span><span class="perf-value">${P.coalesced}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Mutations Flushed</span><span class="perf-value">${P.flushed}</span></div>`;const _=P.added>0?(P.coalesced/P.added*100).toFixed(1):"0.0",K=Number.parseFloat(_)>50?"green":Number.parseFloat(_)>20?"yellow":"";l+=`<div class="perf-row"><span class="perf-label">Coalescing Ratio</span><span class="perf-value ${K}">${_}%</span></div>`}if(r.debugStats){const N=r.debugStats();l+='<div class="perf-section-title">Main Thread Stats</div>';const v=[["mutationsAdded","Mutations Added"],["mutationsCoalesced","Mutations Coalesced"],["mutationsFlushed","Mutations Flushed"],["mutationsApplied","Mutations Applied"],["eventsForwarded","Events Forwarded"],["eventsDispatched","Events Dispatched"],["syncReadRequests","Sync Read Requests"],["syncReadTimeouts","Sync Read Timeouts"]];for(const[P,_]of v){const K=N[P]??0,Y=P==="syncReadTimeouts"&&K>0?"red":"";l+=`<div class="perf-row"><span class="perf-label">${H(_)}</span><span class="perf-value ${Y}">${K}</span></div>`}}const b=r.scheduler.frameLog();if(b.length>0){l+='<div class="frame-section-title">Frames</div>';const N=16;for(const v of b){const P=Math.min(v.totalMs/N*100,100),_=v.totalMs/N;let K;_>1?K="red":_>.5?K="yellow":K="green";const Y=v.totalMs>N?" !":"";if(l+=`<div class="frame-bar-row" data-frame-id="${v.frameId}">`,l+=`<span class="frame-label">#${v.frameId}</span>`,l+=`<span class="frame-bar-track"><span class="frame-bar-fill ${K}" style="width:${P.toFixed(1)}%"></span></span>`,l+=`<span class="frame-info">${v.totalMs.toFixed(1)}ms / ${N}ms (${v.actionCount})${Y}</span>`,l+="</div>",Nt===v.frameId){l+='<div class="frame-detail">';const X=[...v.timingBreakdown.entries()].sort((de,Q)=>Q[1]-de[1]);for(const[de,Q]of X)l+=`<div class="frame-detail-row"><span class="frame-detail-action">${H(de)}</span><span class="frame-detail-time">${Q.toFixed(2)}ms</span></div>`;l+="</div>"}}}for(const N of I){const v=y[N];if(!(v!=null&&v.perTypeCoalesced))continue;const P=v.perTypeCoalesced,_=Object.keys(P);if(_.length!==0){l+=`<div class="perf-section-title">Coalescing: ${H(N)}</div>`;for(const K of _){const Y=P[K],X=Y.added>0?(Y.coalesced/Y.added*100).toFixed(0):"0";l+='<div class="coalesce-row">',l+=`<span class="coalesce-action">${H(K)}</span>`,l+=`<span class="coalesce-detail">${Y.added} added, ${Y.coalesced} coalesced</span>`,l+=`<span class="coalesce-pct">(${X}%)</span>`,l+="</div>"}}}if(r.getWorkerPerfEntries){const N=r.getWorkerPerfEntries(),v=Object.keys(N);for(const P of v){const _=N[P];if(!_||_.length===0)continue;l+=`<div class="perf-section-title">Worker CPU: ${H(P)}</div>`;const K=_.reduce((ee,me)=>ee+me.duration,0),Y=Math.max(..._.map(ee=>ee.duration)),X=_.filter(ee=>ee.name.includes(":event:")),de=_.filter(ee=>ee.name.includes(":flush:")),Q=X.reduce((ee,me)=>ee+me.duration,0),pe=de.reduce((ee,me)=>ee+me.duration,0);l+=`<div class="worker-util"><span class="worker-util-label">Total worker time: </span><span class="worker-util-value">${K.toFixed(1)}ms</span></div>`,l+=`<div class="worker-util"><span class="worker-util-label">Event handlers: </span><span class="worker-util-value">${Q.toFixed(1)}ms (${X.length} calls)</span></div>`,l+=`<div class="worker-util"><span class="worker-util-label">Flush/coalesce: </span><span class="worker-util-value">${pe.toFixed(1)}ms (${de.length} calls)</span></div>`;const ve=_.slice().sort((ee,me)=>me.duration-ee.duration).slice(0,10);for(const ee of ve){const me=Y>0?Math.max(ee.duration/Y*100,2):0,rt=ee.name.replace("async-dom:","");l+='<div class="worker-perf-bar">',l+=`<span class="worker-perf-name" title="${H(ee.name)}">${H(rt)}</span>`,l+=`<span class="worker-perf-track"><span class="worker-perf-fill" style="width:${me.toFixed(1)}%"></span></span>`,l+=`<span class="worker-perf-duration">${ee.duration.toFixed(2)}ms</span>`,l+="</div>"}}}if(b.length>0){const N=b.filter(v=>v.perApp&&v.perApp.size>0);if(N.length>0){l+='<div class="perf-section-title">Multi-App Interleaving</div>';const v=new Set;for(const Y of N)if(Y.perApp)for(const X of Y.perApp.keys())v.add(X);const P=new Map,_=["#569cd6","#4ec9b0","#d7ba7d","#c586c0","#f44747","#ce9178","#6a9955"];let K=0;for(const Y of v)P.set(Y,_[K%_.length]),K++;l+='<div class="multiapp-legend">';for(const[Y,X]of P)l+=`<span class="multiapp-legend-item"><span class="multiapp-legend-dot" style="background:${X}"></span>${H(Y)}</span>`;l+="</div>";for(const Y of N.slice(-20)){const X=Y.perApp;let de=0,Q=0;for(const[,pe]of X)de+=pe.mutations,Q+=pe.deferred;if(de!==0){l+='<div class="multiapp-frame">',l+=`<span class="multiapp-frame-label">#${Y.frameId}</span>`,l+='<span class="multiapp-stacked-bar">';for(const[pe,ve]of X){const ee=ve.mutations/de*100,me=P.get(pe)??"#569cd6";l+=`<span class="multiapp-segment" style="width:${ee.toFixed(1)}%;background:${me}" title="${H(pe)}: ${ve.mutations} muts, ${ve.deferred} deferred"></span>`}l+="</span>",l+=`<span class="multiapp-info">${de} muts${Q>0?` (${Q} def)`:""}</span>`,l+="</div>"}}}}if(Ee.length>0){const N=new Map;for(const _ of Ee)N.set(_.action,(N.get(_.action)??0)+1);const v=[...N.entries()].sort((_,K)=>K[1]-_[1]),P=v.length>0?v[0][1]:1;l+='<div class="perf-section-title">Mutation Types</div>';for(const[_,K]of v){const Y=Math.max(K/P*100,2);l+='<div class="chart-bar-row">',l+=`<span class="chart-bar-label">${H(_)}</span>`,l+=`<span class="chart-bar-track"><span class="chart-bar-fill" style="width:${Y.toFixed(1)}%"></span></span>`,l+=`<span class="chart-bar-value">${K}</span>`,l+="</div>"}}if(Se.length>0){const N=Se.length,v=Se.filter(Q=>Q.result==="timeout").length,P=N>0?(v/N*100).toFixed(1):"0.0",_=Se.map(Q=>Q.latencyMs),K=an(_);l+='<div class="perf-section-title">Sync Reads</div>',l+=`<div class="perf-row"><span class="perf-label">Total</span><span class="perf-value">${N}</span></div>`;const Y=v>0?"red":"green";l+=`<div class="perf-row"><span class="perf-label">Timeout Rate</span><span class="perf-value ${Y}">${P}% (${v})</span></div>`,l+=`<div class="perf-row"><span class="perf-label">P95 Latency</span><span class="perf-value ${on(K.p95)}">${K.p95.toFixed(1)}ms</span></div>`,l+='<div class="heatmap-container">';const X=Se.slice(-100),de=["boundingRect","computedStyle","nodeProperty","windowProperty"];for(let Q=0;Q<X.length;Q++){const pe=X[Q],ve=on(pe.latencyMs),ee=de[pe.queryType]??`query:${pe.queryType}`;l+=`<div class="heatmap-block ${ve}" data-sync-read-idx="${Q}" title="${pe.latencyMs.toFixed(1)}ms ${ee} node=${pe.nodeId} ${pe.result}"></div>`}l+="</div>"}if(r.getTransportStats){const N=r.getTransportStats(),v=Object.keys(N);if(v.length>0){l+='<div class="perf-section-title">Transport</div>';for(const P of v){const _=N[P];if(!_)continue;v.length>1&&(l+=`<div class="perf-row"><span class="perf-label" style="font-weight:600">App: ${H(P)}</span><span class="perf-value"></span></div>`),l+=`<div class="perf-row"><span class="perf-label">Messages Sent</span><span class="perf-value">${_.messageCount}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Total Bytes</span><span class="perf-value">${Et(_.totalBytes)}</span></div>`;const K=_.messageCount>0?Math.round(_.totalBytes/_.messageCount):0;l+=`<div class="perf-row"><span class="perf-label">Avg Message Size</span><span class="perf-value">${Et(K)}</span></div>`;const Y=_.largestMessageBytes>102400?"red":"",X=_.largestMessageBytes>102400?'<span class="transport-warn">[!] exceeds 100KB</span>':"";l+=`<div class="perf-row"><span class="perf-label">Largest Message</span><span class="perf-value ${Y}">${Et(_.largestMessageBytes)}${X}</span></div>`;const de=_.lastMessageBytes>102400?"red":"",Q=_.lastMessageBytes>102400?'<span class="transport-warn">[!] exceeds 100KB</span>':"";l+=`<div class="perf-row"><span class="perf-label">Last Message</span><span class="perf-value ${de}">${Et(_.lastMessageBytes)}${Q}</span></div>`}}}R.innerHTML=l;const k=R.querySelectorAll(".heatmap-block"),x=["boundingRect","computedStyle","nodeProperty","windowProperty"];for(const N of k)N.addEventListener("click",v=>{const P=v.currentTarget,_=P.querySelector(".heatmap-tooltip");if(_){_.remove();return}for(const pe of k){const ve=pe.querySelector(".heatmap-tooltip");ve&&ve.remove()}const K=Number(P.dataset.syncReadIdx),X=Se.slice(-100)[K];if(!X)return;const de=x[X.queryType]??`query:${X.queryType}`,Q=document.createElement("div");Q.className="heatmap-tooltip",Q.textContent=`${de} node=${X.nodeId} ${X.latencyMs.toFixed(1)}ms ${X.result}`,P.appendChild(Q)});const O=R.querySelector("#flush-btn");O&&O.addEventListener("click",N=>{N.stopPropagation();const v=ye();v&&v.scheduler.flush(),wt()});const ce=R.querySelectorAll(".frame-bar-row");for(const N of ce)N.addEventListener("click",()=>{const v=Number(N.dataset.frameId);Nt=Nt===v?null:v,wt()})}function Qt(){const r=ye();if(!(r!=null&&r.getCausalityTracker)){Oe.innerHTML='<div class="graph-empty">Causality tracker not available.</div>';return}const C=r.getCausalityTracker().buildGraph();if(C.roots.length===0){Oe.innerHTML='<div class="graph-empty">No causality data yet. Interact with the app to generate event-to-mutation data.</div>';return}Oe.innerHTML="";const l=document.createElement("div");l.className="graph-container";for(const $ of C.roots)Zt(l,C,$,0);Oe.appendChild(l)}function Zt(r,i,C,l){const $=i.nodes.get(C);if(!$)return;const W=document.createElement("div");W.style.paddingLeft=`${l*16}px`;const w=document.createElement("div");let m="graph-node";$.type==="event"?m+=" event-node":$.type==="batch"?m+=" batch-node":m+=" dom-node",w.className=m;const M=document.createElement("span");M.className=`graph-node-type ${$.type}`,M.textContent=$.type==="event"?"EVT":$.type==="batch"?"BAT":"NOD",w.appendChild(M);const d=document.createElement("span");if(d.className="graph-node-label",d.textContent=$.label,w.appendChild(d),W.appendChild(w),r.appendChild(W),$.children.length>0){const h=document.createElement("div");h.className="graph-children";for(const g of $.children)Zt(h,i,g,l+1);r.appendChild(h)}}let Ct=0,$t=!1;Z.addEventListener("click",()=>{Ye=!Ye,Z.textContent=Ye?"Resume":"Pause",Z.classList.toggle("active",Ye)}),le.addEventListener("click",()=>{gt=!gt,le.classList.toggle("active",gt)});function An(r){switch(r){case"createNode":case"createComment":case"appendChild":case"bodyAppendChild":case"headAppendChild":case"insertBefore":return"color-green";case"setAttribute":case"removeAttribute":case"setStyle":case"setClassName":case"setProperty":case"setTextContent":case"setHTML":case"insertAdjacentHTML":return"color-blue";case"removeNode":case"removeChild":return"color-red";default:return""}}function en(r){const i=document.createElement("div"),C=An(r.action);i.className=`log-entry${C?` ${C}`:""}`;const l=document.createElement("span");l.className="log-time",l.textContent=Ze(r.timestamp),i.appendChild(l);const $=document.createElement("span");$.className="log-action",$.textContent=r.action,i.appendChild($);const W=document.createElement("span");W.className="log-detail";const w="id"in r.mutation?r.mutation.id:void 0;let m=w!=null?`#${w}`:"";const M=r.mutation;return M.tag&&(m+=` tag=${M.tag}`),M.name&&r.action!=="addEventListener"&&(m+=` ${M.name}`),M.property&&(m+=` ${M.property}`),W.textContent=m,i.appendChild(W),i}function Ce(){const r=J?J.mutationLog:Ee,i=J?J.eventLog:et,C=J?J.syncReadLog:Se,l=A?A.entries.slice(0,A.currentIndex):r;if(xe.textContent=String(l.length),l.length===0){if(Ct!==0||A){const d=A?"Replay position: 0. Step forward to see mutations.":"No mutations captured yet.";fe.innerHTML=`<div class="log-empty">${d}</div>`,Ct=0}return}const $=ie.value.toLowerCase().trim(),W=document.createDocumentFragment(),w=[];let m=null;for(const d of l){if($&&!d.action.toLowerCase().includes($))continue;const h=d.batchUid;h!=null&&m!==null&&m.batchUid===h?m.entries.push(d):(m={batchUid:h,entries:[d]},w.push(m))}for(const d of w){if(d.batchUid==null||d.entries.length<=1){for(const k of d.entries)W.appendChild(en(k));continue}const h=document.createElement("div");h.className="batch-group";const g=document.createElement("div");g.className="batch-header";const T=document.createElement("span");T.className="batch-toggle",T.textContent="▶",g.appendChild(T);const I=document.createElement("span");I.className="batch-uid",I.textContent=`Batch #${d.batchUid}`,g.appendChild(I);const y=document.createElement("span");y.className="batch-count",y.textContent=`— ${d.entries.length} mutations`,g.appendChild(y),g.addEventListener("click",()=>{h.classList.toggle("expanded"),T.textContent=h.classList.contains("expanded")?"▼":"▶"}),h.appendChild(g);const b=document.createElement("div");b.className="batch-entries";for(const k of d.entries)b.appendChild(en(k));h.appendChild(b),W.appendChild(h)}if(fe.innerHTML="",fe.appendChild(W),A&&A.currentIndex>0){const d=fe.querySelectorAll(".log-entry"),h=A.currentIndex-1;h<d.length&&(d[h].classList.add("replay-highlight"),d[h].scrollIntoView({block:"nearest"}))}const M=ye();if(M){const d=M.getEventTraces();if(d.length>0){const h=document.createElement("div");h.className="event-trace-section";const g=document.createElement("div");g.className="event-trace-title",g.textContent=`Event Round-Trips (${d.length})`,h.appendChild(g);const T=d.slice(-20);let I=1;for(const y of T){const b=y.serializeMs+(y.transportMs??0)+(y.dispatchMs??0);b>I&&(I=b)}for(const y of T){const b=y.serializeMs,k=y.transportMs??0,x=y.dispatchMs??0,O=y.mutationCount??Ee.filter(me=>me.timestamp>=y.timestamp&&me.timestamp<=y.timestamp+100).length,ce=b+k+x,N=120/(I||1),v=document.createElement("div");v.className="event-timeline";const P=document.createElement("span");P.className="event-trace-type",P.style.cssText="width:60px;flex-shrink:0;font-size:10px;overflow:hidden;text-overflow:ellipsis;",P.textContent=`[${y.eventType}]`,v.appendChild(P);const _=document.createElement("span");_.className="event-phase serialize",_.style.width=`${Math.max(b*N,4)}px`,_.title=`serialize: ${b.toFixed(1)}ms`,v.appendChild(_);const K=document.createElement("span");K.className="event-phase-label",K.textContent=`${b.toFixed(1)}ms`,v.appendChild(K);const Y=document.createElement("span");Y.className="event-phase-label",Y.textContent="→",v.appendChild(Y);const X=document.createElement("span");X.className="event-phase transport",X.style.width=`${Math.max(k*N,4)}px`,X.title=`transport: ${k.toFixed(1)}ms`,v.appendChild(X);const de=document.createElement("span");de.className="event-phase-label",de.textContent=`${k.toFixed(1)}ms`,v.appendChild(de);const Q=document.createElement("span");Q.className="event-phase-label",Q.textContent="→",v.appendChild(Q);const pe=document.createElement("span");pe.className="event-phase dispatch",pe.style.width=`${Math.max(x*N,4)}px`,pe.title=`dispatch: ${x.toFixed(1)}ms`,v.appendChild(pe);const ve=document.createElement("span");if(ve.className="event-phase-label",ve.textContent=`${x.toFixed(1)}ms`,v.appendChild(ve),O>0){const me=document.createElement("span");me.className="event-phase-label",me.textContent="→",v.appendChild(me);const rt=document.createElement("span");rt.className="event-mutation-count",rt.textContent=`${O} mut${O!==1?"s":""}`,v.appendChild(rt)}const ee=document.createElement("div");ee.className="event-timeline-detail",ee.innerHTML=`<div><strong>${H(y.eventType)}</strong> total: ${ce.toFixed(1)}ms</div><div>main:serialize ${b.toFixed(2)}ms</div><div>transport ${k.toFixed(2)}ms</div><div>worker:dispatch ${x.toFixed(2)}ms</div><div>mutations generated: ${O}</div>`,v.addEventListener("click",()=>{ee.classList.toggle("visible")}),h.appendChild(v),h.appendChild(ee)}fe.appendChild(h)}}if(i.length>0){const d=document.createElement("div");d.className="log-section-title",d.textContent=`Events (${i.length})`,fe.appendChild(d);const h=i.slice(-50);for(const g of h){const T=document.createElement("div");T.className="log-entry event-entry";const I=document.createElement("span");I.className="log-time",I.textContent=Ze(g.timestamp),T.appendChild(I);const y=document.createElement("span");y.className="log-action",y.textContent=g.eventType,T.appendChild(y);const b=document.createElement("span");b.className="log-detail",b.textContent=`${g.phase}→${g.phase==="serialize"?"dispatch":"done"} targetId=${g.targetId??"?"}`,T.appendChild(b),fe.appendChild(T)}}if(C.length>0){const d=document.createElement("div");d.className="log-section-title",d.textContent=`Sync Reads (${C.length})`,fe.appendChild(d);const h=C.slice(-50);for(const g of h){const T=document.createElement("div");T.className="log-entry syncread-entry";const I=document.createElement("span");I.className="log-time",I.textContent=Ze(g.timestamp),T.appendChild(I);const y=document.createElement("span");y.className="log-action";const b=["boundingRect","computedStyle","nodeProperty","windowProperty"];y.textContent=b[g.queryType]??`query:${g.queryType}`,T.appendChild(y);const k=document.createElement("span");k.className="log-detail",k.textContent=`node=${g.nodeId} ${g.latencyMs.toFixed(1)}ms ${g.result}`,T.appendChild(k),fe.appendChild(T)}}{const d=document.createElement("div");d.className="coalesced-toggle";const h=document.createElement("input");h.type="checkbox",h.id="coalesced-toggle-cb",h.checked=$t;const g=document.createElement("label");if(g.htmlFor="coalesced-toggle-cb",g.textContent="Show coalesced",d.appendChild(h),d.appendChild(g),fe.appendChild(d),h.addEventListener("change",()=>{$t=h.checked,Ce()}),$t){const T=M?M.getAllAppsData():{};let I=[];for(const b of Object.values(T))b!=null&&b.coalescedLog&&Array.isArray(b.coalescedLog)&&(I=I.concat(b.coalescedLog));I.sort((b,k)=>k.timestamp-b.timestamp);const y=I.slice(0,50);if(y.length>0){const b=document.createElement("div");b.className="log-section-title",b.textContent=`Coalesced (${y.length} of ${I.length})`,fe.appendChild(b);for(const k of y){const x=document.createElement("div");x.className="coalesced-entry";const O=document.createElement("span");O.className="log-time",O.textContent=Ze(k.timestamp),x.appendChild(O);const ce=document.createElement("span");ce.className="log-action",ce.textContent=k.action,x.appendChild(ce);const N=document.createElement("span");N.className="log-detail",N.textContent=k.key,x.appendChild(N),fe.appendChild(x)}}}}gt&&!A&&(fe.scrollTop=fe.scrollHeight),Ct=l.length}ie.addEventListener("input",Ce),V.addEventListener("click",()=>{Ee.length=0,Ct=0,fe.innerHTML='<div class="log-empty">No mutations captured yet.</div>',xe.textContent="0"});let Re=0,ot="grouped";const It=new Set;Ge.addEventListener("click",()=>{ot=ot==="grouped"?"chronological":"grouped",Ge.textContent=ot==="grouped"?"Chronological":"Grouped",Ge.classList.toggle("active",ot==="chronological"),Re=-1,Je()}),Ve.addEventListener("input",()=>{Re=-1,Je()});function tn(r){const i=document.createElement("div");i.className="warn-entry";const C=document.createElement("span");C.className="warn-time",C.textContent=Ze(r.timestamp),i.appendChild(C);const l=document.createElement("span");l.className=`warn-code ${r.code}`,l.textContent=r.code,i.appendChild(l);const $=document.createElement("span");$.className="warn-msg";const W=r.message.split(`
`)[0],w=r.message.includes(`
`);if($.textContent=W,i.appendChild($),w){i.style.cursor="pointer";const m=document.createElement("pre");m.className="warn-stack",m.textContent=r.message,m.style.display="none",i.appendChild(m),i.addEventListener("click",()=>{m.style.display=m.style.display==="none"?"block":"none"})}return i}function Je(){const r=J?J.warningLog:Ke;if(r.length===0){Re!==0&&(ke.innerHTML='<div class="warn-empty">No warnings captured yet.</div>',Re=0);return}if(r.length===Re)return;const i=Ve.value.toLowerCase().trim(),C=document.createDocumentFragment(),l=i?r.filter(w=>w.code.toLowerCase().includes(i)||w.message.toLowerCase().includes(i)):r,$=l.filter(w=>!It.has(w.code)),W=l.length-$.length;if(ot==="chronological")for(const w of $)C.appendChild(tn(w));else{const w=new Map;for(const m of $){let M=w.get(m.code);M||(M=[],w.set(m.code,M)),M.push(m)}for(const[m,M]of w){const d=document.createElement("div");d.className="warn-group";const h=document.createElement("div");h.className="warn-group-header";const g=document.createElement("span");g.className="warn-group-toggle",g.textContent="▶",h.appendChild(g);const T=document.createElement("span");T.className=`warn-group-code warn-code ${m}`,T.textContent=m,h.appendChild(T);const I=document.createElement("span");I.className="warn-group-count",I.textContent=`(${M.length})`,h.appendChild(I);const y=document.createElement("button");y.className="warn-suppress-btn",y.textContent="Suppress",y.addEventListener("click",x=>{x.stopPropagation(),It.add(m),Re=-1,Je()}),h.appendChild(y),h.addEventListener("click",()=>{d.classList.toggle("expanded"),g.textContent=d.classList.contains("expanded")?"▼":"▶"}),d.appendChild(h);const b=Rn[m];if(b){const x=document.createElement("div");x.className="warn-group-doc";const O=document.createElement("div");O.className="warn-group-desc",O.textContent=b.description,x.appendChild(O);const ce=document.createElement("div");ce.className="warn-group-suggestion",ce.textContent=`Suggestion: ${b.suggestion}`,x.appendChild(ce),d.appendChild(x)}const k=document.createElement("div");k.className="warn-group-entries";for(const x of M)k.appendChild(tn(x));d.appendChild(k),C.appendChild(d)}}if(ke.innerHTML="",ke.appendChild(C),W>0){const w=document.createElement("div");w.className="warn-suppressed-note",w.textContent=`${W} suppressed warning${W!==1?"s":""} hidden`;const m=document.createElement("button");m.className="warn-suppress-btn",m.textContent="Show all",m.style.marginLeft="8px",m.addEventListener("click",()=>{It.clear(),Re=-1,Je()}),w.appendChild(m),ke.appendChild(w)}ke.scrollTop=ke.scrollHeight,Re=r.length}Be.addEventListener("click",()=>{Ke.length=0,Le=0,Re=0,ke.innerHTML='<div class="warn-empty">No warnings captured yet.</div>',_t()});function _t(){Le>0&&u!=="Warnings"?(p.textContent=String(Le>99?"99+":Le),p.style.display="inline-block"):p.style.display="none",f.textContent=Le>0?`async-dom (${Le>99?"99+":Le}) ▲`:"async-dom ▲"}ct=_t;function $n(){Rt(),ut=setInterval(()=>{if(u==="Tree"){const r=ye();r&&r.refreshDebugData(),setTimeout(xt,250)}},2e3),ft=setInterval(()=>{if(u==="Performance"){const r=ye();r&&r.refreshDebugData(),setTimeout(wt,250)}},1e3),mt=setInterval(()=>{u==="Log"&&Ce(),u==="Warnings"&&Je(),u==="Graph"&&Qt()},500),Xe()}function Rt(){ut&&(clearInterval(ut),ut=null),ft&&(clearInterval(ft),ft=null),mt&&(clearInterval(mt),mt=null)}return{destroy(){Rt(),be&&(clearInterval(be),be=null),clearInterval(kn),ct=null,Ee.length=0,Ke.length=0,et.length=0,Se.length=0,Le=0,n.remove()}}}const vs=100;class xs{constructor(e,t){c(this,"listeners",new Map);c(this,"eventConfig",new Map);c(this,"nodeCache");c(this,"transport",null);c(this,"appId");c(this,"eventTraces",[]);c(this,"_onTimingResult",null);this.appId=e,this.nodeCache=t??new Wt}set onTimingResult(e){this._onTimingResult=e}setTransport(e){this.transport=e}setNodeCache(e){this.nodeCache=e}configureEvent(e,t,s){if(this.eventConfig.set(`${e}_${t}`,s),s.preventDefault&&dn(t)){for(const[a,o]of this.listeners.entries())if(o.nodeId===e&&o.eventName===t){o.controller.abort(),this.attach(e,t,a);break}}}attach(e,t,s){const a=this.nodeCache.get(e);if(!a)return;const o=new AbortController;this.listeners.set(s,{controller:o,nodeId:e,eventName:t});const f=this._isPassiveForListener(s,t);a.addEventListener(t,E=>{var te;const F=`${e}_${t}`,q=this.eventConfig.get(F);q!=null&&q.preventDefault&&E.preventDefault();const j=performance.now(),B=Cs(E),se=performance.now()-j,z=Date.now();this.eventTraces.push({eventType:E.type,listenerId:s,serializeMs:se,timestamp:performance.now(),sentAt:z}),this.eventTraces.length>vs&&this.eventTraces.shift(),(te=this.transport)==null||te.send({type:"event",appId:this.appId,listenerId:s,event:B})},{signal:o.signal,passive:f})}detach(e){const t=this.listeners.get(e);t&&(t.controller.abort(),this.listeners.delete(e))}detachByNodeId(e){for(const[t,s]of this.listeners)s.nodeId===e&&(s.controller.abort(),this.listeners.delete(t))}getEventTraces(){return this.eventTraces.slice()}updateTraceWithWorkerTiming(e,t,s){var o;const a=Date.now();for(let f=this.eventTraces.length-1;f>=0;f--){const E=this.eventTraces[f];if(E.listenerId===e&&E.transportMs===void 0){E.transportMs=Math.max(0,a-E.sentAt-t),E.dispatchMs=t,E.mutationCount=s,(o=this._onTimingResult)==null||o.call(this,E);return}}}getListenersForNode(e){const t=[];for(const[s,a]of this.listeners)a.nodeId===e&&t.push({listenerId:s,eventName:a.eventName});return t}detachAll(){for(const e of this.listeners.values())e.controller.abort();this.listeners.clear()}_isPassiveForListener(e,t){for(const[s,a]of this.eventConfig.entries())if(s.endsWith(`_${t}`)&&a.preventDefault)return!1;return dn(t)}}const ws=new Set(["scroll","touchstart","touchmove","wheel","mousewheel"]);function dn(n){return ws.has(n)}function St(n){if(!n)return null;const e=n.__asyncDomId;return e!=null?String(e):n.getAttribute("data-async-dom-id")??n.id??null}function Cs(n){var o;const e=((o=n.composedPath)==null?void 0:o.call(n)[0])??n.target,t={type:n.type,target:St(e),currentTarget:St(n.currentTarget),bubbles:n.bubbles,cancelable:n.cancelable,composed:n.composed,eventPhase:n.eventPhase,isTrusted:n.isTrusted,timeStamp:n.timeStamp};n.type==="click"&&(n.target instanceof HTMLAnchorElement||n.currentTarget instanceof HTMLAnchorElement)&&n.preventDefault(),n instanceof MouseEvent&&(t.clientX=n.clientX,t.clientY=n.clientY,t.pageX=n.pageX,t.pageY=n.pageY,t.screenX=n.screenX,t.screenY=n.screenY,t.offsetX=n.offsetX,t.offsetY=n.offsetY,t.button=n.button,t.buttons=n.buttons,t.altKey=n.altKey,t.ctrlKey=n.ctrlKey,t.metaKey=n.metaKey,t.shiftKey=n.shiftKey,t.relatedTarget=St(n.relatedTarget),t.detail=n.detail),n instanceof KeyboardEvent&&(t.key=n.key,t.code=n.code,t.keyCode=n.keyCode,t.altKey=n.altKey,t.ctrlKey=n.ctrlKey,t.metaKey=n.metaKey,t.shiftKey=n.shiftKey),n instanceof InputEvent&&(t.data=n.data??void 0,t.inputType=n.inputType);const s=n.target;s instanceof HTMLInputElement?(t.value=s.value,t.checked=s.checked):s instanceof HTMLTextAreaElement?t.value=s.value:s instanceof HTMLSelectElement&&(t.value=s.value,t.selectedIndex=s.selectedIndex);const a=n.target;return a instanceof HTMLMediaElement&&(t.currentTime=a.currentTime,t.duration=Number.isFinite(a.duration)?a.duration:0,t.paused=a.paused,t.ended=a.ended,t.readyState=a.readyState),n instanceof FocusEvent&&(t.relatedTarget=n.relatedTarget instanceof Element?St(n.relatedTarget):null),n instanceof WheelEvent&&Object.assign(t,{deltaX:n.deltaX,deltaY:n.deltaY,deltaZ:n.deltaZ,deltaMode:n.deltaMode}),t}const Es=new Set(["script","iframe","object","embed","form","base","meta","link","style"]),Ss=/^on/i,Ts=new Set(["href","src","data","action","formaction","xlink:href"]),Ns=new Set(["srcdoc","formaction"]);function ks(n){const e=n.trim().toLowerCase();return/^\s*javascript\s*:/i.test(e)||/^\s*vbscript\s*:/i.test(e)||/^\s*data\s*:\s*text\/html/i.test(e)}function pn(n){const s=new DOMParser().parseFromString(`<body>${n}</body>`,"text/html").body;return yn(s),s.innerHTML}function yn(n){const e=Array.from(n.childNodes);for(const t of e)if(t.nodeType===Node.ELEMENT_NODE){const s=t,a=s.tagName.toLowerCase();if(Es.has(a)){s.remove();continue}const o=[];for(let f=0;f<s.attributes.length;f++){const E=s.attributes[f],F=E.name.toLowerCase();(Ss.test(F)||Ns.has(F)||Ts.has(F)&&ks(E.value))&&o.push(E.name)}for(const f of o)s.removeAttribute(f);yn(s)}}const Ms=new Set(["srcdoc","formaction"]),Ls=new Set(["href","src","data","action","xlink:href"]);function As(n){const e=n.trim().toLowerCase();return/^\s*javascript\s*:/i.test(e)||/^\s*vbscript\s*:/i.test(e)||/^\s*data\s*:\s*text\/html/i.test(e)}const $s={allowHeadAppend:!1,allowBodyAppend:!1,allowNavigation:!0,allowScroll:!0,allowUnsafeHTML:!1},Is=new Set(["value","checked","disabled","selectedIndex","indeterminate","readOnly","required","placeholder","type","name","scrollTop","scrollLeft","textContent","nodeValue","src","currentTime","volume","muted","controls","loop","poster","autoplay","tabIndex","title","lang","dir","hidden","draggable","contentEditable","htmlFor","open","selected","multiple","width","height","colSpan","rowSpan"]),_s=new Set(["play","pause","load","focus","blur","click","scrollIntoView","requestFullscreen","select","setCustomValidity","reportValidity","showModal","close"]),Rs=new Set(["svg","path","circle","ellipse","line","polygon","polyline","rect","g","defs","use","text","tspan","clippath","mask","image","symbol","marker","lineargradient","radialgradient","stop","filter","fegaussianblur","feoffset","feblend","foreignobject"]),Ds="http://www.w3.org/2000/svg";class Bs{constructor(e,t,s){c(this,"nodeCache");c(this,"permissions");c(this,"root");c(this,"_additionalAllowedProperties");c(this,"onNodeRemoved",null);c(this,"_onWarning",null);c(this,"_onMutation",null);c(this,"highlightEnabled",!1);this.nodeCache=e??new Wt,this.permissions={...$s,...t},this._additionalAllowedProperties=new Set(this.permissions.additionalAllowedProperties??[]),this.root=s??{body:document.body,head:document.head,html:document.documentElement}}setDebugHooks(e){this._onWarning=e.onWarning??null,this._onMutation=e.onMutation??null}enableHighlightUpdates(e){this.highlightEnabled=e}highlightNode(e){if(!this.highlightEnabled)return;const t=this.nodeCache.get(e);if(!(t!=null&&t.style))return;const s=t.style.outline;t.style.outline="2px solid rgba(78, 201, 176, 0.8)",setTimeout(()=>{t.style.outline=s},300)}apply(e,t){switch(this._onMutation&&this._onMutation({side:"main",action:e.action,mutation:e,timestamp:performance.now(),batchUid:t}),e.action){case"createNode":this.createNode(e.id,e.tag,e.textContent);break;case"createComment":this.createComment(e.id,e.textContent);break;case"appendChild":this.appendChild(e.id,e.childId);break;case"removeNode":this.removeNode(e.id);break;case"removeChild":this.removeChild(e.id,e.childId);break;case"insertBefore":this.insertBefore(e.id,e.newId,e.refId);break;case"setAttribute":this.setAttribute(e.id,e.name,e.value);break;case"removeAttribute":this.removeAttribute(e.id,e.name);break;case"setStyle":this.setStyle(e.id,e.property,e.value);break;case"setProperty":this.setProperty(e.id,e.property,e.value);break;case"setTextContent":this.setTextContent(e.id,e.textContent);break;case"setClassName":this.setClassName(e.id,e.name);break;case"setHTML":this.setHTML(e.id,e.html);break;case"addEventListener":break;case"configureEvent":break;case"removeEventListener":break;case"headAppendChild":this.headAppendChild(e.id);break;case"bodyAppendChild":this.bodyAppendChild(e.id);break;case"pushState":this.permissions.allowNavigation&&window.history.pushState(e.state,e.title,e.url);break;case"replaceState":this.permissions.allowNavigation&&window.history.replaceState(e.state,e.title,e.url);break;case"scrollTo":this.permissions.allowScroll&&window.scrollTo(e.x,e.y);break;case"insertAdjacentHTML":this.insertAdjacentHTML(e.id,e.position,e.html);break;case"callMethod":this.callMethod(e.id,e.method,e.args);break}if(this.highlightEnabled&&"id"in e){const s=e.action;(s==="appendChild"||s==="setAttribute"||s==="setStyle"||s==="setClassName"||s==="setTextContent"||s==="setHTML")&&this.highlightNode(e.id)}}getNode(e){return this.nodeCache.get(e)}clear(){this.nodeCache.clear()}getRoot(){return this.root}createNode(e,t,s){if(this.nodeCache.has(e))return;if(t==="HTML"){this.nodeCache.set(e,this.root.html);return}if(t==="BODY"){this.nodeCache.set(e,this.root.body);return}if(t==="HEAD"){this.nodeCache.set(e,this.root.head);return}if(t.charAt(0)==="#"){const E=document.createTextNode(s??"");this.nodeCache.set(e,E);return}const a=t.toLowerCase();let o;Rs.has(a)?o=document.createElementNS(Ds,a):o=document.createElement(t);const f=String(e);o.setAttribute("data-async-dom-id",f),o.__asyncDomId=e,s&&(o.textContent=s),this.nodeCache.set(e,o)}createComment(e,t){if(this.nodeCache.has(e))return;const s=document.createComment(t);this.nodeCache.set(e,s)}appendChild(e,t){var o;const s=this.nodeCache.get(e),a=this.nodeCache.get(t);if(!s||!a){const f=`appendChild: ${s?"child":"parent"} not found`;console.warn(`[async-dom] ${f}`,{parentId:e,childId:t}),(o=this._onWarning)==null||o.call(this,{code:Qe.MISSING_NODE,message:f,context:{parentId:e,childId:t},timestamp:performance.now()});return}s.appendChild(a)}removeNode(e){var s;const t=this.nodeCache.get(e);if(!t){const a="removeNode: node not found";console.warn(`[async-dom] ${a}`,{id:e}),(s=this._onWarning)==null||s.call(this,{code:Qe.MISSING_NODE,message:a,context:{id:e},timestamp:performance.now()});return}this._cleanupSubtreeListeners(t,e),this.nodeCache.delete(e),t.parentNode?t.parentNode.removeChild(t):"remove"in t&&typeof t.remove=="function"&&t.remove()}removeChild(e,t){var o;const s=this.nodeCache.get(e),a=this.nodeCache.get(t);s&&(a!=null&&a.parentNode)&&(a.parentNode.removeChild(a),this.nodeCache.delete(t),(o=this.onNodeRemoved)==null||o.call(this,t))}insertBefore(e,t,s){var E;if(e===t)return;const a=this.nodeCache.get(e),o=this.nodeCache.get(t);if(!a||!o){const F=`insertBefore: ${a?"newNode":"parent"} not found`;console.warn(`[async-dom] ${F}`,{parentId:e,newId:t,refId:s}),(E=this._onWarning)==null||E.call(this,{code:Qe.MISSING_NODE,message:F,context:{parentId:e,newId:t,refId:s},timestamp:performance.now()});return}const f=s?this.nodeCache.get(s):null;a.insertBefore(o,f??null)}setAttribute(e,t,s){var f;const a=this.nodeCache.get(e);if(!a||!("setAttribute"in a)){const E="setAttribute: node not found";console.warn(`[async-dom] ${E}`,{id:e,name:t,value:s}),(f=this._onWarning)==null||f.call(this,{code:Qe.MISSING_NODE,message:E,context:{id:e,name:t,value:s},timestamp:performance.now()});return}const o=t.toLowerCase();/^on/i.test(o)||Ms.has(o)||Ls.has(o)&&As(s)||(t==="id"&&this.nodeCache.set(s,a),a.setAttribute(t,s))}removeAttribute(e,t){const s=this.nodeCache.get(e);!s||!("removeAttribute"in s)||s.removeAttribute(t)}setStyle(e,t,s){var o;const a=this.nodeCache.get(e);if(!(a!=null&&a.style)){const f="setStyle: node not found";console.warn(`[async-dom] ${f}`,{id:e,property:t,value:s}),(o=this._onWarning)==null||o.call(this,{code:Qe.MISSING_NODE,message:f,context:{id:e,property:t,value:s},timestamp:performance.now()});return}a.style.setProperty(t,s)}setProperty(e,t,s){var o;const a=this.nodeCache.get(e);if(a){if(!Is.has(t)&&!this._additionalAllowedProperties.has(t)){(o=this._onWarning)==null||o.call(this,{code:Qe.BLOCKED_PROPERTY,message:`setProperty: property "${t}" is not in the allowed list`,context:{id:e,property:t},timestamp:performance.now()});return}a[t]=s}}setTextContent(e,t){const s=this.nodeCache.get(e);s&&(s.textContent=t)}setClassName(e,t){const s=this.nodeCache.get(e);s&&(s.className=t)}setHTML(e,t){const s=this.nodeCache.get(e);s&&(s.innerHTML=this.permissions.allowUnsafeHTML?t:pn(t))}insertAdjacentHTML(e,t,s){const a=this.nodeCache.get(e);!a||!("insertAdjacentHTML"in a)||a.insertAdjacentHTML(t,this.permissions.allowUnsafeHTML?s:pn(s))}headAppendChild(e){if(!this.permissions.allowHeadAppend)return;const t=this.nodeCache.get(e);t&&this.root.head.appendChild(t)}bodyAppendChild(e){if(!this.permissions.allowBodyAppend)return;const t=this.nodeCache.get(e);t&&this.root.body.appendChild(t)}callMethod(e,t,s){const a=this.nodeCache.get(e);if(!a)return;if(!_s.has(t)){console.warn(`[async-dom] Blocked callMethod: "${t}" is not allowed`);return}const o=a[t];typeof o=="function"&&o.apply(a,s)}_cleanupSubtreeListeners(e,t){var s;if((s=this.onNodeRemoved)==null||s.call(this,t),"children"in e){const a=e;for(let o=0;o<a.children.length;o++){const f=a.children[o],E=f.__asyncDomId;E&&(this._cleanupSubtreeListeners(f,E),this.nodeCache.delete(E))}}}}const re={CreateNode:0,CreateComment:1,AppendChild:2,RemoveNode:3,RemoveChild:4,InsertBefore:5,SetAttribute:6,RemoveAttribute:7,SetStyle:8,SetProperty:9,SetTextContent:10,SetClassName:11,SetHTML:12,AddEventListener:13,HeadAppendChild:14,BodyAppendChild:15,PushState:16,ReplaceState:17,ScrollTo:18,InsertAdjacentHTML:19,ConfigureEvent:20,RemoveEventListener:21,CallMethod:22};class Os{constructor(e){c(this,"view");c(this,"offset",0);c(this,"strings");this.strings=e}readU8(){if(this.offset+1>this.view.byteLength)throw new Error("Binary decode: unexpected end of buffer");return this.view.getUint8(this.offset++)}readU16(){if(this.offset+2>this.view.byteLength)throw new Error("Binary decode: unexpected end of buffer");const e=this.view.getUint16(this.offset,!0);return this.offset+=2,e}readU32(){if(this.offset+4>this.view.byteLength)throw new Error("Binary decode: unexpected end of buffer");const e=this.view.getUint32(this.offset,!0);return this.offset+=4,e}readStr(){return this.strings.get(this.readU16())}readNodeId(){return this.readU32()}decode(e){this.view=new DataView(e),this.offset=0;const t=[];for(;this.offset<e.byteLength;){const s=this.readU8();t.push(this.decodeMutation(s))}return t}decodeMutation(e){switch(e){case re.CreateNode:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr();return{action:"createNode",id:t,tag:s,...a?{textContent:a}:{}}}case re.CreateComment:return{action:"createComment",id:this.readNodeId(),textContent:this.readStr()};case re.AppendChild:return{action:"appendChild",id:this.readNodeId(),childId:this.readNodeId()};case re.RemoveNode:return{action:"removeNode",id:this.readNodeId()};case re.RemoveChild:return{action:"removeChild",id:this.readNodeId(),childId:this.readNodeId()};case re.InsertBefore:{const t=this.readNodeId(),s=this.readNodeId(),a=this.readU32();return{action:"insertBefore",id:t,newId:s,refId:a===4294967295?null:a}}case re.SetAttribute:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr(),o=this.readU8()===1;return{action:"setAttribute",id:t,name:s,value:a,...o?{optional:o}:{}}}case re.RemoveAttribute:return{action:"removeAttribute",id:this.readNodeId(),name:this.readStr()};case re.SetStyle:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr(),o=this.readU8()===1;return{action:"setStyle",id:t,property:s,value:a,...o?{optional:o}:{}}}case re.SetProperty:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr();return{action:"setProperty",id:t,property:s,value:JSON.parse(a)}}case re.SetTextContent:return{action:"setTextContent",id:this.readNodeId(),textContent:this.readStr()};case re.SetClassName:return{action:"setClassName",id:this.readNodeId(),name:this.readStr()};case re.SetHTML:return{action:"setHTML",id:this.readNodeId(),html:this.readStr()};case re.AddEventListener:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr();return{action:"addEventListener",id:t,name:s,listenerId:a}}case re.HeadAppendChild:return{action:"headAppendChild",id:this.readNodeId()};case re.BodyAppendChild:return{action:"bodyAppendChild",id:this.readNodeId()};case re.PushState:{const t=JSON.parse(this.readStr()),s=this.readStr(),a=this.readStr();return{action:"pushState",state:t,title:s,url:a}}case re.ReplaceState:{const t=JSON.parse(this.readStr()),s=this.readStr(),a=this.readStr();return{action:"replaceState",state:t,title:s,url:a}}case re.ScrollTo:return{action:"scrollTo",x:this.readU32(),y:this.readU32()};case re.InsertAdjacentHTML:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr();return{action:"insertAdjacentHTML",id:t,position:s,html:a}}case re.ConfigureEvent:{const t=this.readNodeId(),s=this.readStr(),a=this.readU8()===1,o=this.readU8()===1;return{action:"configureEvent",id:t,name:s,preventDefault:a,...o?{passive:o}:{}}}case re.RemoveEventListener:return{action:"removeEventListener",id:this.readNodeId(),listenerId:this.readStr()};case re.CallMethod:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr();return{action:"callMethod",id:t,method:s,args:JSON.parse(a)}}default:throw new Error(`Unknown mutation opcode: ${e}`)}}}class Fs{constructor(){c(this,"stringToIndex",new Map);c(this,"indexToString",[]);c(this,"pending",[])}store(e){const t=this.stringToIndex.get(e);if(t!==void 0)return t;const s=this.indexToString.length;return this.stringToIndex.set(e,s),this.indexToString.push(e),this.pending.push(e),s}get(e){return this.indexToString[e]??""}consumePending(){const e=this.pending;return this.pending=[],e}registerBulk(e){for(const t of e)if(!this.stringToIndex.has(t)){const s=this.indexToString.length;this.stringToIndex.set(t,s),this.indexToString.push(t)}}get size(){return this.indexToString.length}}const Ps=new TextEncoder,Hs=new TextDecoder;function zs(n){return n instanceof ArrayBuffer||typeof n=="object"&&n!==null&&"byteLength"in n&&"slice"in n&&typeof n.slice=="function"&&!ArrayBuffer.isView(n)}const Ws=2;function qs(n){return n.byteLength<1?!1:new DataView(n).getUint8(0)===Ws}function Us(n){const e=JSON.stringify(n),t=Ps.encode(e),s=new ArrayBuffer(t.byteLength);return new Uint8Array(s).set(t),s}function Ks(n){return JSON.parse(Hs.decode(n))}function Ys(n){return n.type==="mutation"}new TextEncoder;const hn=new TextDecoder;function js(n,e,t){const s=new DataView(n),a=new Uint8Array(n);let o=0;o+=1;const f=s.getUint32(o,!0);o+=4;const E=s.getUint16(o,!0);o+=2;const F=hn.decode(a.slice(o,o+E));o+=E;const q=s.getUint8(o++),B=["normal","high","low"][q]??"normal",se=s.getUint16(o,!0);o+=2;const z=[];for(let he=0;he<se;he++){const ge=s.getUint16(o,!0);o+=2,z.push(hn.decode(a.slice(o,o+ge))),o+=ge}e.registerBulk(z);const te=n.slice(o),we=t.decode(te);return{type:"mutation",appId:F,uid:f,mutations:we,...B!=="normal"?{priority:B}:{}}}class Vs{constructor(e){c(this,"handlers",[]);c(this,"_readyState","open");c(this,"strings",new Fs);c(this,"mutDecoder",new Os(this.strings));c(this,"_statsEnabled",!1);c(this,"_stats",{messageCount:0,totalBytes:0,largestMessageBytes:0,lastMessageBytes:0});c(this,"onError");c(this,"onClose");this.worker=e,e.onmessage=t=>{if(this.handlers.length===0)return;let s;zs(t.data)?qs(t.data)?s=js(t.data,this.strings,this.mutDecoder):s=Ks(t.data):s=t.data;for(const a of this.handlers)try{a(s)}catch(o){console.error("[async-dom] Handler error:",o)}},e.onerror=t=>{var a,o;const s=new Error(t.message??"Worker error");(a=this.onError)==null||a.call(this,s),this._readyState!=="closed"&&(this._readyState="closed",(o=this.onClose)==null||o.call(this))},e.onmessageerror=()=>{var s;const t=new Error("Worker message deserialization failed");(s=this.onError)==null||s.call(this,t)}}enableStats(e){this._statsEnabled=e}send(e){if(this._readyState==="open")if(Ys(e)){const t=Us(e);if(this._statsEnabled){const s=t.byteLength;this._stats.messageCount++,this._stats.totalBytes+=s,this._stats.lastMessageBytes=s,s>this._stats.largestMessageBytes&&(this._stats.largestMessageBytes=s)}this.worker.postMessage(t,[t])}else{if(this._statsEnabled){const t=JSON.stringify(e).length;this._stats.messageCount++,this._stats.totalBytes+=t,this._stats.lastMessageBytes=t,t>this._stats.largestMessageBytes&&(this._stats.largestMessageBytes=t)}this.worker.postMessage(e)}}onMessage(e){this.handlers.push(e)}close(){this._readyState="closed",this.worker.terminate()}get readyState(){return this._readyState}getStats(){return{...this._stats}}}class Gs{constructor(e){c(this,"handlers",[]);c(this,"_readyState","open");c(this,"_statsEnabled",!1);c(this,"_stats",{messageCount:0,totalBytes:0,largestMessageBytes:0,lastMessageBytes:0});c(this,"onError");c(this,"onClose");this.worker=e,e.onmessage=t=>{for(const s of this.handlers)try{s(t.data)}catch(a){console.error("[async-dom] Handler error:",a)}},e.onerror=t=>{var a,o;const s=new Error(t.message??"Worker error");(a=this.onError)==null||a.call(this,s),this._readyState!=="closed"&&(this._readyState="closed",(o=this.onClose)==null||o.call(this))},e.onmessageerror=()=>{var s;const t=new Error("Worker message deserialization failed");(s=this.onError)==null||s.call(this,t)}}enableStats(e){this._statsEnabled=e}send(e){if(this._readyState==="open"){if(this._statsEnabled){const t=JSON.stringify(e).length;this._stats.messageCount++,this._stats.totalBytes+=t,this._stats.lastMessageBytes=t,t>this._stats.largestMessageBytes&&(this._stats.largestMessageBytes=t)}this.worker.postMessage(e)}}onMessage(e){this.handlers.push(e)}close(){this._readyState="closed",this.worker.terminate()}get readyState(){return this._readyState}getStats(){return{...this._stats}}}class Xs{constructor(e,t){c(this,"ws",null);c(this,"handlers",[]);c(this,"_readyState","connecting");c(this,"_stats",{messageCount:0,totalBytes:0,largestMessageBytes:0,lastMessageBytes:0});c(this,"onError");c(this,"onClose");c(this,"attempt",0);c(this,"messageQueue",[]);c(this,"closed",!1);c(this,"reconnectTimer",null);c(this,"maxRetries");c(this,"baseDelay");c(this,"maxDelay");this.url=e,this.maxRetries=(t==null?void 0:t.maxRetries)??Vn,this.baseDelay=(t==null?void 0:t.baseDelay)??Gn,this.maxDelay=(t==null?void 0:t.maxDelay)??Xn,this.connect()}connect(){this.closed||(this._readyState="connecting",this.ws=new WebSocket(this.url),this.ws.onopen=()=>{this._readyState="open",this.attempt=0,this.flushQueue()},this.ws.onmessage=e=>{try{const t=JSON.parse(e.data);for(const s of this.handlers)try{s(t)}catch(a){console.error("[async-dom] Handler error:",a)}}catch{console.error("[async-dom] Failed to parse WebSocket message")}},this.ws.onclose=()=>{this.closed||this.scheduleReconnect()},this.ws.onerror=()=>{var e;(e=this.ws)==null||e.close()})}scheduleReconnect(){if(this.attempt>=this.maxRetries){this._readyState="closed",console.error(`[async-dom] WebSocket reconnection failed after ${this.maxRetries} attempts`);return}const e=Math.min(this.baseDelay*2**this.attempt+Math.random()*1e3,this.maxDelay);this.attempt++,this.reconnectTimer=setTimeout(()=>{this.connect()},e)}flushQueue(){for(;this.messageQueue.length>0;){const e=this.messageQueue.shift();if(!e)break;this.sendRaw(e)}}sendRaw(e){var a;const t=JSON.stringify(e),s=t.length;this._stats.messageCount++,this._stats.totalBytes+=s,this._stats.lastMessageBytes=s,s>this._stats.largestMessageBytes&&(this._stats.largestMessageBytes=s),(a=this.ws)==null||a.send(t)}send(e){var t;this._readyState==="open"&&((t=this.ws)==null?void 0:t.readyState)===WebSocket.OPEN?this.sendRaw(e):this._readyState!=="closed"&&this.messageQueue.push(e)}onMessage(e){this.handlers.push(e)}close(){var e;this.closed=!0,this._readyState="closed",this.reconnectTimer!==null&&clearTimeout(this.reconnectTimer),(e=this.ws)==null||e.close(),this.messageQueue.length=0}get readyState(){return this._readyState}getStats(){return{...this._stats}}}class Js{constructor(){c(this,"threads",new Map);c(this,"messageHandlers",[])}createWorkerThread(e){const t=un(),s=typeof __ASYNC_DOM_BINARY__<"u"&&__ASYNC_DOM_BINARY__,a=e.transport??(s?new Vs(e.worker):new Gs(e.worker));return a.onMessage(o=>{this.notifyHandlers(t,o)}),this.threads.set(t,{transport:a,appId:t}),t}createWebSocketThread(e){const t=un(),s=new Xs(e.url,e.options);return s.onMessage(a=>{this.notifyHandlers(t,a)}),this.threads.set(t,{transport:s,appId:t}),t}sendToThread(e,t){const s=this.threads.get(e);s&&s.transport.send(t)}broadcast(e){for(const t of this.threads.values())t.transport.send(e)}destroyThread(e){const t=this.threads.get(e);t&&(t.transport.close(),this.threads.delete(e))}destroyAll(){for(const e of[...this.threads.keys()])this.destroyThread(e)}onMessage(e){this.messageHandlers.push(e)}getTransport(e){var t;return((t=this.threads.get(e))==null?void 0:t.transport)??null}notifyHandlers(e,t){for(const s of this.messageHandlers)s(e,t)}}function un(){return Math.random().toString(36).slice(2,7)}const Qs=new Set(["innerWidth","innerHeight","outerWidth","outerHeight","devicePixelRatio","screen.width","screen.height","screen.availWidth","screen.availHeight","screen.colorDepth","screen.pixelDepth","screen.orientation.type","scrollX","scrollY","visualViewport.width","visualViewport.height","navigator.language","navigator.languages","navigator.userAgent","navigator.hardwareConcurrency","document.visibilityState","document.hidden","localStorage.getItem","localStorage.setItem","localStorage.removeItem","localStorage.length","localStorage.key","sessionStorage.getItem","sessionStorage.setItem","sessionStorage.removeItem","sessionStorage.length","sessionStorage.key"]);function ea(n){var Fe,Ae;const e=new Qn(n.scheduler),t=new Js,s=new Map,a=new Map,o=Fn(n.debug),f=new Bn,E=new Hn,F=new Map,q=200,j=new On,B=new Map;let se=null,z=null;const te=new Map;function we(p){t.sendToThread(p,{type:"debugQuery",query:"tree"}),t.sendToThread(p,{type:"debugQuery",query:"stats"}),t.sendToThread(p,{type:"debugQuery",query:"perTypeCoalesced"}),t.sendToThread(p,{type:"debugQuery",query:"coalescedLog"})}function he(p,u){try{const L=JSON.parse(u.data),S=L.nodeId,R=L.property;switch(u.queryType){case Me.BoundingRect:{const D=p.getNode(S);if(!D||!("getBoundingClientRect"in D))return null;const G=D.getBoundingClientRect();return{top:G.top,left:G.left,right:G.right,bottom:G.bottom,width:G.width,height:G.height,x:G.x,y:G.y}}case Me.ComputedStyle:{const D=p.getNode(S);if(!D)return{};const G=window.getComputedStyle(D),ie={},xe=["display","position","top","left","right","bottom","width","height","color","background-color","font-size","font-family","font-weight","line-height","text-align","visibility","opacity","overflow","z-index","float","clear","cursor","pointer-events","box-sizing","flex-direction","justify-content","align-items","flex-wrap","flex-grow","flex-shrink","flex-basis","grid-template-columns","grid-template-rows","gap","transform","border-radius","box-shadow","text-decoration","white-space","word-break","overflow-wrap","min-width","max-width","min-height","max-height","margin-top","margin-right","margin-bottom","margin-left","padding-top","padding-right","padding-bottom","padding-left"];for(const Z of xe){const le=G.getPropertyValue(Z);le&&(ie[Z]=le)}return ie}case Me.NodeProperty:{const D=p.getNode(S);return!D||!R?null:D[R]??null}case Me.WindowProperty:{if(!R||!Qs.has(R))return null;if(R.startsWith("localStorage.")||R.startsWith("sessionStorage.")){const ie=R.indexOf("."),xe=R.slice(0,ie),Z=R.slice(ie+1),le=xe==="localStorage"?window.localStorage:window.sessionStorage,V=L.args;return Z==="getItem"&&(V==null?void 0:V[0])!=null?le.getItem(V[0]):Z==="setItem"&&(V==null?void 0:V[0])!=null&&V[1]!==void 0?(le.setItem(V[0],V[1]),null):Z==="removeItem"&&(V==null?void 0:V[0])!=null?(le.removeItem(V[0]),null):Z==="length"?le.length:Z==="key"&&(V==null?void 0:V[0])!==void 0?le.key(Number(V[0])):null}const D=R.split(".");let G=window;for(const ie of D){if(G==null)return null;G=G[ie]}return G??null}default:return null}}catch{return null}}e.setApplier((p,u,L)=>{if(p.action==="addEventListener"){const R=s.get(u);R&&(R.attach(p.id,p.name,p.listenerId),f.eventsForwarded++);return}if(p.action==="configureEvent"){const R=s.get(u);R&&R.configureEvent(p.id,p.name,{preventDefault:p.preventDefault,passive:p.passive});return}if(p.action==="removeEventListener"){const R=s.get(u);R&&R.detach(p.listenerId);return}let S;u===z&&se?S=se:(S=B.get(u),S&&(se=S,z=u)),S&&(S.apply(p,L),f.mutationsApplied++)}),t.onMessage((p,u)=>{if(mn(u)){if(u.sentAt!=null&&e.recordWorkerLatency(u.sentAt),e.enqueue(u.mutations,p,u.priority??"normal",u.uid),u.causalEvent){const L=u.mutations.filter(S=>"id"in S).map(S=>S.id);E.recordBatch(u.uid,L,u.mutations.length,u.causalEvent),j.registerBatchEvent(u.uid,u.causalEvent)}return}if(it(u)&&u.type==="eventTimingResult"){const L=s.get(p);L&&L.updateTraceWithWorkerTiming(u.listenerId,u.dispatchMs,u.mutationCount);return}if(it(u)&&u.type==="perfEntries"){const L=u;let S=F.get(p);S||(S=[],F.set(p,S)),S.push(...L.entries),S.length>q&&S.splice(0,S.length-q);return}if(it(u)&&u.type==="debugResult"){const L=u,S=te.get(p)??{tree:null,workerStats:null,perTypeCoalesced:null,coalescedLog:null};L.query==="tree"&&(S.tree=L.result),L.query==="stats"&&(S.workerStats=L.result),L.query==="perTypeCoalesced"&&(S.perTypeCoalesced=L.result),L.query==="coalescedLog"&&(S.coalescedLog=L.result),te.set(p,S)}}),n.worker&&ge(n.worker,n.target);function ge(p,u,L,S,R){var Pe,He;const D=t.createWorkerThread({worker:p,transport:S}),G=new Wt;let ie=null;u&&(ie=typeof u=="string"?document.querySelector(u):u);let xe;if(ie&&L){const ne=L===!0?{mode:"open"}:L,U=ie.attachShadow(ne);xe={body:U,head:U,html:ie}}else ie&&(xe={body:ie,head:document.head,html:ie});const Z=new Bs(G,void 0,xe);(o.onWarning||o.onMutation)&&Z.setDebugHooks({onWarning:o.onWarning,onMutation:o.onMutation});const le=Z.getRoot();G.set(zn,le.body),G.set(Wn,le.head),G.set(qn,le.html),G.set(fn,document),Z.onNodeRemoved=ne=>{const U=s.get(D);U&&U.detachByNodeId(ne)},B.set(D,Z);const V=new xs(D,G),ae=t.getTransport(D);if(ae){(Pe=n.debug)!=null&&Pe.exposeDevtools&&((He=ae.enableStats)==null||He.call(ae,!0)),V.setTransport(ae);const ne=()=>{V.detachAll(),s.delete(D),Z.clear(),B.delete(D),z===D&&(se=null,z=null);const U=a.get(D);U&&(U.stopPolling(),a.delete(D)),e.setAppCount(B.size)};console.debug("[async-dom] App",D,"transport ready, readyState:",ae.readyState),ae.onError=U=>{console.error("[async-dom] App",D,"worker error:",U.message),R==null||R({message:U.message,stack:U.stack,name:U.name},D)},ae.onClose=()=>{console.warn("[async-dom] App",D,"worker disconnected, cleaning up"),ne()},ae.onMessage(U=>{if(it(U)&&U.type==="error"&&"error"in U){const $e=U;R==null||R($e.error,D);const oe=$e.error,De=oe.filename?` at ${oe.filename}:${oe.lineno??"?"}:${oe.colno??"?"}`:"";ln({code:oe.isUnhandledRejection?"WORKER_UNHANDLED_REJECTION":"WORKER_ERROR",message:`[${String(D)}] ${oe.name??"Error"}: ${oe.message}${De}${oe.stack?`
${oe.stack}`:""}`,context:{appId:String(D),error:oe},timestamp:performance.now()})}})}o.onEvent&&(V.onTimingResult=ne=>{var U;(U=o.onEvent)==null||U.call(o,{side:"main",phase:"dispatch",eventType:ne.eventType,listenerId:ne.listenerId,targetId:null,timestamp:ne.timestamp,transportMs:ne.transportMs,dispatchMs:ne.dispatchMs,mutationCount:ne.mutationCount})}),s.set(D,V),e.setAppCount(B.size);let ue;if(typeof SharedArrayBuffer<"u")try{ue=new SharedArrayBuffer(65536);const ne=new ts(ue);ne.startPolling(U=>he(Z,U)),a.set(D,ne)}catch{ue=void 0}return ae&&ae.onMessage(ne=>{if(it(ne)&&ne.type==="query"){const U=ne,oe={boundingRect:Me.BoundingRect,computedStyle:Me.ComputedStyle,nodeProperty:Me.NodeProperty,windowProperty:Me.WindowProperty}[U.query]??Me.NodeProperty,De=he(Z,{queryType:oe,data:JSON.stringify({nodeId:U.nodeId,property:U.property})});ae.send({type:"queryResult",uid:U.uid,result:De})}}),t.sendToThread(D,{type:"init",appId:D,location:{hash:window.location.hash,href:window.location.href,port:window.location.port,host:window.location.host,origin:window.location.origin,hostname:window.location.hostname,pathname:window.location.pathname,protocol:window.location.protocol,search:window.location.search,state:window.history.state},sharedBuffer:ue}),D}let Te=null;if((Fe=n.debug)!=null&&Fe.exposeDevtools&&(globalThis.__ASYNC_DOM_DEVTOOLS__={scheduler:{pending:()=>e.pendingCount,stats:()=>e.getStats(),frameLog:()=>e.getFrameLog(),flush:()=>e.flush()},getEventTraces:()=>{const p=[];for(const u of s.values())p.push(...u.getEventTraces());return p.sort((u,L)=>u.timestamp-L.timestamp),p},enableHighlightUpdates:p=>{for(const u of B.values())u.enableHighlightUpdates(p)},findRealNode:p=>{for(const u of B.values()){const L=u.getNode(p);if(L)return L}return null},getListenersForNode:p=>{const u=[];for(const L of s.values())u.push(...L.getListenersForNode(p));return u},debugStats:()=>f.snapshot(),apps:()=>[...B.keys()],renderers:()=>{const p={};for(const[u,L]of B)p[String(u)]={root:L.getRoot()};return p},refreshDebugData:()=>{for(const p of B.keys())we(p)},getAppData:p=>te.get(p),getTransportStats:()=>{var u;const p={};for(const L of B.keys()){const S=t.getTransport(L);p[String(L)]=((u=S==null?void 0:S.getStats)==null?void 0:u.call(S))??null}return p},getAllAppsData:()=>{const p={};for(const[u,L]of te)p[String(u)]=L;return p},replayMutation:(p,u)=>{const L=B.get(u);L&&L.apply(p)},clearAndReapply:(p,u)=>{for(const L of B.values()){const S=L.getRoot();S&&(S.body.textContent="",S.head.textContent="");const R=Math.min(u,p.length);for(let D=0;D<R;D++)L.apply(p[D].mutation,p[D].batchUid);break}},getCausalityTracker:()=>E,getWorkerPerfEntries:()=>{const p={};for(const[u,L]of F)p[String(u)]=L.slice();return p},getMutationCorrelation:()=>j},typeof document<"u"&&(Te=bs())),(Ae=n.debug)!=null&&Ae.exposeDevtools){const p=o.onMutation,u=o.onWarning,L=o.onEvent,S=o.onSyncRead;o.onMutation=R=>{p==null||p(R),fs(R),j.indexMutation(R)},o.onWarning=R=>{u==null||u(R),ln(R)},o.onEvent=R=>{L==null||L(R),ms(R)},o.onSyncRead=R=>{S==null||S(R),gs(R)}}console.debug("[async-dom] Initialized",{apps:n.worker?1:0,debug:!!n.debug,scheduler:n.scheduler??"default"});const je=()=>{t.broadcast({type:"visibility",state:document.visibilityState})};return document.addEventListener("visibilitychange",je),{start(){e.start()},stop(){e.stop()},destroy(){e.stop(),e.flush();for(const p of B.values())p.clear();B.clear(),se=null,z=null;for(const p of s.values())p.detachAll();for(const p of a.values())p.stopPolling();a.clear(),document.removeEventListener("visibilitychange",je),t.destroyAll(),Te&&(Te.destroy(),Te=null)},addApp(p){return ge(p.worker,p.mountPoint,p.shadow,p.transport,p.onError)},removeApp(p){const u=s.get(p);u&&(u.detachAll(),s.delete(p));const L=B.get(p);L&&(L.clear(),B.delete(p)),z===p&&(se=null,z=null);const S=a.get(p);S&&(S.stopPolling(),a.delete(p)),t.destroyThread(p),e.setAppCount(B.size)}}}export{Bs as DomRenderer,xs as EventBridge,Qn as FrameScheduler,Js as ThreadManager,ea as createAsyncDom};
