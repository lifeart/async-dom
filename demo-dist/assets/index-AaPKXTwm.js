var In=Object.defineProperty;var Rn=(s,e,t)=>e in s?In(s,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):s[e]=t;var d=(s,e,t)=>Rn(s,typeof e!="symbol"?e+"":e,t);const et={MISSING_NODE:"ASYNC_DOM_MISSING_NODE",BLOCKED_PROPERTY:"ASYNC_DOM_BLOCKED_PROPERTY"},_n={ASYNC_DOM_MISSING_NODE:{description:"A DOM mutation referenced a node ID that doesn't exist in the node cache.",suggestion:"Ensure nodes are created before being referenced. Check for race conditions between create and update mutations."},ASYNC_DOM_SYNC_TIMEOUT:{description:"A synchronous read (getBoundingClientRect, computedStyle) timed out waiting for the main thread response.",suggestion:"Reduce sync read frequency, increase timeout, or use cached values when possible."},ASYNC_DOM_LISTENER_NOT_FOUND:{description:"An event was received for a listener ID that is not registered.",suggestion:"This may indicate a timing issue where a listener was removed before its event was processed."},ASYNC_DOM_EVENT_ATTACH_FAILED:{description:"Failed to attach an event listener to a DOM node.",suggestion:"Verify the target node exists in the DOM when the listener is being attached."},ASYNC_DOM_TRANSPORT_NOT_OPEN:{description:"Attempted to send a message through a closed or connecting transport.",suggestion:"Ensure the transport connection is established before sending mutations."},ASYNC_DOM_BLOCKED_PROPERTY:{description:"A setProperty call was blocked because the property is not in the allowed list.",suggestion:"Add the property to additionalAllowedProperties in the renderer permissions if it's safe."},WORKER_ERROR:{description:"An unhandled error occurred in the worker thread.",suggestion:"Check the stack trace for the error source. Add error handling in your worker code."},WORKER_UNHANDLED_REJECTION:{description:"An unhandled promise rejection occurred in the worker thread.",suggestion:"Add .catch() handlers to promises or use try/catch with async/await in your worker code."}},Dn={warning(s){console.warn(`[async-dom] ${s.code}: ${s.message}`,s.context)},mutation(s){console.log(`[async-dom:${s.side}] mutation:${s.action}`,s.mutation)},event(s){console.log(`[async-dom:${s.side}] event:${s.phase} ${s.eventType} listenerId=${s.listenerId}`)},syncRead(s){console.log(`[async-dom] sync:${s.queryType} node=${s.nodeId} ${s.result} (${s.latencyMs.toFixed(1)}ms)`)},scheduler(s){console.log(`[async-dom] frame:${s.frameId} actions=${s.actionsProcessed} time=${s.frameTimeMs.toFixed(1)}ms queue=${s.queueDepth}`)}};class Bn{constructor(){d(this,"mutationsAdded",0);d(this,"mutationsCoalesced",0);d(this,"mutationsFlushed",0);d(this,"mutationsApplied",0);d(this,"eventsForwarded",0);d(this,"eventsDispatched",0);d(this,"syncReadRequests",0);d(this,"syncReadTimeouts",0)}snapshot(){return{mutationsAdded:this.mutationsAdded,mutationsCoalesced:this.mutationsCoalesced,mutationsFlushed:this.mutationsFlushed,mutationsApplied:this.mutationsApplied,eventsForwarded:this.eventsForwarded,eventsDispatched:this.eventsDispatched,syncReadRequests:this.syncReadRequests,syncReadTimeouts:this.syncReadTimeouts}}reset(){this.mutationsAdded=0,this.mutationsCoalesced=0,this.mutationsFlushed=0,this.mutationsApplied=0,this.eventsForwarded=0,this.eventsDispatched=0,this.syncReadRequests=0,this.syncReadTimeouts=0}}class On{constructor(){d(this,"nodeIndex",new Map);d(this,"maxEntriesPerNode",20);d(this,"batchEventMap",new Map)}registerBatchEvent(e,t){if(this.batchEventMap.set(e,t),this.batchEventMap.size>500){const n=this.batchEventMap.keys().next().value;n!==void 0&&this.batchEventMap.delete(n)}}indexMutation(e){const n=e.mutation.id;if(n==null)return;const a=e.batchUid!=null?this.batchEventMap.get(e.batchUid)??null:null;let i=this.nodeIndex.get(n);i||(i=[],this.nodeIndex.set(n,i)),i.push({batchUid:e.batchUid,action:e.action,timestamp:e.timestamp,causalEvent:a}),i.length>this.maxEntriesPerNode&&i.shift()}getWhyUpdated(e){return this.nodeIndex.get(e)??[]}clear(){this.nodeIndex.clear(),this.batchEventMap.clear()}}function Fn(s){if(!s)return{onMutation:null,onEvent:null,onSyncRead:null,onScheduler:null,onWarning:null};const e={...Dn,...s.logger};return{onMutation:s.logMutations?t=>e.mutation(t):null,onEvent:s.logEvents?t=>e.event(t):null,onSyncRead:s.logSyncReads?t=>e.syncRead(t):null,onScheduler:s.logScheduler?t=>e.scheduler(t):null,onWarning:s.logWarnings?t=>e.warning(t):null}}const Pn=1,Hn=2,zn=3,un=4;function fn(s){return s.type==="mutation"}function Wn(s){return s.type==="event"}function ct(s){return!fn(s)&&!Wn(s)}class Wt{constructor(){d(this,"cache",new Map);d(this,"reverseCache",new WeakMap)}get(e){return e===un?document:this.cache.get(e)??null}getId(e){return this.reverseCache.get(e)??null}set(e,t){this.cache.set(e,t),this.reverseCache.set(t,e)}delete(e){const t=this.cache.get(e);t&&this.reverseCache.delete(t),this.cache.delete(e)}clear(){this.cache.clear()}has(e){return this.cache.has(e)}}const qn=16,Dt=1500,nn=3e3,Un=500,Kn=60,Yn=10,jn=1e3,Vn=3e4,Gn=30;class Xn{constructor(e={}){d(this,"queue",[]);d(this,"actionTimes",new Map);d(this,"frameId",0);d(this,"running",!1);d(this,"rafId",0);d(this,"uidCounter",0);d(this,"timePerLastFrame",0);d(this,"totalActionsLastFrame",0);d(this,"isScrolling",!1);d(this,"scrollTimer",null);d(this,"scrollAbort",null);d(this,"viewportHeight",0);d(this,"viewportWidth",0);d(this,"boundingRectCache",new Map);d(this,"boundingRectCacheFrame",new Map);d(this,"frameBudgetMs");d(this,"enableViewportCulling");d(this,"enablePrioritySkipping");d(this,"applier",null);d(this,"appCount",0);d(this,"appBudgets",new Map);d(this,"lastTickTime",0);d(this,"healthCheckTimer",null);d(this,"queueOverflowWarned",!1);d(this,"lastEnqueueTime",0);d(this,"droppedFrameCount",0);d(this,"lastWorkerToMainLatencyMs",0);d(this,"frameLog",[]);this.frameBudgetMs=e.frameBudgetMs??qn,this.enableViewportCulling=e.enableViewportCulling??!0,this.enablePrioritySkipping=e.enablePrioritySkipping??!0}setApplier(e){this.applier=e}setAppCount(e){this.appCount=e}enqueue(e,t,n="normal",a){this.lastEnqueueTime=performance.now();for(const i of e)this.uidCounter++,this.queue.push({mutation:i,priority:n,uid:this.uidCounter,appId:t,batchUid:a});this.queue.length>1e4&&!this.queueOverflowWarned&&(this.queueOverflowWarned=!0,console.warn(`[async-dom] Scheduler queue overflow: ${this.queue.length} pending mutations. Possible causes: tab hidden, applier not set, or mutations arriving faster than processing.`)),this.queue.length<=1e4&&(this.queueOverflowWarned=!1)}start(){this.running||(this.running=!0,this.lastTickTime=0,this.setupScrollListener(),this.scheduleFrame(),this.healthCheckTimer=setTimeout(()=>{this.running&&this.lastTickTime===0&&console.warn(`[async-dom] Scheduler started but tick() has not fired after 1 second. This usually means the tab is hidden (rAF does not fire in background tabs). Queue has ${this.queue.length} pending mutations.`)},1e3),console.debug("[async-dom] Scheduler started"))}scheduleFrame(){this.running&&(typeof document<"u"&&document.hidden?setTimeout(()=>this.tick(performance.now()),this.frameBudgetMs):this.rafId=requestAnimationFrame(e=>this.tick(e)))}stop(){this.running=!1,this.healthCheckTimer&&(clearTimeout(this.healthCheckTimer),this.healthCheckTimer=null),this.rafId&&(cancelAnimationFrame(this.rafId),this.rafId=0),this.scrollAbort&&(this.scrollAbort.abort(),this.scrollAbort=null),this.clearViewportCache()}clearViewportCache(){this.boundingRectCache.clear(),this.boundingRectCacheFrame.clear()}flush(){const e=this.applier;if(e){this.queue.sort(sn);for(const t of this.queue)e(t.mutation,t.appId,t.batchUid);this.queue.length=0}}get pendingCount(){return this.queue.length}recordWorkerLatency(e){this.lastWorkerToMainLatencyMs=Math.max(0,Date.now()-e)}getStats(){return{pending:this.queue.length,frameId:this.frameId,lastFrameTimeMs:this.timePerLastFrame,lastFrameActions:this.totalActionsLastFrame,isRunning:this.running,lastTickTime:this.lastTickTime,enqueueToApplyMs:this.lastTickTime>0&&this.lastEnqueueTime>0?Math.max(0,this.lastTickTime-this.lastEnqueueTime):0,droppedFrameCount:this.droppedFrameCount,workerToMainLatencyMs:this.lastWorkerToMainLatencyMs}}getFrameLog(){return this.frameLog.slice()}tick(e){if(!this.running)return;this.lastTickTime=performance.now();const t=performance.now();this.frameId++,this.calcViewportSize(),this.queue.sort(sn);const n=this.applier;if(!n){this.scheduleNext(t);return}let a=0;const i=this.getActionsForFrame(),h=[],C=new Map,O=new Map,V=new Map;this.appCount>1&&this.appBudgets.clear();let z=0;for(;z<this.queue.length&&a<i;){const te=performance.now()-t;if(this.queue.length<nn&&te>=this.frameBudgetMs)break;const W=this.queue[z];if(z++,this.shouldSkip(W))continue;if(this.appCount>1){const he=this.appBudgets.get(W.appId)??0,ue=Math.ceil(i/this.appCount);if(he>=ue){h.push(W);const Ne=String(W.appId);V.set(Ne,(V.get(Ne)??0)+1);continue}this.appBudgets.set(W.appId,he+1)}const ae=performance.now();n(W.mutation,W.appId,W.batchUid);const pe=performance.now()-ae;{const he=String(W.appId);O.set(he,(O.get(he)??0)+1)}this.recordTiming(W.mutation.action,pe),C.set(W.mutation.action,(C.get(W.mutation.action)??0)+pe),a++}z===this.queue.length?this.queue.length=0:z>0&&(this.queue=this.queue.slice(z)),h.length>0&&(this.queue=h.concat(this.queue));const D=performance.now()-t;if(a>0){D>this.frameBudgetMs&&this.droppedFrameCount++,this.timePerLastFrame=D,this.totalActionsLastFrame=a;let te;if(O.size>0||V.size>0){te=new Map;const W=new Set([...O.keys(),...V.keys()]);for(const ae of W)te.set(ae,{mutations:O.get(ae)??0,deferred:V.get(ae)??0})}this.frameLog.push({frameId:this.frameId,totalMs:D,actionCount:a,timingBreakdown:C,perApp:te}),this.frameLog.length>Gn&&this.frameLog.shift()}this.scheduleNext(t)}scheduleNext(e){const t=performance.now()-e;t+1>=this.frameBudgetMs?this.scheduleFrame():setTimeout(()=>{this.scheduleFrame()},this.frameBudgetMs-t)}getActionsForFrame(){const e=this.queue.length;if(e>25e3)return e;if(e>=nn)return Un;if(e>Dt)return Dt;const t=this.getAvgActionTime();return t>0?Math.max(1,Math.floor(this.frameBudgetMs*3/t)):2e3}shouldSkip(e){if(!this.enablePrioritySkipping)return!1;const t=e.mutation;return"optional"in t&&t.optional?this.isScrolling||this.queue.length>Dt/2||this.timePerLastFrame>this.frameBudgetMs+.2?!0:(this.enableViewportCulling&&t.action,!1):!1}recordTiming(e,t){t>0&&this.actionTimes.set(e,t+.02)}getAvgActionTime(){return this.totalActionsLastFrame===0?0:this.timePerLastFrame/this.totalActionsLastFrame}calcViewportSize(){this.viewportHeight=window.innerHeight||document.documentElement.clientHeight,this.viewportWidth=window.innerWidth||document.documentElement.clientWidth}isInViewport(e){const t=e.id;if(!t)return!0;const n=this.boundingRectCacheFrame.get(t);if(n!==void 0&&n+Kn>this.frameId)return this.boundingRectCache.get(t)??!0;const a=e.getBoundingClientRect(),i=a.top>=0&&a.left>=0&&a.bottom<=this.viewportHeight&&a.right<=this.viewportWidth;return this.boundingRectCache.set(t,i),this.boundingRectCacheFrame.set(t,this.frameId),i}setupScrollListener(){this.scrollAbort&&this.scrollAbort.abort(),this.scrollAbort=new AbortController,window.addEventListener("scroll",()=>{this.isScrolling=!0,this.scrollTimer!==null&&clearTimeout(this.scrollTimer),this.scrollTimer=setTimeout(()=>{this.isScrolling=!1},66)},{passive:!0,signal:this.scrollAbort.signal})}}function sn(s,e){const t={high:0,normal:1,low:2},n=t[s.priority],a=t[e.priority];if(n!==a)return n-a;const i="optional"in s.mutation&&s.mutation.optional?1:0,h="optional"in e.mutation&&e.mutation.optional?1:0;return i!==h?i-h:s.uid-e.uid}const Bt=16,Ot=4096,Jn=1,Qn=2;var $e=(s=>(s[s.BoundingRect=0]="BoundingRect",s[s.ComputedStyle=1]="ComputedStyle",s[s.NodeProperty=2]="NodeProperty",s[s.WindowProperty=3]="WindowProperty",s))($e||{});class Zn{constructor(e){d(this,"signal");d(this,"meta");d(this,"requestRegion");d(this,"responseRegion");d(this,"encoder",new TextEncoder);d(this,"decoder",new TextDecoder);d(this,"polling",!1);d(this,"pollChannel",null);this.signal=new Int32Array(e,0,4),this.meta=this.signal,this.requestRegion=new Uint8Array(e,Bt,Ot),this.responseRegion=new Uint8Array(e,Bt+Ot,e.byteLength-Bt-Ot)}poll(){if(Atomics.load(this.signal,0)!==Jn)return null;const t=Atomics.load(this.meta,1),n=Atomics.load(this.meta,2),a=this.requestRegion.slice(0,n),i=this.decoder.decode(a);return{queryType:t,data:i}}respond(e){const t=JSON.stringify(e),n=this.encoder.encode(t);this.responseRegion.set(n),Atomics.store(this.meta,3,n.byteLength),Atomics.store(this.signal,0,Qn),Atomics.notify(this.signal,0)}startPolling(e){if(!this.polling)if(this.polling=!0,typeof MessageChannel<"u"){this.pollChannel=new MessageChannel;let t=0;const n=()=>{var i,h;if(!this.polling)return;const a=this.poll();if(a){t=0;const C=e(a);this.respond(C),(i=this.pollChannel)==null||i.port2.postMessage(null)}else if(t++,t<=2)(h=this.pollChannel)==null||h.port2.postMessage(null);else{const C=Math.min(1<<t-3,16);setTimeout(()=>{var O;this.polling&&((O=this.pollChannel)==null||O.port2.postMessage(null))},C)}};this.pollChannel.port1.onmessage=n,this.pollChannel.port2.postMessage(null)}else{const t=setInterval(()=>{if(!this.polling){clearInterval(t);return}const n=this.poll();if(n){const a=e(n);this.respond(a)}},4)}}stopPolling(){this.polling=!1,this.pollChannel&&(this.pollChannel.port1.close(),this.pollChannel.port2.close(),this.pollChannel=null)}}function es(s){var i;const e=new Map,t=[],n=new Map,a=[];for(const h of s)if(h.causalEvent){const C=`event:${h.causalEvent.eventType}:${h.causalEvent.listenerId}:${h.causalEvent.timestamp}`;n.has(C)||n.set(C,[]),(i=n.get(C))==null||i.push(h)}else a.push(h);for(const[h,C]of n){const V=C[0].causalEvent,z={type:"event",id:h,label:`${V.eventType} (${V.listenerId})`,children:[]};for(const D of C){const te=`batch:${D.batchUid}`,W={type:"batch",id:te,label:`Batch #${D.batchUid} (${D.mutationCount} muts)`,children:[]};for(const ae of D.nodeIds){const pe=`node:${ae}`;e.has(pe)||e.set(pe,{type:"node",id:pe,label:`#${ae}`,children:[]}),W.children.push(pe)}e.set(te,W),z.children.push(te)}e.set(h,z),t.push(h)}for(const h of a){const C=`batch:${h.batchUid}`,O={type:"batch",id:C,label:`Batch #${h.batchUid} (${h.mutationCount} muts, no event)`,children:[]};for(const V of h.nodeIds){const z=`node:${V}`;e.has(z)||e.set(z,{type:"node",id:z,label:`#${V}`,children:[]}),O.children.push(z)}e.set(C,O),t.push(C)}return{nodes:e,roots:t}}class ts{constructor(){d(this,"batches",[]);d(this,"maxBatches",100)}recordBatch(e,t,n,a){this.batches.push({batchUid:e,causalEvent:a,nodeIds:new Set(t),mutationCount:n,timestamp:Date.now()}),this.batches.length>this.maxBatches&&this.batches.shift()}getBatches(){return this.batches.slice()}buildGraph(){return es(this.batches)}findBatchesForNode(e){return this.batches.filter(t=>t.nodeIds.has(e))}clear(){this.batches.length=0}}function kt(s){return s===0?"0 B":s<1024?`${s} B`:s<1024*1024?`${(s/1024).toFixed(1)} KB`:`${(s/(1024*1024)).toFixed(1)} MB`}function ns(s){return{entries:[...s],currentIndex:0,isPlaying:!1}}function an(s){return s.currentIndex>=s.entries.length?null:s.entries[s.currentIndex++]}function Ft(s,e){s.currentIndex=Math.max(0,Math.min(e,s.entries.length))}function ss(s){s.currentIndex=0,s.isPlaying=!1}function as(s){const e={version:1,exportedAt:new Date().toISOString(),...s};return JSON.stringify(e,os,2)}function os(s,e){return e instanceof Map?Object.fromEntries(e):e}function rs(s){const e=JSON.parse(s);if(!e||typeof e!="object")throw new Error("Invalid session: not an object");if(e.version!==1)throw new Error(`Unsupported session version: ${e.version}`);if(!Array.isArray(e.mutationLog))throw new Error("Invalid session: mutationLog must be an array");if(!Array.isArray(e.warningLog))throw new Error("Invalid session: warningLog must be an array");if(!Array.isArray(e.eventLog))throw new Error("Invalid session: eventLog must be an array");if(!Array.isArray(e.syncReadLog))throw new Error("Invalid session: syncReadLog must be an array");const t=1e4;return e.mutationLog.length>t&&(e.mutationLog=e.mutationLog.slice(-t)),e.warningLog.length>t&&(e.warningLog=e.warningLog.slice(-t)),e.eventLog.length>t&&(e.eventLog=e.eventLog.slice(-t)),e.syncReadLog.length>t&&(e.syncReadLog=e.syncReadLog.slice(-t)),e}function is(s,e){const t=new Blob([s],{type:"application/json"}),n=URL.createObjectURL(t),a=document.createElement("a");a.href=n,a.download=e,a.click(),URL.revokeObjectURL(n)}function Pt(s,e){if(s.length===0)return 0;const t=Math.ceil(e/100*s.length)-1;return s[Math.max(0,t)]}function on(s){if(s.length===0)return{p50:0,p95:0,p99:0};const e=[...s].sort((t,n)=>t-n);return{p50:Pt(e,50),p95:Pt(e,95),p99:Pt(e,99)}}function dt(s){return s>16?"red":s>5?"yellow":"green"}function rn(s){return s>50?"red":s>5?"yellow":"green"}function Ht(s){const e={type:s.type};return s.tag!==void 0&&(e.tag=s.tag),s.id!==void 0&&(e.id=s.id),s.className!==void 0&&(e.className=s.className),s.text!==void 0&&(e.text=s.text),s.attributes&&(e.attributes={...s.attributes}),s.children&&(e.children=s.children.map(Ht)),e}function ls(s,e){return!s&&!e?null:!s&&e?ht(e):s&&!e?ut(s):zt(s,e)}function ht(s){const e={diffType:"added",node:s};return s.children&&(e.children=s.children.map(ht)),e}function ut(s){const e={diffType:"removed",node:s};return s.children&&(e.children=s.children.map(ut)),e}function zt(s,e){const t=[];if(s.type!==e.type||s.tag!==e.tag)return{diffType:"changed",node:e,changes:["replaced"],children:[ut(s),ht(e)]};if(s.type==="element"&&e.type==="element"){const O=s.attributes??{},V=e.attributes??{},z=new Set([...Object.keys(O),...Object.keys(V)]);for(const D of z)O[D]!==V[D]&&t.push(`attr:${D}`);s.className!==e.className&&t.push("className")}s.text!==e.text&&t.push("text");const n=s.children??[],a=e.children??[],i=cs(n,a),C={diffType:t.length>0?"changed":"unchanged",node:e};return t.length>0&&(C.changes=t),i.length>0&&(C.children=i),C}function cs(s,e){const t=[],n=new Map,a=[];for(const h of s)h.id!=null?n.set(h.id,{node:h,used:!1}):a.push(h);let i=0;for(const h of e)if(h.id!=null){const C=n.get(h.id);C?(C.used=!0,t.push(zt(C.node,h))):t.push(ht(h))}else i<a.length?(t.push(zt(a[i],h)),i++):t.push(ht(h));for(const[,h]of n)h.used||t.push(ut(h.node));for(let h=i;h<a.length;h++)t.push(ut(a[h]));return t}function mn(s){return s.diffType!=="unchanged"?!0:s.children?s.children.some(mn):!1}const ds=200,ps=200,hs=200,us=200,Se=[],Ye=[],nt=[],Te=[];let Ie=0,pt=null,je=!1;function fs(s){je||(Se.push(s),Se.length>ds&&Se.shift())}function ms(s){je||(nt.push(s),nt.length>hs&&nt.shift())}function gs(s){je||(Te.push(s),Te.length>us&&Te.shift())}function ln(s){Ye.push(s),Ye.length>ps&&Ye.shift(),Ie++,pt==null||pt()}const ys=`
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
`;function P(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function tt(s){const e=new Date(s);if(Number.isNaN(e.getTime())){const h=new Date,C=String(h.getHours()).padStart(2,"0"),O=String(h.getMinutes()).padStart(2,"0"),V=String(h.getSeconds()).padStart(2,"0");return`${C}:${O}:${V}`}const t=String(e.getHours()).padStart(2,"0"),n=String(e.getMinutes()).padStart(2,"0"),a=String(e.getSeconds()).padStart(2,"0"),i=String(e.getMilliseconds()).padStart(3,"0");return`${t}:${n}:${a}.${i}`}function Me(s,e){return s.length>e?`${s.slice(0,e)}...`:s}function cn(s){if(s.length===0)return"";const e="▁▂▃▄▅▆▇█",t=Math.max(...s),n=Math.min(...s),a=t-n||1;return s.map(i=>e[Math.min(Math.floor((i-n)/a*7),7)]).join("")}function bs(){const s=document.createElement("div");s.id="__async-dom-devtools__";const e=s.attachShadow({mode:"open"}),t=document.createElement("style");t.textContent=ys,e.appendChild(t);const n=document.createElement("div");n.className="panel collapsed";const a=document.createElement("button");a.className="toggle-tab";const i=document.createElement("span");i.style.cssText="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background-color:#4ec9b0;vertical-align:middle;",a.appendChild(i);const h=document.createElement("span");h.textContent="async-dom ▲",a.appendChild(h),n.appendChild(a);const C=document.createElement("div");C.className="header-bar";const O=document.createElement("span");O.className="header-title",O.textContent="async-dom devtools";const V=document.createElement("span");V.className="import-indicator",V.style.display="none",O.appendChild(V),C.appendChild(O);const z=document.createElement("div");z.className="header-actions";const D=document.createElement("button");D.className="header-btn",D.textContent="⬤",D.title="Highlight DOM updates",D.style.fontSize="8px",D.style.color="#808080",D.addEventListener("click",()=>{bt=!bt,D.style.color=bt?"#4ec9b0":"#808080";const o=be();o&&o.enableHighlightUpdates(bt)}),z.appendChild(D);const te=document.createElement("button");te.className="header-btn",te.textContent="↓",te.title="Export debug session",z.appendChild(te);const W=document.createElement("button");W.className="header-btn",W.textContent="↑",W.title="Import debug session",z.appendChild(W);const ae=document.createElement("button");ae.className="header-btn",ae.textContent="↻",ae.title="Refresh data from workers",z.appendChild(ae);const pe=document.createElement("button");pe.className="header-btn",pe.textContent="▼",pe.title="Collapse",z.appendChild(pe),C.appendChild(z),n.appendChild(C);const he=document.createElement("div");he.className="app-bar",n.appendChild(he);let ue=null;const Ne=document.createElement("div");Ne.className="tab-bar";const Ve=["Tree","Performance","Log","Warnings","Graph"],Ue={},Re={};for(const o of Ve){const r=document.createElement("button");r.className=`tab-btn${o==="Tree"?" active":""}`,r.textContent=o,r.dataset.tab=o,Ne.appendChild(r),Ue[o]=r}n.appendChild(Ne);const c=document.createElement("span");c.className="tab-badge",c.style.display="none";let f="Tree";function L(o){f=o;for(const r of Ve)Ue[r].classList.toggle("active",r===o),Re[r].classList.toggle("active",r===o);o==="Warnings"&&(Ie=0,Rt()),Qe()}for(const o of Ve)Ue[o].addEventListener("click",()=>L(o));const S=document.createElement("div");S.className="tab-content active",S.innerHTML='<div class="tree-empty">Click refresh to load virtual DOM tree from worker.</div>',Re.Tree=S,n.appendChild(S);const _=document.createElement("div");_.className="tab-content",_.innerHTML='<div class="perf-row"><span class="perf-label">Loading...</span></div>',Re.Performance=_,n.appendChild(_);const ne=document.createElement("div");ne.className="tab-content";const se=document.createElement("div");se.className="log-toolbar";const H=document.createElement("input");H.className="log-filter",H.placeholder="Filter...",H.type="text",se.appendChild(H);const ve=document.createElement("span");ve.className="log-count",ve.textContent="0",se.appendChild(ve);const Z=document.createElement("button");Z.className="log-btn",Z.textContent="Pause",se.appendChild(Z);const ie=document.createElement("button");ie.className="log-btn active",ie.textContent="Auto-scroll",se.appendChild(ie);const U=document.createElement("button");U.className="log-btn",U.textContent="Clear",se.appendChild(U);const we=document.createElement("button");we.className="log-btn",we.textContent="Replay",se.appendChild(we),ne.appendChild(se);const fe=document.createElement("div");fe.className="replay-bar",fe.style.display="none";const ge=document.createElement("button");ge.className="replay-btn",ge.textContent="⏮",fe.appendChild(ge);const Ge=document.createElement("button");Ge.className="replay-btn",Ge.textContent="◀",fe.appendChild(Ge);const ke=document.createElement("button");ke.className="replay-btn",ke.textContent="▶",fe.appendChild(ke);const Oe=document.createElement("button");Oe.className="replay-btn",Oe.textContent="▶❘",Oe.title="Step forward one entry",fe.appendChild(Oe);const Fe=document.createElement("button");Fe.className="replay-btn",Fe.textContent="⏭",Fe.title="Skip to end",fe.appendChild(Fe);const G=document.createElement("input");G.type="range",G.className="replay-slider",G.min="0",G.max="0",G.value="0",fe.appendChild(G);const K=document.createElement("span");K.className="replay-position",K.textContent="0 / 0",fe.appendChild(K);const _e=document.createElement("button");_e.className="replay-btn",_e.textContent="1x",fe.appendChild(_e);const ye=document.createElement("button");ye.className="replay-btn replay-exit",ye.textContent="✕ Exit",fe.appendChild(ye);const oe=document.createElement("div");oe.className="log-list",oe.innerHTML='<div class="log-empty">No mutations captured yet.</div>',ne.appendChild(oe),ne.insertBefore(fe,oe),Re.Log=ne,n.appendChild(ne);const st=document.createElement("div");st.className="tab-content";const at=document.createElement("div");at.className="log-toolbar";const Xe=document.createElement("input");Xe.className="log-filter",Xe.placeholder="Filter warnings...",Xe.type="text",at.appendChild(Xe);const Je=document.createElement("button");Je.className="log-btn warn-view-toggle",Je.textContent="Chronological",at.appendChild(Je);const Pe=document.createElement("button");Pe.className="log-btn",Pe.textContent="Clear",at.appendChild(Pe),st.appendChild(at);const Le=document.createElement("div");Le.className="log-list",Le.innerHTML='<div class="warn-empty">No warnings captured yet.</div>',st.appendChild(Le),Re.Warnings=st,n.appendChild(st);const He=document.createElement("div");He.className="tab-content",He.innerHTML='<div class="graph-empty">No causality data yet. Interact with the app to generate event-mutation data.</div>',Re.Graph=He,n.appendChild(He),Ue.Warnings.appendChild(c),e.appendChild(n),document.body.appendChild(s);let ft=null,mt=null,gt=null,yt=!0;const ot=[],qt=30;let bt=!1,vt=null,xt=null;const Ke=[],Ut=60;let A=null,xe=null,wt=1;const Lt=[1,2,5];let J=null,Ae=null,ze=null,We=!1,qe=null;function De(){A&&(G.max=String(A.entries.length),G.value=String(A.currentIndex),K.textContent=`${A.currentIndex} / ${A.entries.length}`,ke.textContent=A.isPlaying?"⏸":"▶",ke.classList.toggle("active",A.isPlaying))}function yn(){J||(A=ns(Se),fe.style.display="flex",we.classList.add("active"),De(),Ee())}function Ct(){xe&&(clearInterval(xe),xe=null),A&&(A.isPlaying=!1,A=null),fe.style.display="none",we.classList.remove("active"),Ee()}function Kt(o){const r=be();if(!(r!=null&&r.replayMutation))return;const E=r.apps()[0];E&&r.replayMutation(o.mutation,E)}function Et(o){if(!A)return;const r=be();r!=null&&r.clearAndReapply&&r.clearAndReapply(A.entries,o)}function bn(){if(!A)return;const o=an(A);o&&Kt(o),De(),Ee()}function vn(){A&&(A.currentIndex>0&&(Ft(A,A.currentIndex-1),Et(A.currentIndex)),De(),Ee())}function xn(){A&&(ss(A),Et(0),De(),Ee())}function wn(){A&&(Ft(A,A.entries.length),Et(A.entries.length),De(),Ee())}function Yt(){if(A){if(A.isPlaying=!A.isPlaying,A.isPlaying){const o=Math.max(50,500/wt);xe=setInterval(()=>{if(!A||A.currentIndex>=A.entries.length){A&&(A.isPlaying=!1),xe&&(clearInterval(xe),xe=null),De();return}const r=an(A);r&&Kt(r),De(),Ee()},o)}else xe&&(clearInterval(xe),xe=null);De()}}function Cn(){const o=Lt.indexOf(wt);wt=Lt[(o+1)%Lt.length],_e.textContent=`${wt}x`,A!=null&&A.isPlaying&&(xe&&(clearInterval(xe),xe=null),A.isPlaying=!1,Yt())}we.addEventListener("click",()=>{A?Ct():yn()}),ge.addEventListener("click",xn),Ge.addEventListener("click",vn),ke.addEventListener("click",Yt),Oe.addEventListener("click",bn),Fe.addEventListener("click",wn),G.addEventListener("input",()=>{if(!A)return;const o=Number(G.value);Ft(A,o),Et(A.currentIndex),De(),Ee()}),_e.addEventListener("click",Cn),ye.addEventListener("click",Ct),te.addEventListener("click",()=>{var w;const o=be(),r=((w=o==null?void 0:o.scheduler)==null?void 0:w.stats())??{},E=(o==null?void 0:o.getAllAppsData())??{},l=Object.values(E)[0],$=as({mutationLog:J?J.mutationLog:[...Se],warningLog:J?J.warningLog:[...Ye],eventLog:J?J.eventLog:[...nt],syncReadLog:J?J.syncReadLog:[...Te],schedulerStats:r,tree:l==null?void 0:l.tree,appData:E}),q=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);is($,`async-dom-session-${q}.json`)}),W.addEventListener("click",()=>{const o=document.createElement("input");o.type="file",o.accept=".json",o.addEventListener("change",()=>{var l;const r=(l=o.files)==null?void 0:l[0];if(!r)return;const E=new FileReader;E.onload=()=>{try{const $=rs(E.result);En($)}catch($){console.error("[async-dom devtools] Import failed:",$)}},E.readAsText(r)}),o.click()});function jt(o){U.disabled=o,Z.disabled=o,ie.disabled=o,we.disabled=o,Pe.disabled=o;const r=o?"0.4":"1";U.style.opacity=r,Z.style.opacity=r,ie.style.opacity=r,we.style.opacity=r,Pe.style.opacity=r,o?(U.style.pointerEvents="none",Z.style.pointerEvents="none",ie.style.pointerEvents="none",we.style.pointerEvents="none",Pe.style.pointerEvents="none"):(U.style.pointerEvents="",Z.style.pointerEvents="",ie.style.pointerEvents="",we.style.pointerEvents="",Pe.style.pointerEvents="")}function En(o){J=o,A&&Ct(),V.textContent="[IMPORTED]",V.style.display="inline",jt(!0);let r=z.querySelector(".close-import-btn");r||(r=document.createElement("button"),r.className="header-btn close-import-btn",r.textContent="✕",r.title="Close imported session",r.style.color="#d7ba7d",r.addEventListener("click",Sn),z.insertBefore(r,z.firstChild)),Qe()}function Sn(){J=null,V.style.display="none",V.textContent="",jt(!1);const o=z.querySelector(".close-import-btn");o&&o.remove(),Qe()}function Tn(){var l;const o=be();if(!((l=o==null?void 0:o.scheduler)!=null&&l.stats))return;const r=o.scheduler.stats(),E=r.pending;E>1e3||!r.isRunning||r.lastFrameTimeMs>16?i.style.backgroundColor="#f44747":E>100||r.lastFrameTimeMs>12?i.style.backgroundColor="#d7ba7d":i.style.backgroundColor="#4ec9b0"}const Nn=setInterval(Tn,2e3);function be(){return globalThis.__ASYNC_DOM_DEVTOOLS__}function kn(){n.classList.remove("collapsed"),Vt(),$n()}function Mn(){n.classList.add("collapsed"),_t()}a.addEventListener("click",kn),pe.addEventListener("click",Mn);function Vt(){const o=be();o&&(o.refreshDebugData(),setTimeout(()=>{Gt(),Qe()},250))}ae.addEventListener("click",Vt);function Ln(){Ae=null,ze=null,We=!1,qe=null,vt=null,Nt=!1,rt=0,A&&Ct(),xt=null}function Gt(){const o=be();if(!o)return;const r=o.apps();if(r.length<=1){he.classList.remove("visible"),ue=r[0]??null;return}he.classList.add("visible"),he.innerHTML="";const E=document.createElement("span");E.className="app-label",E.textContent="Apps:",he.appendChild(E),(ue===null||!r.includes(ue))&&(ue=r[0]);for(const l of r){const $=document.createElement("button");$.className=`app-btn${l===ue?" active":""}`,$.textContent=l,$.addEventListener("click",()=>{ue!==l&&(ue=l,Ln()),Gt(),Qe()}),he.appendChild($)}}function Qe(){f==="Tree"?St():f==="Performance"?Tt():f==="Log"?Ee():f==="Warnings"?Ze():f==="Graph"&&Qt()}function Xt(o,r){var M;if(o.innerHTML="",r.id!=null){const p=document.createElement("div");p.className="sidebar-title",p.textContent="Node",o.appendChild(p);const u=document.createElement("div");u.className="sidebar-row",u.innerHTML=`<span class="sidebar-key">_nodeId</span><span class="sidebar-val">${r.id}</span>`,o.appendChild(u)}const E=document.createElement("div");if(E.className="sidebar-row",E.innerHTML=`<span class="sidebar-key">type</span><span class="sidebar-val">${P(r.type)}</span>`,o.appendChild(E),r.tag){const p=document.createElement("div");p.className="sidebar-row",p.innerHTML=`<span class="sidebar-key">tag</span><span class="sidebar-val">${P(r.tag)}</span>`,o.appendChild(p)}const l=((M=r.children)==null?void 0:M.length)??0,$=document.createElement("div");$.className="sidebar-row",$.innerHTML=`<span class="sidebar-key">children</span><span class="sidebar-val">${l}</span>`,o.appendChild($);const q=be();if(q&&r.id!=null){const p=q.findRealNode(r.id),u=p?p.isConnected:!1,g=document.createElement("div");g.className="sidebar-row",g.innerHTML=`<span class="sidebar-key">isConnected</span><span class="sidebar-val">${u}</span>`,o.appendChild(g)}const w=r.attributes??{},m=Object.keys(w);if(m.length>0){const p=document.createElement("div");p.className="sidebar-title",p.textContent="Attributes",o.appendChild(p);for(const u of m){const g=document.createElement("div");g.className="sidebar-row",g.innerHTML=`<span class="sidebar-key">${P(u)}</span><span class="sidebar-val" title="${P(w[u])}">${P(Me(w[u],30))}</span>`,o.appendChild(g)}}else if(r.type==="element"){const p=document.createElement("div");p.className="sidebar-title",p.textContent="Attributes",o.appendChild(p);const u=document.createElement("div");u.className="sidebar-empty",u.textContent="none",o.appendChild(u)}if(q&&r.id!=null){const p=q.getListenersForNode(r.id),u=document.createElement("div");if(u.className="sidebar-title",u.textContent=`Event Listeners (${p.length})`,o.appendChild(u),p.length===0){const g=document.createElement("div");g.className="sidebar-empty",g.textContent="none",o.appendChild(g)}else for(const g of p){const T=document.createElement("div");T.className="sidebar-listener",T.innerHTML=`<span class="sidebar-listener-event">${P(g.eventName)}</span><span class="sidebar-listener-id">${P(g.listenerId)}</span>`,o.appendChild(T)}}if(w.style){const p=document.createElement("div");p.className="sidebar-title",p.textContent="Inline Styles",o.appendChild(p);const u=w.style.split(";").filter(g=>g.trim());for(const g of u){const T=g.indexOf(":");if(T===-1)continue;const I=g.slice(0,T).trim(),y=g.slice(T+1).trim(),b=document.createElement("div");b.className="sidebar-row",b.innerHTML=`<span class="sidebar-key">${P(I)}</span><span class="sidebar-val">${P(y)}</span>`,o.appendChild(b)}}if(q&&r.id!=null){const p=q.findRealNode(r.id);if(p&&p.nodeType===1&&typeof getComputedStyle=="function"){const u=getComputedStyle(p),g=["display","position","width","height","margin","padding","color","backgroundColor","fontSize","fontFamily","overflow","visibility","opacity","zIndex"],T=document.createElement("div");T.className="sidebar-title",T.textContent="Computed Styles",o.appendChild(T);for(const I of g){const y=u.getPropertyValue(I.replace(/([A-Z])/g,"-$1").toLowerCase());if(y){const b=document.createElement("div");b.className="sidebar-row",b.innerHTML=`<span class="sidebar-key">${P(I)}</span><span class="sidebar-val sidebar-computed-val">${P(Me(y,24))}</span>`,o.appendChild(b)}}}}if(r.id!=null){const p=r.id,u=Se.filter(T=>T.mutation.id===p),g=document.createElement("div");if(g.className="sidebar-title",g.textContent=`Mutation History (${u.length})`,o.appendChild(g),u.length===0){const T=document.createElement("div");T.className="sidebar-empty",T.textContent="none captured",o.appendChild(T)}else{const T=u.slice(-10);for(const I of T){const y=I.mutation;let b="";y.name&&(b+=` ${y.name}`),y.property&&(b+=` .${y.property}`),y.value!==void 0&&(b+=`="${Me(String(y.value),20)}"`),y.tag&&(b+=` <${y.tag}>`),y.textContent!==void 0&&(b+=` "${Me(String(y.textContent),20)}"`),y.childId!==void 0&&(b+=` child:${y.childId}`);const k=document.createElement("div");k.className="sidebar-mutation",k.innerHTML=`<span class="sidebar-mut-time">${tt(I.timestamp)}</span> <span class="sidebar-mut-action">${P(I.action)}</span>`+(b?`<br><span style="color:#808080;font-size:9px;padding-left:4px">${P(b.trim())}</span>`:""),o.appendChild(k)}}}if(r.id!=null){const p=r.id,u=be();if(u!=null&&u.getMutationCorrelation){const T=u.getMutationCorrelation().getWhyUpdated(p),I=document.createElement("div");if(I.className="why-updated-title",I.textContent=`Why Updated? (${T.length})`,o.appendChild(I),T.length===0){const y=document.createElement("div");y.className="sidebar-empty",y.textContent="no correlation data",o.appendChild(y)}else{const y=T.slice(-8);for(const b of y){const k=document.createElement("div");k.className="why-updated-chain";let x=`<span class="why-chain-mutation">${P(b.action)}</span>`;b.batchUid!=null&&(x+='<span class="why-chain-arrow">→</span>',x+=`<span class="why-chain-batch">Batch #${b.batchUid}</span>`),b.causalEvent?(x+='<span class="why-chain-arrow">→</span>',x+=`<span class="why-chain-event">${P(b.causalEvent.eventType)}</span>`):(x+='<span class="why-chain-arrow">→</span>',x+='<span class="why-chain-none">no event</span>'),k.innerHTML=x,o.appendChild(k)}}}}o.classList.add("visible")}function St(){if(J){if(J.tree){const y=J.tree,b=document.createElement("div");b.className="tree-with-sidebar";const k=document.createElement("div");k.className="tree-main";const x=document.createElement("div");x.className="tree-refresh-bar";const B=document.createElement("span");B.className="tree-status",B.textContent="Imported session tree (read-only)",x.appendChild(B),k.appendChild(x);const le=document.createElement("div");le.className="node-sidebar";const N=be();N&&At(k,y,0,!0,N,le),b.appendChild(k),b.appendChild(le),S.innerHTML="",S.appendChild(b)}else S.innerHTML='<div class="tree-empty">Imported session has no tree data.</div>';return}const o=be();if(!o){S.innerHTML='<div class="tree-empty">Devtools API not available.</div>';return}const r=o.getAllAppsData(),E=Object.keys(r);if(E.length===0){S.innerHTML='<div class="tree-empty">No apps registered. Click ↻ to refresh.</div>';return}const l=ue&&r[ue]?ue:E[0],$=r[l];if(!$||!$.tree){S.innerHTML='<div class="tree-empty">No virtual DOM tree received yet. Click ↻ to refresh.</div>';return}const q=$.tree,w=document.createElement("div");w.className="tree-with-sidebar";const m=document.createElement("div");m.className="tree-main";const M=document.createElement("div");M.className="snapshot-bar";const p=document.createElement("button");if(p.className="snapshot-btn",p.textContent=Ae?ze?"Reset Snapshots":"Snapshot B":"Snapshot A",p.addEventListener("click",()=>{Ae&&ze?(Ae=null,ze=null,We=!1,qe=null):Ae?ze=Ht(q):Ae=Ht(q),St()}),M.appendChild(p),Ae&&ze){const y=document.createElement("button");y.className="snapshot-btn",y.textContent=We?"Hide Diff":"Show Diff",y.addEventListener("click",()=>{We=!We,We?qe=ls(Ae,ze):qe=null,St()}),M.appendChild(y)}const u=document.createElement("span");u.className="snapshot-info",Ae&&ze?(u.textContent="2 snapshots captured",We&&qe&&(u.textContent+=mn(qe)?" (changes found)":" (no changes)")):Ae&&(u.textContent="1 snapshot captured"),M.appendChild(u),m.appendChild(M);const g=document.createElement("div");g.className="tree-refresh-bar";const T=document.createElement("span");T.className="tree-status",T.textContent=`Virtual DOM for app: ${l}`,g.appendChild(T),m.appendChild(g);const I=document.createElement("div");I.className="node-sidebar",We&&qe?Jt(m,qe,0,!0):At(m,q,0,!0,o,I),w.appendChild(m),w.appendChild(I),S.innerHTML="",S.appendChild(w),vt&&Xt(I,vt)}function At(o,r,E,l,$,q){const w=document.createElement("div");w.className=`tree-node${l?" expanded":""}`;const m=document.createElement("div");m.className="tree-line",m.style.paddingLeft=`${E*14}px`;function M(){var B;const x=(B=o.closest(".tree-with-sidebar"))==null?void 0:B.querySelector(".tree-line.selected");x&&x.classList.remove("selected"),m.classList.add("selected"),vt=r,Xt(q,r)}if(r.type==="text"){const x=document.createElement("span");x.className="tree-toggle",m.appendChild(x);const B=document.createElement("span");if(B.className="tree-text-node",B.textContent=`"${Me((r.text??"").trim(),50)}"`,m.appendChild(B),r.id!=null){const le=document.createElement("span");le.className="tree-nodeid",le.textContent=`_${r.id}`,m.appendChild(le)}m.addEventListener("click",M),w.appendChild(m),o.appendChild(w);return}if(r.type==="comment"){const x=document.createElement("span");x.className="tree-toggle",m.appendChild(x);const B=document.createElement("span");B.className="tree-comment",B.textContent=`<!-- ${Me(r.text??"",40)} -->`,m.appendChild(B),m.addEventListener("click",M),w.appendChild(m),o.appendChild(w);return}const p=r.children??[],u=p.length>0,g=document.createElement("span");g.className="tree-toggle",g.textContent=u?l?"▼":"▶":" ",m.appendChild(g);const T=(r.tag??"???").toLowerCase(),I=document.createElement("span");let y=`<span class="tree-tag">&lt;${P(T)}</span>`;const b=r.attributes??{};if(b.id&&(y+=` <span class="tree-attr-name">id</span>=<span class="tree-attr-value">"${P(b.id)}"</span>`),r.className){const x=Me(r.className,30);y+=` <span class="tree-attr-name">class</span>=<span class="tree-attr-value">"${P(x)}"</span>`}let k=0;for(const x in b)if(!(x==="id"||x==="class")){if(k>=2)break;y+=` <span class="tree-attr-name">${P(x)}</span>=<span class="tree-attr-value">"${P(Me(b[x],20))}"</span>`,k++}if(y+='<span class="tree-tag">&gt;</span>',I.innerHTML=y,m.appendChild(I),r.id!=null){const x=document.createElement("span");x.className="tree-nodeid",x.textContent=`_${r.id}`,m.appendChild(x)}if(m.addEventListener("click",x=>{if(u&&x.target===g){w.classList.toggle("expanded"),g.textContent=w.classList.contains("expanded")?"▼":"▶";return}if(M(),r.id!=null){const B=$.findRealNode(r.id);if(B&&"scrollIntoView"in B){B.scrollIntoView({behavior:"smooth",block:"center"});const le=B.style.outline,N=B.style.outlineOffset;B.style.outline="3px solid #007acc",B.style.outlineOffset="2px",setTimeout(()=>{B.style.outline=le,B.style.outlineOffset=N},1500)}}}),w.appendChild(m),u){const x=document.createElement("div");x.className="tree-children";for(const B of p)At(x,B,E+1,E<2,$,q);w.appendChild(x)}o.appendChild(w)}function Jt(o,r,E,l,$,q){const w=r.node,m=document.createElement("div");m.className=`tree-node${l?" expanded":""}`;const M=document.createElement("div");M.className="tree-line",M.style.paddingLeft=`${E*14}px`,r.diffType==="added"?M.classList.add("diff-added"):r.diffType==="removed"?M.classList.add("diff-removed"):r.diffType==="changed"&&M.classList.add("diff-changed");const p=r.children??[],u=p.length>0;if(w.type==="text"){const k=document.createElement("span");k.className="tree-toggle",M.appendChild(k);const x=document.createElement("span");x.className="tree-text-node",x.textContent=`"${Me((w.text??"").trim(),50)}"`,M.appendChild(x),$t(M,r),m.appendChild(M),o.appendChild(m);return}if(w.type==="comment"){const k=document.createElement("span");k.className="tree-toggle",M.appendChild(k);const x=document.createElement("span");x.className="tree-comment",x.textContent=`<!-- ${Me(w.text??"",40)} -->`,M.appendChild(x),$t(M,r),m.appendChild(M),o.appendChild(m);return}const g=document.createElement("span");g.className="tree-toggle",g.textContent=u?l?"▼":"▶":" ",M.appendChild(g);const T=(w.tag??"???").toLowerCase(),I=document.createElement("span");let y=`<span class="tree-tag">&lt;${P(T)}</span>`;const b=w.attributes??{};if(b.id&&(y+=` <span class="tree-attr-name">id</span>=<span class="tree-attr-value">"${P(b.id)}"</span>`),w.className&&(y+=` <span class="tree-attr-name">class</span>=<span class="tree-attr-value">"${P(Me(w.className,30))}"</span>`),y+='<span class="tree-tag">&gt;</span>',I.innerHTML=y,M.appendChild(I),w.id!=null){const k=document.createElement("span");k.className="tree-nodeid",k.textContent=`_${w.id}`,M.appendChild(k)}if($t(M,r),u&&g.addEventListener("click",k=>{k.stopPropagation(),m.classList.toggle("expanded"),g.textContent=m.classList.contains("expanded")?"▼":"▶"}),m.appendChild(M),u){const k=document.createElement("div");k.className="tree-children";for(const x of p)Jt(k,x,E+1,E<2);m.appendChild(k)}o.appendChild(m)}function $t(o,r){if(r.diffType==="unchanged")return;const E=document.createElement("span");E.className=`diff-marker ${r.diffType}`,r.diffType==="added"?E.textContent="+ADD":r.diffType==="removed"?E.textContent="-DEL":r.diffType==="changed"&&(E.textContent=`~${(r.changes??[]).join(",")}`),o.appendChild(E)}function Tt(){if(J){const N=J.schedulerStats;let v='<div class="perf-section-title">Imported Session (read-only)</div>';for(const[F,R]of Object.entries(N))v+=`<div class="perf-row"><span class="perf-label">${P(String(F))}</span><span class="perf-value">${P(String(R))}</span></div>`;v+=`<div class="perf-row"><span class="perf-label">Exported At</span><span class="perf-value">${P(J.exportedAt)}</span></div>`,v+=`<div class="perf-row"><span class="perf-label">Mutations</span><span class="perf-value">${J.mutationLog.length}</span></div>`,v+=`<div class="perf-row"><span class="perf-label">Warnings</span><span class="perf-value">${J.warningLog.length}</span></div>`,v+=`<div class="perf-row"><span class="perf-label">Events</span><span class="perf-value">${J.eventLog.length}</span></div>`,v+=`<div class="perf-row"><span class="perf-label">Sync Reads</span><span class="perf-value">${J.syncReadLog.length}</span></div>`,_.innerHTML=v;return}const o=be();if(!o){_.innerHTML='<div class="perf-row"><span class="perf-label">Devtools API not available.</span></div>';return}const r=o.scheduler.stats(),E=r.pending;ot.push(E),ot.length>qt&&ot.shift();let l="";l+='<div class="perf-section-title">Scheduler<button class="flush-btn" id="flush-btn">⏩ Flush</button></div>';let $="";E>1e3?$="red":E>100?$="yellow":$="green",l+=`<div class="perf-row"><span class="perf-label">Pending</span><span class="perf-value ${$}">${E}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Frame ID</span><span class="perf-value">${r.frameId}</span></div>`;const q=r.lastFrameTimeMs>16?"red":r.lastFrameTimeMs>12?"yellow":"green";l+=`<div class="perf-row"><span class="perf-label">Frame Time</span><span class="perf-value ${q}">${r.lastFrameTimeMs.toFixed(1)}ms</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Frame Actions</span><span class="perf-value">${r.lastFrameActions}</span></div>`;const w=r.isRunning?"green":"yellow";l+=`<div class="perf-row"><span class="perf-label">Running</span><span class="perf-value ${w}">${r.isRunning?"Yes":"No"}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Last Tick</span><span class="perf-value">${r.lastTickTime>0?`${r.lastTickTime.toFixed(0)}ms`:"N/A"}</span></div>`;const m=r.workerToMainLatencyMs;m>0&&(Ke.push(m),Ke.length>Ut&&Ke.shift());const M=dt(m);l+=`<div class="perf-row"><span class="perf-label">Worker→Main</span><span class="perf-value ${M}">${m>0?`${m.toFixed(1)}ms`:"N/A"}</span></div>`;const p=r.enqueueToApplyMs,u=dt(p);if(l+=`<div class="perf-row"><span class="perf-label">Enqueue→Apply</span><span class="perf-value ${u}">${p>0?`${p.toFixed(1)}ms`:"N/A"}</span></div>`,Ke.length>0){const N=on(Ke);l+=`<div class="perf-row"><span class="perf-label">Latency P50</span><span class="perf-value ${dt(N.p50)}">${N.p50.toFixed(1)}ms</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Latency P95</span><span class="perf-value ${dt(N.p95)}">${N.p95.toFixed(1)}ms</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Latency P99</span><span class="perf-value ${dt(N.p99)}">${N.p99.toFixed(1)}ms</span></div>`}Ke.length>1&&(l+=`<div class="perf-row"><span class="perf-label">Latency (${Ut})</span><span class="perf-sparkline">${cn(Ke)}</span></div>`);const g=r.droppedFrameCount,T=g>0?"red":"green";l+=`<div class="perf-row"><span class="perf-label">Dropped Frames</span><span class="perf-value ${T}">${g}</span></div>`,ot.length>1&&(l+=`<div class="perf-row"><span class="perf-label">Queue (${qt}f)</span><span class="sparkline-with-threshold"><span class="perf-sparkline">${cn(ot)}</span><span class="sparkline-threshold"></span></span></div>`);const I=o.apps();l+=`<div class="perf-row"><span class="perf-label">Apps</span><span class="perf-value">${I.length}</span></div>`;const y=o.getAllAppsData();for(const N of I){const v=y[N];if(!(v!=null&&v.workerStats))continue;const F=v.workerStats;l+=`<div class="perf-section-title">Worker: ${P(N)}</div>`,l+=`<div class="perf-row"><span class="perf-label">Mutations Added</span><span class="perf-value">${F.added}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Mutations Coalesced</span><span class="perf-value">${F.coalesced}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Mutations Flushed</span><span class="perf-value">${F.flushed}</span></div>`;const R=F.added>0?(F.coalesced/F.added*100).toFixed(1):"0.0",Y=Number.parseFloat(R)>50?"green":Number.parseFloat(R)>20?"yellow":"";l+=`<div class="perf-row"><span class="perf-label">Coalescing Ratio</span><span class="perf-value ${Y}">${R}%</span></div>`}if(o.debugStats){const N=o.debugStats();l+='<div class="perf-section-title">Main Thread Stats</div>';const v=[["mutationsAdded","Mutations Added"],["mutationsCoalesced","Mutations Coalesced"],["mutationsFlushed","Mutations Flushed"],["mutationsApplied","Mutations Applied"],["eventsForwarded","Events Forwarded"],["eventsDispatched","Events Dispatched"],["syncReadRequests","Sync Read Requests"],["syncReadTimeouts","Sync Read Timeouts"]];for(const[F,R]of v){const Y=N[F]??0,j=F==="syncReadTimeouts"&&Y>0?"red":"";l+=`<div class="perf-row"><span class="perf-label">${P(R)}</span><span class="perf-value ${j}">${Y}</span></div>`}}const b=o.scheduler.frameLog();if(b.length>0){l+='<div class="frame-section-title">Frames</div>';const N=16;for(const v of b){const F=Math.min(v.totalMs/N*100,100),R=v.totalMs/N;let Y;R>1?Y="red":R>.5?Y="yellow":Y="green";const j=v.totalMs>N?" !":"";if(l+=`<div class="frame-bar-row" data-frame-id="${v.frameId}">`,l+=`<span class="frame-label">#${v.frameId}</span>`,l+=`<span class="frame-bar-track"><span class="frame-bar-fill ${Y}" style="width:${F.toFixed(1)}%"></span></span>`,l+=`<span class="frame-info">${v.totalMs.toFixed(1)}ms / ${N}ms (${v.actionCount})${j}</span>`,l+="</div>",xt===v.frameId){l+='<div class="frame-detail">';const X=[...v.timingBreakdown.entries()].sort((ce,Q)=>Q[1]-ce[1]);for(const[ce,Q]of X)l+=`<div class="frame-detail-row"><span class="frame-detail-action">${P(ce)}</span><span class="frame-detail-time">${Q.toFixed(2)}ms</span></div>`;l+="</div>"}}}for(const N of I){const v=y[N];if(!(v!=null&&v.perTypeCoalesced))continue;const F=v.perTypeCoalesced,R=Object.keys(F);if(R.length!==0){l+=`<div class="perf-section-title">Coalescing: ${P(N)}</div>`;for(const Y of R){const j=F[Y],X=j.added>0?(j.coalesced/j.added*100).toFixed(0):"0";l+='<div class="coalesce-row">',l+=`<span class="coalesce-action">${P(Y)}</span>`,l+=`<span class="coalesce-detail">${j.added} added, ${j.coalesced} coalesced</span>`,l+=`<span class="coalesce-pct">(${X}%)</span>`,l+="</div>"}}}if(o.getWorkerPerfEntries){const N=o.getWorkerPerfEntries(),v=Object.keys(N);for(const F of v){const R=N[F];if(!R||R.length===0)continue;l+=`<div class="perf-section-title">Worker CPU: ${P(F)}</div>`;const Y=R.reduce((ee,me)=>ee+me.duration,0),j=Math.max(...R.map(ee=>ee.duration)),X=R.filter(ee=>ee.name.includes(":event:")),ce=R.filter(ee=>ee.name.includes(":flush:")),Q=X.reduce((ee,me)=>ee+me.duration,0),de=ce.reduce((ee,me)=>ee+me.duration,0);l+=`<div class="worker-util"><span class="worker-util-label">Total worker time: </span><span class="worker-util-value">${Y.toFixed(1)}ms</span></div>`,l+=`<div class="worker-util"><span class="worker-util-label">Event handlers: </span><span class="worker-util-value">${Q.toFixed(1)}ms (${X.length} calls)</span></div>`,l+=`<div class="worker-util"><span class="worker-util-label">Flush/coalesce: </span><span class="worker-util-value">${de.toFixed(1)}ms (${ce.length} calls)</span></div>`;const Ce=R.slice().sort((ee,me)=>me.duration-ee.duration).slice(0,10);for(const ee of Ce){const me=j>0?Math.max(ee.duration/j*100,2):0,lt=ee.name.replace("async-dom:","");l+='<div class="worker-perf-bar">',l+=`<span class="worker-perf-name" title="${P(ee.name)}">${P(lt)}</span>`,l+=`<span class="worker-perf-track"><span class="worker-perf-fill" style="width:${me.toFixed(1)}%"></span></span>`,l+=`<span class="worker-perf-duration">${ee.duration.toFixed(2)}ms</span>`,l+="</div>"}}}if(b.length>0){const N=b.filter(v=>v.perApp&&v.perApp.size>0);if(N.length>0){l+='<div class="perf-section-title">Multi-App Interleaving</div>';const v=new Set;for(const j of N)if(j.perApp)for(const X of j.perApp.keys())v.add(X);const F=new Map,R=["#569cd6","#4ec9b0","#d7ba7d","#c586c0","#f44747","#ce9178","#6a9955"];let Y=0;for(const j of v)F.set(j,R[Y%R.length]),Y++;l+='<div class="multiapp-legend">';for(const[j,X]of F)l+=`<span class="multiapp-legend-item"><span class="multiapp-legend-dot" style="background:${X}"></span>${P(j)}</span>`;l+="</div>";for(const j of N.slice(-20)){const X=j.perApp;let ce=0,Q=0;for(const[,de]of X)ce+=de.mutations,Q+=de.deferred;if(ce!==0){l+='<div class="multiapp-frame">',l+=`<span class="multiapp-frame-label">#${j.frameId}</span>`,l+='<span class="multiapp-stacked-bar">';for(const[de,Ce]of X){const ee=Ce.mutations/ce*100,me=F.get(de)??"#569cd6";l+=`<span class="multiapp-segment" style="width:${ee.toFixed(1)}%;background:${me}" title="${P(de)}: ${Ce.mutations} muts, ${Ce.deferred} deferred"></span>`}l+="</span>",l+=`<span class="multiapp-info">${ce} muts${Q>0?` (${Q} def)`:""}</span>`,l+="</div>"}}}}if(Se.length>0){const N=new Map;for(const R of Se)N.set(R.action,(N.get(R.action)??0)+1);const v=[...N.entries()].sort((R,Y)=>Y[1]-R[1]),F=v.length>0?v[0][1]:1;l+='<div class="perf-section-title">Mutation Types</div>';for(const[R,Y]of v){const j=Math.max(Y/F*100,2);l+='<div class="chart-bar-row">',l+=`<span class="chart-bar-label">${P(R)}</span>`,l+=`<span class="chart-bar-track"><span class="chart-bar-fill" style="width:${j.toFixed(1)}%"></span></span>`,l+=`<span class="chart-bar-value">${Y}</span>`,l+="</div>"}}if(Te.length>0){const N=Te.length,v=Te.filter(Q=>Q.result==="timeout").length,F=N>0?(v/N*100).toFixed(1):"0.0",R=Te.map(Q=>Q.latencyMs),Y=on(R);l+='<div class="perf-section-title">Sync Reads</div>',l+=`<div class="perf-row"><span class="perf-label">Total</span><span class="perf-value">${N}</span></div>`;const j=v>0?"red":"green";l+=`<div class="perf-row"><span class="perf-label">Timeout Rate</span><span class="perf-value ${j}">${F}% (${v})</span></div>`,l+=`<div class="perf-row"><span class="perf-label">P95 Latency</span><span class="perf-value ${rn(Y.p95)}">${Y.p95.toFixed(1)}ms</span></div>`,l+='<div class="heatmap-container">';const X=Te.slice(-100),ce=["boundingRect","computedStyle","nodeProperty","windowProperty"];for(let Q=0;Q<X.length;Q++){const de=X[Q],Ce=rn(de.latencyMs),ee=ce[de.queryType]??`query:${de.queryType}`;l+=`<div class="heatmap-block ${Ce}" data-sync-read-idx="${Q}" title="${de.latencyMs.toFixed(1)}ms ${ee} node=${de.nodeId} ${de.result}"></div>`}l+="</div>"}if(o.getTransportStats){const N=o.getTransportStats(),v=Object.keys(N);if(v.length>0){l+='<div class="perf-section-title">Transport</div>';for(const F of v){const R=N[F];if(!R)continue;v.length>1&&(l+=`<div class="perf-row"><span class="perf-label" style="font-weight:600">App: ${P(F)}</span><span class="perf-value"></span></div>`),l+=`<div class="perf-row"><span class="perf-label">Messages Sent</span><span class="perf-value">${R.messageCount}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Total Bytes</span><span class="perf-value">${kt(R.totalBytes)}</span></div>`;const Y=R.messageCount>0?Math.round(R.totalBytes/R.messageCount):0;l+=`<div class="perf-row"><span class="perf-label">Avg Message Size</span><span class="perf-value">${kt(Y)}</span></div>`;const j=R.largestMessageBytes>102400?"red":"",X=R.largestMessageBytes>102400?'<span class="transport-warn">[!] exceeds 100KB</span>':"";l+=`<div class="perf-row"><span class="perf-label">Largest Message</span><span class="perf-value ${j}">${kt(R.largestMessageBytes)}${X}</span></div>`;const ce=R.lastMessageBytes>102400?"red":"",Q=R.lastMessageBytes>102400?'<span class="transport-warn">[!] exceeds 100KB</span>':"";l+=`<div class="perf-row"><span class="perf-label">Last Message</span><span class="perf-value ${ce}">${kt(R.lastMessageBytes)}${Q}</span></div>`}}}_.innerHTML=l;const k=_.querySelectorAll(".heatmap-block"),x=["boundingRect","computedStyle","nodeProperty","windowProperty"];for(const N of k)N.addEventListener("click",v=>{const F=v.currentTarget,R=F.querySelector(".heatmap-tooltip");if(R){R.remove();return}for(const de of k){const Ce=de.querySelector(".heatmap-tooltip");Ce&&Ce.remove()}const Y=Number(F.dataset.syncReadIdx),X=Te.slice(-100)[Y];if(!X)return;const ce=x[X.queryType]??`query:${X.queryType}`,Q=document.createElement("div");Q.className="heatmap-tooltip",Q.textContent=`${ce} node=${X.nodeId} ${X.latencyMs.toFixed(1)}ms ${X.result}`,F.appendChild(Q)});const B=_.querySelector("#flush-btn");B&&B.addEventListener("click",N=>{N.stopPropagation();const v=be();v&&v.scheduler.flush(),Tt()});const le=_.querySelectorAll(".frame-bar-row");for(const N of le)N.addEventListener("click",()=>{const v=Number(N.dataset.frameId);xt=xt===v?null:v,Tt()})}function Qt(){const o=be();if(!(o!=null&&o.getCausalityTracker)){He.innerHTML='<div class="graph-empty">Causality tracker not available.</div>';return}const E=o.getCausalityTracker().buildGraph();if(E.roots.length===0){He.innerHTML='<div class="graph-empty">No causality data yet. Interact with the app to generate event-to-mutation data.</div>';return}He.innerHTML="";const l=document.createElement("div");l.className="graph-container";for(const $ of E.roots)Zt(l,E,$,0);He.appendChild(l)}function Zt(o,r,E,l){const $=r.nodes.get(E);if(!$)return;const q=document.createElement("div");q.style.paddingLeft=`${l*16}px`;const w=document.createElement("div");let m="graph-node";$.type==="event"?m+=" event-node":$.type==="batch"?m+=" batch-node":m+=" dom-node",w.className=m;const M=document.createElement("span");M.className=`graph-node-type ${$.type}`,M.textContent=$.type==="event"?"EVT":$.type==="batch"?"BAT":"NOD",w.appendChild(M);const p=document.createElement("span");if(p.className="graph-node-label",p.textContent=$.label,w.appendChild(p),q.appendChild(w),o.appendChild(q),$.children.length>0){const u=document.createElement("div");u.className="graph-children";for(const g of $.children)Zt(u,r,g,l+1);o.appendChild(u)}}let rt=0,Nt=!1;Z.addEventListener("click",()=>{je=!je,Z.textContent=je?"Resume":"Pause",Z.classList.toggle("active",je)}),ie.addEventListener("click",()=>{yt=!yt,ie.classList.toggle("active",yt)});function An(o){switch(o){case"createNode":case"createComment":case"appendChild":case"bodyAppendChild":case"headAppendChild":case"insertBefore":return"color-green";case"setAttribute":case"removeAttribute":case"setStyle":case"setClassName":case"setProperty":case"setTextContent":case"setHTML":case"insertAdjacentHTML":return"color-blue";case"removeNode":case"removeChild":return"color-red";default:return""}}function en(o){const r=document.createElement("div"),E=An(o.action);r.className=`log-entry${E?` ${E}`:""}`;const l=document.createElement("span");l.className="log-time",l.textContent=tt(o.timestamp),r.appendChild(l);const $=document.createElement("span");$.className="log-action",$.textContent=o.action,r.appendChild($);const q=document.createElement("span");q.className="log-detail";const w="id"in o.mutation?o.mutation.id:void 0;let m=w!=null?`#${w}`:"";const M=o.mutation;return M.tag&&(m+=` tag=${M.tag}`),M.name&&o.action!=="addEventListener"&&(m+=` ${M.name}`),M.property&&(m+=` ${M.property}`),q.textContent=m,r.appendChild(q),r}function Ee(){const o=J?J.mutationLog:Se,r=J?J.eventLog:nt,E=J?J.syncReadLog:Te,l=A?A.entries.slice(0,A.currentIndex):o;if(ve.textContent=String(l.length),l.length===0){if(rt!==0||A){const p=A?"Replay position: 0. Step forward to see mutations.":"No mutations captured yet.";oe.innerHTML=`<div class="log-empty">${p}</div>`,rt=0}return}const $=H.value.toLowerCase().trim(),q=document.createDocumentFragment(),w=[];let m=null;for(const p of l){if($&&!p.action.toLowerCase().includes($))continue;const u=p.batchUid;u!=null&&m!==null&&m.batchUid===u?m.entries.push(p):(m={batchUid:u,entries:[p]},w.push(m))}for(const p of w){if(p.batchUid==null||p.entries.length<=1){for(const k of p.entries)q.appendChild(en(k));continue}const u=document.createElement("div");u.className="batch-group";const g=document.createElement("div");g.className="batch-header";const T=document.createElement("span");T.className="batch-toggle",T.textContent="▶",g.appendChild(T);const I=document.createElement("span");I.className="batch-uid",I.textContent=`Batch #${p.batchUid}`,g.appendChild(I);const y=document.createElement("span");y.className="batch-count",y.textContent=`— ${p.entries.length} mutations`,g.appendChild(y),g.addEventListener("click",()=>{u.classList.toggle("expanded"),T.textContent=u.classList.contains("expanded")?"▼":"▶"}),u.appendChild(g);const b=document.createElement("div");b.className="batch-entries";for(const k of p.entries)b.appendChild(en(k));u.appendChild(b),q.appendChild(u)}if(oe.innerHTML="",oe.appendChild(q),A&&A.currentIndex>0){const p=oe.querySelectorAll(".log-entry"),u=A.currentIndex-1;u<p.length&&(p[u].classList.add("replay-highlight"),p[u].scrollIntoView({block:"nearest"}))}const M=be();if(M){const p=M.getEventTraces();if(p.length>0){const u=document.createElement("div");u.className="event-trace-section";const g=document.createElement("div");g.className="event-trace-title",g.textContent=`Event Round-Trips (${p.length})`,u.appendChild(g);const T=p.slice(-20);let I=1;for(const y of T){const b=y.serializeMs+(y.transportMs??0)+(y.dispatchMs??0);b>I&&(I=b)}for(const y of T){const b=y.serializeMs,k=y.transportMs??0,x=y.dispatchMs??0,B=y.mutationCount??Se.filter(me=>me.timestamp>=y.timestamp&&me.timestamp<=y.timestamp+100).length,le=b+k+x,N=120/(I||1),v=document.createElement("div");v.className="event-timeline";const F=document.createElement("span");F.className="event-trace-type",F.style.cssText="width:60px;flex-shrink:0;font-size:10px;overflow:hidden;text-overflow:ellipsis;",F.textContent=`[${y.eventType}]`,v.appendChild(F);const R=document.createElement("span");R.className="event-phase serialize",R.style.width=`${Math.max(b*N,4)}px`,R.title=`serialize: ${b.toFixed(1)}ms`,v.appendChild(R);const Y=document.createElement("span");Y.className="event-phase-label",Y.textContent=`${b.toFixed(1)}ms`,v.appendChild(Y);const j=document.createElement("span");j.className="event-phase-label",j.textContent="→",v.appendChild(j);const X=document.createElement("span");X.className="event-phase transport",X.style.width=`${Math.max(k*N,4)}px`,X.title=`transport: ${k.toFixed(1)}ms`,v.appendChild(X);const ce=document.createElement("span");ce.className="event-phase-label",ce.textContent=`${k.toFixed(1)}ms`,v.appendChild(ce);const Q=document.createElement("span");Q.className="event-phase-label",Q.textContent="→",v.appendChild(Q);const de=document.createElement("span");de.className="event-phase dispatch",de.style.width=`${Math.max(x*N,4)}px`,de.title=`dispatch: ${x.toFixed(1)}ms`,v.appendChild(de);const Ce=document.createElement("span");if(Ce.className="event-phase-label",Ce.textContent=`${x.toFixed(1)}ms`,v.appendChild(Ce),B>0){const me=document.createElement("span");me.className="event-phase-label",me.textContent="→",v.appendChild(me);const lt=document.createElement("span");lt.className="event-mutation-count",lt.textContent=`${B} mut${B!==1?"s":""}`,v.appendChild(lt)}const ee=document.createElement("div");ee.className="event-timeline-detail",ee.innerHTML=`<div><strong>${P(y.eventType)}</strong> total: ${le.toFixed(1)}ms</div><div>main:serialize ${b.toFixed(2)}ms</div><div>transport ${k.toFixed(2)}ms</div><div>worker:dispatch ${x.toFixed(2)}ms</div><div>mutations generated: ${B}</div>`,v.addEventListener("click",()=>{ee.classList.toggle("visible")}),u.appendChild(v),u.appendChild(ee)}oe.appendChild(u)}}if(r.length>0){const p=document.createElement("div");p.className="log-section-title",p.textContent=`Events (${r.length})`,oe.appendChild(p);const u=r.slice(-50);for(const g of u){const T=document.createElement("div");T.className="log-entry event-entry";const I=document.createElement("span");I.className="log-time",I.textContent=tt(g.timestamp),T.appendChild(I);const y=document.createElement("span");y.className="log-action",y.textContent=g.eventType,T.appendChild(y);const b=document.createElement("span");b.className="log-detail",b.textContent=`${g.phase}→${g.phase==="serialize"?"dispatch":"done"} targetId=${g.targetId??"?"}`,T.appendChild(b),oe.appendChild(T)}}if(E.length>0){const p=document.createElement("div");p.className="log-section-title",p.textContent=`Sync Reads (${E.length})`,oe.appendChild(p);const u=E.slice(-50);for(const g of u){const T=document.createElement("div");T.className="log-entry syncread-entry";const I=document.createElement("span");I.className="log-time",I.textContent=tt(g.timestamp),T.appendChild(I);const y=document.createElement("span");y.className="log-action";const b=["boundingRect","computedStyle","nodeProperty","windowProperty"];y.textContent=b[g.queryType]??`query:${g.queryType}`,T.appendChild(y);const k=document.createElement("span");k.className="log-detail",k.textContent=`node=${g.nodeId} ${g.latencyMs.toFixed(1)}ms ${g.result}`,T.appendChild(k),oe.appendChild(T)}}{const p=document.createElement("div");p.className="coalesced-toggle";const u=document.createElement("input");u.type="checkbox",u.id="coalesced-toggle-cb",u.checked=Nt;const g=document.createElement("label");if(g.htmlFor="coalesced-toggle-cb",g.textContent="Show coalesced",p.appendChild(u),p.appendChild(g),oe.appendChild(p),u.addEventListener("change",()=>{Nt=u.checked,Ee()}),Nt){const T=M?M.getAllAppsData():{};let I=[];for(const b of Object.values(T))b!=null&&b.coalescedLog&&Array.isArray(b.coalescedLog)&&(I=I.concat(b.coalescedLog));I.sort((b,k)=>k.timestamp-b.timestamp);const y=I.slice(0,50);if(y.length>0){const b=document.createElement("div");b.className="log-section-title",b.textContent=`Coalesced (${y.length} of ${I.length})`,oe.appendChild(b);for(const k of y){const x=document.createElement("div");x.className="coalesced-entry";const B=document.createElement("span");B.className="log-time",B.textContent=tt(k.timestamp),x.appendChild(B);const le=document.createElement("span");le.className="log-action",le.textContent=k.action,x.appendChild(le);const N=document.createElement("span");N.className="log-detail",N.textContent=k.key,x.appendChild(N),oe.appendChild(x)}}}}yt&&!A&&(oe.scrollTop=oe.scrollHeight),rt=l.length}H.addEventListener("input",Ee),U.addEventListener("click",()=>{Se.length=0,rt=0,oe.innerHTML='<div class="log-empty">No mutations captured yet.</div>',ve.textContent="0"});let Be=0,it="grouped";const It=new Set;Je.addEventListener("click",()=>{it=it==="grouped"?"chronological":"grouped",Je.textContent=it==="grouped"?"Chronological":"Grouped",Je.classList.toggle("active",it==="chronological"),Be=-1,Ze()}),Xe.addEventListener("input",()=>{Be=-1,Ze()});function tn(o){const r=document.createElement("div");r.className="warn-entry";const E=document.createElement("span");E.className="warn-time",E.textContent=tt(o.timestamp),r.appendChild(E);const l=document.createElement("span");l.className=`warn-code ${o.code}`,l.textContent=o.code,r.appendChild(l);const $=document.createElement("span");$.className="warn-msg";const q=o.message.split(`
`)[0],w=o.message.includes(`
`);if($.textContent=q,r.appendChild($),w){r.style.cursor="pointer";const m=document.createElement("pre");m.className="warn-stack",m.textContent=o.message,m.style.display="none",r.appendChild(m),r.addEventListener("click",()=>{m.style.display=m.style.display==="none"?"block":"none"})}return r}function Ze(){const o=J?J.warningLog:Ye;if(o.length===0){Be!==0&&(Le.innerHTML='<div class="warn-empty">No warnings captured yet.</div>',Be=0);return}if(o.length===Be)return;const r=Xe.value.toLowerCase().trim(),E=document.createDocumentFragment(),l=r?o.filter(w=>w.code.toLowerCase().includes(r)||w.message.toLowerCase().includes(r)):o,$=l.filter(w=>!It.has(w.code)),q=l.length-$.length;if(it==="chronological")for(const w of $)E.appendChild(tn(w));else{const w=new Map;for(const m of $){let M=w.get(m.code);M||(M=[],w.set(m.code,M)),M.push(m)}for(const[m,M]of w){const p=document.createElement("div");p.className="warn-group";const u=document.createElement("div");u.className="warn-group-header";const g=document.createElement("span");g.className="warn-group-toggle",g.textContent="▶",u.appendChild(g);const T=document.createElement("span");T.className=`warn-group-code warn-code ${m}`,T.textContent=m,u.appendChild(T);const I=document.createElement("span");I.className="warn-group-count",I.textContent=`(${M.length})`,u.appendChild(I);const y=document.createElement("button");y.className="warn-suppress-btn",y.textContent="Suppress",y.addEventListener("click",x=>{x.stopPropagation(),It.add(m),Be=-1,Ze()}),u.appendChild(y),u.addEventListener("click",()=>{p.classList.toggle("expanded"),g.textContent=p.classList.contains("expanded")?"▼":"▶"}),p.appendChild(u);const b=_n[m];if(b){const x=document.createElement("div");x.className="warn-group-doc";const B=document.createElement("div");B.className="warn-group-desc",B.textContent=b.description,x.appendChild(B);const le=document.createElement("div");le.className="warn-group-suggestion",le.textContent=`Suggestion: ${b.suggestion}`,x.appendChild(le),p.appendChild(x)}const k=document.createElement("div");k.className="warn-group-entries";for(const x of M)k.appendChild(tn(x));p.appendChild(k),E.appendChild(p)}}if(Le.innerHTML="",Le.appendChild(E),q>0){const w=document.createElement("div");w.className="warn-suppressed-note",w.textContent=`${q} suppressed warning${q!==1?"s":""} hidden`;const m=document.createElement("button");m.className="warn-suppress-btn",m.textContent="Show all",m.style.marginLeft="8px",m.addEventListener("click",()=>{It.clear(),Be=-1,Ze()}),w.appendChild(m),Le.appendChild(w)}Le.scrollTop=Le.scrollHeight,Be=o.length}Pe.addEventListener("click",()=>{Ye.length=0,Ie=0,Be=0,Le.innerHTML='<div class="warn-empty">No warnings captured yet.</div>',Rt()});function Rt(){Ie>0&&f!=="Warnings"?(c.textContent=String(Ie>99?"99+":Ie),c.style.display="inline-block"):c.style.display="none",h.textContent=Ie>0?`async-dom (${Ie>99?"99+":Ie}) ▲`:"async-dom ▲"}pt=Rt;function $n(){_t(),ft=setInterval(()=>{if(f==="Tree"){const o=be();o&&o.refreshDebugData(),setTimeout(St,250)}},2e3),mt=setInterval(()=>{if(f==="Performance"){const o=be();o&&o.refreshDebugData(),setTimeout(Tt,250)}},1e3),gt=setInterval(()=>{f==="Log"&&Ee(),f==="Warnings"&&Ze(),f==="Graph"&&Qt()},500),Qe()}function _t(){ft&&(clearInterval(ft),ft=null),mt&&(clearInterval(mt),mt=null),gt&&(clearInterval(gt),gt=null)}return{destroy(){_t(),xe&&(clearInterval(xe),xe=null),clearInterval(Nn),pt=null,Se.length=0,Ye.length=0,nt.length=0,Te.length=0,Ie=0,s.remove()}}}const vs=100;class xs{constructor(e,t){d(this,"listeners",new Map);d(this,"eventConfig",new Map);d(this,"nodeCache");d(this,"transport",null);d(this,"appId");d(this,"eventTraces",[]);d(this,"_onTimingResult",null);this.appId=e,this.nodeCache=t??new Wt}set onTimingResult(e){this._onTimingResult=e}setTransport(e){this.transport=e}setNodeCache(e){this.nodeCache=e}configureEvent(e,t,n){if(this.eventConfig.set(`${e}_${t}`,n),n.preventDefault&&dn(t)){for(const[a,i]of this.listeners.entries())if(i.nodeId===e&&i.eventName===t){i.controller.abort(),this.attach(e,t,a);break}}}attach(e,t,n){const a=this.nodeCache.get(e);if(!a)return;const i=this.listeners.get(n);i&&i.controller.abort();const h=new AbortController;this.listeners.set(n,{controller:h,nodeId:e,eventName:t});const C=this._isPassiveForListener(n,t);a.addEventListener(t,O=>{var pe;const V=`${e}_${t}`,z=this.eventConfig.get(V);z!=null&&z.preventDefault&&O.preventDefault();const D=performance.now(),te=Cs(O,this.nodeCache),W=performance.now()-D,ae=Date.now();this.eventTraces.push({eventType:O.type,listenerId:n,serializeMs:W,timestamp:performance.now(),sentAt:ae}),this.eventTraces.length>vs&&this.eventTraces.shift(),(pe=this.transport)==null||pe.send({type:"event",appId:this.appId,listenerId:n,event:te})},{signal:h.signal,passive:C})}detach(e){const t=this.listeners.get(e);t&&(t.controller.abort(),this.listeners.delete(e))}detachByNodeId(e){for(const[t,n]of this.listeners)n.nodeId===e&&(n.controller.abort(),this.listeners.delete(t))}getEventTraces(){return this.eventTraces.slice()}updateTraceWithWorkerTiming(e,t,n){var i;const a=Date.now();for(let h=this.eventTraces.length-1;h>=0;h--){const C=this.eventTraces[h];if(C.listenerId===e&&C.transportMs===void 0){C.transportMs=Math.max(0,a-C.sentAt-t),C.dispatchMs=t,C.mutationCount=n,(i=this._onTimingResult)==null||i.call(this,C);return}}}getListenersForNode(e){const t=[];for(const[n,a]of this.listeners)a.nodeId===e&&t.push({listenerId:n,eventName:a.eventName});return t}detachAll(){for(const e of this.listeners.values())e.controller.abort();this.listeners.clear()}_isPassiveForListener(e,t){for(const[n,a]of this.eventConfig.entries())if(n.endsWith(`_${t}`)&&a.preventDefault)return!1;return dn(t)}}const ws=new Set(["scroll","touchstart","touchmove","wheel","mousewheel"]);function dn(s){return ws.has(s)}function Mt(s,e){if(!s)return null;if(e){const t=e.getId(s);if(t!=null)return String(t)}return s.id??null}function Cs(s,e){var h;const t=((h=s.composedPath)==null?void 0:h.call(s)[0])??s.target,n={type:s.type,target:Mt(t,e),currentTarget:Mt(s.currentTarget,e),bubbles:s.bubbles,cancelable:s.cancelable,composed:s.composed,eventPhase:s.eventPhase,isTrusted:s.isTrusted,timeStamp:s.timeStamp};s.type==="click"&&(s.target instanceof HTMLAnchorElement||s.currentTarget instanceof HTMLAnchorElement)&&s.preventDefault(),s instanceof MouseEvent&&(n.clientX=s.clientX,n.clientY=s.clientY,n.pageX=s.pageX,n.pageY=s.pageY,n.screenX=s.screenX,n.screenY=s.screenY,n.offsetX=s.offsetX,n.offsetY=s.offsetY,n.button=s.button,n.buttons=s.buttons,n.altKey=s.altKey,n.ctrlKey=s.ctrlKey,n.metaKey=s.metaKey,n.shiftKey=s.shiftKey,n.relatedTarget=Mt(s.relatedTarget,e),n.detail=s.detail),s instanceof KeyboardEvent&&(n.key=s.key,n.code=s.code,n.keyCode=s.keyCode,n.altKey=s.altKey,n.ctrlKey=s.ctrlKey,n.metaKey=s.metaKey,n.shiftKey=s.shiftKey),s instanceof InputEvent&&(n.data=s.data??void 0,n.inputType=s.inputType);const a=s.target;a instanceof HTMLInputElement?(n.value=a.value,n.checked=a.checked):a instanceof HTMLTextAreaElement?n.value=a.value:a instanceof HTMLSelectElement&&(n.value=a.value,n.selectedIndex=a.selectedIndex);const i=s.target;return i instanceof HTMLMediaElement&&(n.currentTime=i.currentTime,n.duration=Number.isFinite(i.duration)?i.duration:0,n.paused=i.paused,n.ended=i.ended,n.readyState=i.readyState),s instanceof FocusEvent&&(n.relatedTarget=s.relatedTarget instanceof Element?Mt(s.relatedTarget,e):null),s instanceof WheelEvent&&Object.assign(n,{deltaX:s.deltaX,deltaY:s.deltaY,deltaZ:s.deltaZ,deltaMode:s.deltaMode}),n}const Es=new Set(["script","iframe","object","embed","form","base","meta","link","style"]),Ss=/^on/i,Ts=new Set(["href","src","data","action","formaction","xlink:href"]),Ns=new Set(["srcdoc","formaction"]);function ks(s){const e=s.trim().toLowerCase();return/^\s*javascript\s*:/i.test(e)||/^\s*vbscript\s*:/i.test(e)||/^\s*data\s*:\s*text\/html/i.test(e)}function pn(s){const n=new DOMParser().parseFromString(`<body>${s}</body>`,"text/html").body;return gn(n),n.innerHTML}function gn(s){const e=Array.from(s.childNodes);for(const t of e)if(t.nodeType===Node.ELEMENT_NODE){const n=t,a=n.tagName.toLowerCase();if(Es.has(a)){n.remove();continue}const i=[];for(let h=0;h<n.attributes.length;h++){const C=n.attributes[h],O=C.name.toLowerCase();(Ss.test(O)||Ns.has(O)||Ts.has(O)&&ks(C.value))&&i.push(C.name)}for(const h of i)n.removeAttribute(h);gn(n)}}const Ms=new Set(["srcdoc","formaction"]),Ls=new Set(["href","src","data","action","xlink:href"]);function As(s){const e=s.trim().toLowerCase();return/^\s*javascript\s*:/i.test(e)||/^\s*vbscript\s*:/i.test(e)||/^\s*data\s*:\s*text\/html/i.test(e)}const $s={allowHeadAppend:!1,allowBodyAppend:!1,allowNavigation:!0,allowScroll:!0,allowUnsafeHTML:!1},Is=new Set(["value","checked","disabled","selectedIndex","indeterminate","readOnly","required","placeholder","type","name","scrollTop","scrollLeft","textContent","nodeValue","src","currentTime","volume","muted","controls","loop","poster","autoplay","tabIndex","title","lang","dir","hidden","draggable","contentEditable","htmlFor","open","selected","multiple","width","height","colSpan","rowSpan"]),Rs=new Set(["play","pause","load","focus","blur","click","scrollIntoView","requestFullscreen","select","setCustomValidity","reportValidity","showModal","close"]),_s=new Set(["svg","path","circle","ellipse","line","polygon","polyline","rect","g","defs","use","text","tspan","clippath","mask","image","symbol","marker","lineargradient","radialgradient","stop","filter","fegaussianblur","feoffset","feblend","foreignobject"]),Ds="http://www.w3.org/2000/svg";class Bs{constructor(e,t,n){d(this,"nodeCache");d(this,"permissions");d(this,"root");d(this,"_additionalAllowedProperties");d(this,"onNodeRemoved",null);d(this,"_onWarning",null);d(this,"_onMutation",null);d(this,"highlightEnabled",!1);this.nodeCache=e??new Wt,this.permissions={...$s,...t},this._additionalAllowedProperties=new Set(this.permissions.additionalAllowedProperties??[]),this.root=n??{body:document.body,head:document.head,html:document.documentElement}}setDebugHooks(e){this._onWarning=e.onWarning??null,this._onMutation=e.onMutation??null}enableHighlightUpdates(e){this.highlightEnabled=e}highlightNode(e){if(!this.highlightEnabled)return;const t=this.nodeCache.get(e);if(!(t!=null&&t.style))return;const n=t.style.outline;t.style.outline="2px solid rgba(78, 201, 176, 0.8)",setTimeout(()=>{t.style.outline=n},300)}apply(e,t){switch(this._onMutation&&this._onMutation({side:"main",action:e.action,mutation:e,timestamp:performance.now(),batchUid:t}),e.action){case"createNode":this.createNode(e.id,e.tag,e.textContent);break;case"createComment":this.createComment(e.id,e.textContent);break;case"appendChild":this.appendChild(e.id,e.childId);break;case"removeNode":this.removeNode(e.id);break;case"removeChild":this.removeChild(e.id,e.childId);break;case"insertBefore":this.insertBefore(e.id,e.newId,e.refId);break;case"setAttribute":this.setAttribute(e.id,e.name,e.value);break;case"removeAttribute":this.removeAttribute(e.id,e.name);break;case"setStyle":this.setStyle(e.id,e.property,e.value);break;case"setProperty":this.setProperty(e.id,e.property,e.value);break;case"setTextContent":this.setTextContent(e.id,e.textContent);break;case"setClassName":this.setClassName(e.id,e.name);break;case"setHTML":this.setHTML(e.id,e.html);break;case"addEventListener":break;case"configureEvent":break;case"removeEventListener":break;case"headAppendChild":this.headAppendChild(e.id);break;case"bodyAppendChild":this.bodyAppendChild(e.id);break;case"pushState":this.permissions.allowNavigation&&window.history.pushState(e.state,e.title,e.url);break;case"replaceState":this.permissions.allowNavigation&&window.history.replaceState(e.state,e.title,e.url);break;case"scrollTo":this.permissions.allowScroll&&window.scrollTo(e.x,e.y);break;case"insertAdjacentHTML":this.insertAdjacentHTML(e.id,e.position,e.html);break;case"callMethod":this.callMethod(e.id,e.method,e.args);break}if(this.highlightEnabled&&"id"in e){const n=e.action;(n==="appendChild"||n==="setAttribute"||n==="setStyle"||n==="setClassName"||n==="setTextContent"||n==="setHTML")&&this.highlightNode(e.id)}}getNode(e){return this.nodeCache.get(e)}clear(){this.nodeCache.clear()}getRoot(){return this.root}createNode(e,t,n){if(this.nodeCache.has(e))return;if(t==="HTML"){this.nodeCache.set(e,this.root.html);return}if(t==="BODY"){this.nodeCache.set(e,this.root.body);return}if(t==="HEAD"){this.nodeCache.set(e,this.root.head);return}if(t.charAt(0)==="#"){const h=document.createTextNode(n??"");this.nodeCache.set(e,h);return}const a=t.toLowerCase();let i;_s.has(a)?i=document.createElementNS(Ds,a):i=document.createElement(t),n&&(i.textContent=n),this.nodeCache.set(e,i)}createComment(e,t){if(this.nodeCache.has(e))return;const n=document.createComment(t);this.nodeCache.set(e,n)}appendChild(e,t){var i;const n=this.nodeCache.get(e),a=this.nodeCache.get(t);if(!n||!a){const h=`appendChild: ${n?"child":"parent"} not found`;console.warn(`[async-dom] ${h}`,{parentId:e,childId:t}),(i=this._onWarning)==null||i.call(this,{code:et.MISSING_NODE,message:h,context:{parentId:e,childId:t},timestamp:performance.now()});return}n.appendChild(a)}removeNode(e){var n;const t=this.nodeCache.get(e);if(!t){const a="removeNode: node not found";console.warn(`[async-dom] ${a}`,{id:e}),(n=this._onWarning)==null||n.call(this,{code:et.MISSING_NODE,message:a,context:{id:e},timestamp:performance.now()});return}this._cleanupSubtreeListeners(t,e),this.nodeCache.delete(e),t.parentNode?t.parentNode.removeChild(t):"remove"in t&&typeof t.remove=="function"&&t.remove()}removeChild(e,t){const n=this.nodeCache.get(e),a=this.nodeCache.get(t);n&&(a!=null&&a.parentNode)&&(this._cleanupSubtreeListeners(a,t),this.nodeCache.delete(t),a.parentNode.removeChild(a))}insertBefore(e,t,n){var C;if(e===t)return;const a=this.nodeCache.get(e),i=this.nodeCache.get(t);if(!a||!i){const O=`insertBefore: ${a?"newNode":"parent"} not found`;console.warn(`[async-dom] ${O}`,{parentId:e,newId:t,refId:n}),(C=this._onWarning)==null||C.call(this,{code:et.MISSING_NODE,message:O,context:{parentId:e,newId:t,refId:n},timestamp:performance.now()});return}const h=n?this.nodeCache.get(n):null;a.insertBefore(i,h??null)}setAttribute(e,t,n){var h;const a=this.nodeCache.get(e);if(!a||!("setAttribute"in a)){const C="setAttribute: node not found";console.warn(`[async-dom] ${C}`,{id:e,name:t,value:n}),(h=this._onWarning)==null||h.call(this,{code:et.MISSING_NODE,message:C,context:{id:e,name:t,value:n},timestamp:performance.now()});return}const i=t.toLowerCase();/^on/i.test(i)||Ms.has(i)||Ls.has(i)&&As(n)||(t==="id"&&this.nodeCache.set(n,a),a.setAttribute(t,n))}removeAttribute(e,t){const n=this.nodeCache.get(e);!n||!("removeAttribute"in n)||n.removeAttribute(t)}setStyle(e,t,n){var i;const a=this.nodeCache.get(e);if(!(a!=null&&a.style)){const h="setStyle: node not found";console.warn(`[async-dom] ${h}`,{id:e,property:t,value:n}),(i=this._onWarning)==null||i.call(this,{code:et.MISSING_NODE,message:h,context:{id:e,property:t,value:n},timestamp:performance.now()});return}a.style.setProperty(t,n)}setProperty(e,t,n){var i;const a=this.nodeCache.get(e);if(a){if(!Is.has(t)&&!this._additionalAllowedProperties.has(t)){(i=this._onWarning)==null||i.call(this,{code:et.BLOCKED_PROPERTY,message:`setProperty: property "${t}" is not in the allowed list`,context:{id:e,property:t},timestamp:performance.now()});return}a[t]=n}}setTextContent(e,t){const n=this.nodeCache.get(e);n&&(n.textContent=t)}setClassName(e,t){const n=this.nodeCache.get(e);n&&(n.className=t)}setHTML(e,t){const n=this.nodeCache.get(e);n&&(n.innerHTML=this.permissions.allowUnsafeHTML?t:pn(t))}insertAdjacentHTML(e,t,n){const a=this.nodeCache.get(e);!a||!("insertAdjacentHTML"in a)||a.insertAdjacentHTML(t,this.permissions.allowUnsafeHTML?n:pn(n))}headAppendChild(e){if(!this.permissions.allowHeadAppend)return;const t=this.nodeCache.get(e);t&&this.root.head.appendChild(t)}bodyAppendChild(e){if(!this.permissions.allowBodyAppend)return;const t=this.nodeCache.get(e);t&&this.root.body.appendChild(t)}callMethod(e,t,n){const a=this.nodeCache.get(e);if(!a)return;if(!Rs.has(t)){console.warn(`[async-dom] Blocked callMethod: "${t}" is not allowed`);return}const i=a[t];typeof i=="function"&&i.apply(a,n)}_cleanupSubtreeListeners(e,t){var a;(a=this.onNodeRemoved)==null||a.call(this,t);const n=e.childNodes;for(let i=0;i<n.length;i++){const h=n[i],C=this.nodeCache.getId(h);C&&(this._cleanupSubtreeListeners(h,C),this.nodeCache.delete(C))}}}const re={CreateNode:0,CreateComment:1,AppendChild:2,RemoveNode:3,RemoveChild:4,InsertBefore:5,SetAttribute:6,RemoveAttribute:7,SetStyle:8,SetProperty:9,SetTextContent:10,SetClassName:11,SetHTML:12,AddEventListener:13,HeadAppendChild:14,BodyAppendChild:15,PushState:16,ReplaceState:17,ScrollTo:18,InsertAdjacentHTML:19,ConfigureEvent:20,RemoveEventListener:21,CallMethod:22};class Os{constructor(e){d(this,"view");d(this,"offset",0);d(this,"strings");this.strings=e}readU8(){if(this.offset+1>this.view.byteLength)throw new Error("Binary decode: unexpected end of buffer");return this.view.getUint8(this.offset++)}readU16(){if(this.offset+2>this.view.byteLength)throw new Error("Binary decode: unexpected end of buffer");const e=this.view.getUint16(this.offset,!0);return this.offset+=2,e}readU32(){if(this.offset+4>this.view.byteLength)throw new Error("Binary decode: unexpected end of buffer");const e=this.view.getUint32(this.offset,!0);return this.offset+=4,e}readStr(){return this.strings.get(this.readU16())}readNodeId(){return this.readU32()}decode(e){this.view=new DataView(e),this.offset=0;const t=[];for(;this.offset<e.byteLength;){const n=this.readU8();t.push(this.decodeMutation(n))}return t}decodeMutation(e){switch(e){case re.CreateNode:{const t=this.readNodeId(),n=this.readStr(),a=this.readStr();return{action:"createNode",id:t,tag:n,...a?{textContent:a}:{}}}case re.CreateComment:return{action:"createComment",id:this.readNodeId(),textContent:this.readStr()};case re.AppendChild:return{action:"appendChild",id:this.readNodeId(),childId:this.readNodeId()};case re.RemoveNode:return{action:"removeNode",id:this.readNodeId()};case re.RemoveChild:return{action:"removeChild",id:this.readNodeId(),childId:this.readNodeId()};case re.InsertBefore:{const t=this.readNodeId(),n=this.readNodeId(),a=this.readU32();return{action:"insertBefore",id:t,newId:n,refId:a===4294967295?null:a}}case re.SetAttribute:{const t=this.readNodeId(),n=this.readStr(),a=this.readStr(),i=this.readU8()===1;return{action:"setAttribute",id:t,name:n,value:a,...i?{optional:i}:{}}}case re.RemoveAttribute:return{action:"removeAttribute",id:this.readNodeId(),name:this.readStr()};case re.SetStyle:{const t=this.readNodeId(),n=this.readStr(),a=this.readStr(),i=this.readU8()===1;return{action:"setStyle",id:t,property:n,value:a,...i?{optional:i}:{}}}case re.SetProperty:{const t=this.readNodeId(),n=this.readStr(),a=this.readStr();return{action:"setProperty",id:t,property:n,value:JSON.parse(a)}}case re.SetTextContent:return{action:"setTextContent",id:this.readNodeId(),textContent:this.readStr()};case re.SetClassName:return{action:"setClassName",id:this.readNodeId(),name:this.readStr()};case re.SetHTML:return{action:"setHTML",id:this.readNodeId(),html:this.readStr()};case re.AddEventListener:{const t=this.readNodeId(),n=this.readStr(),a=this.readStr();return{action:"addEventListener",id:t,name:n,listenerId:a}}case re.HeadAppendChild:return{action:"headAppendChild",id:this.readNodeId()};case re.BodyAppendChild:return{action:"bodyAppendChild",id:this.readNodeId()};case re.PushState:{const t=JSON.parse(this.readStr()),n=this.readStr(),a=this.readStr();return{action:"pushState",state:t,title:n,url:a}}case re.ReplaceState:{const t=JSON.parse(this.readStr()),n=this.readStr(),a=this.readStr();return{action:"replaceState",state:t,title:n,url:a}}case re.ScrollTo:return{action:"scrollTo",x:this.readU32(),y:this.readU32()};case re.InsertAdjacentHTML:{const t=this.readNodeId(),n=this.readStr(),a=this.readStr();return{action:"insertAdjacentHTML",id:t,position:n,html:a}}case re.ConfigureEvent:{const t=this.readNodeId(),n=this.readStr(),a=this.readU8()===1,i=this.readU8()===1;return{action:"configureEvent",id:t,name:n,preventDefault:a,...i?{passive:i}:{}}}case re.RemoveEventListener:return{action:"removeEventListener",id:this.readNodeId(),listenerId:this.readStr()};case re.CallMethod:{const t=this.readNodeId(),n=this.readStr(),a=this.readStr();return{action:"callMethod",id:t,method:n,args:JSON.parse(a)}}default:throw new Error(`Unknown mutation opcode: ${e}`)}}}class Fs{constructor(){d(this,"stringToIndex",new Map);d(this,"indexToString",[]);d(this,"pending",[])}store(e){const t=this.stringToIndex.get(e);if(t!==void 0)return t;const n=this.indexToString.length;return this.stringToIndex.set(e,n),this.indexToString.push(e),this.pending.push(e),n}get(e){return this.indexToString[e]??""}consumePending(){const e=this.pending;return this.pending=[],e}registerBulk(e){for(const t of e)if(!this.stringToIndex.has(t)){const n=this.indexToString.length;this.stringToIndex.set(t,n),this.indexToString.push(t)}}get size(){return this.indexToString.length}}const Ps=new TextEncoder,Hs=new TextDecoder;function zs(s){return s instanceof ArrayBuffer||typeof s=="object"&&s!==null&&"byteLength"in s&&"slice"in s&&typeof s.slice=="function"&&!ArrayBuffer.isView(s)}const Ws=2;function qs(s){return s.byteLength<1?!1:new DataView(s).getUint8(0)===Ws}function Us(s){const e=JSON.stringify(s),t=Ps.encode(e),n=new ArrayBuffer(t.byteLength);return new Uint8Array(n).set(t),n}function Ks(s){return JSON.parse(Hs.decode(s))}function Ys(s){return s.type==="mutation"}new TextEncoder;const hn=new TextDecoder;function js(s,e,t){const n=new DataView(s),a=new Uint8Array(s);let i=0;i+=1;const h=n.getUint32(i,!0);i+=4;const C=n.getUint16(i,!0);i+=2;const O=hn.decode(a.slice(i,i+C));i+=C;const V=n.getUint8(i++),D=["normal","high","low"][V]??"normal",te=n.getUint16(i,!0);i+=2;const W=[];for(let he=0;he<te;he++){const ue=n.getUint16(i,!0);i+=2,W.push(hn.decode(a.slice(i,i+ue))),i+=ue}e.registerBulk(W);const ae=s.slice(i),pe=t.decode(ae);return{type:"mutation",appId:O,uid:h,mutations:pe,...D!=="normal"?{priority:D}:{}}}class Vs{constructor(e){d(this,"handlers",[]);d(this,"_readyState","open");d(this,"strings",new Fs);d(this,"mutDecoder",new Os(this.strings));d(this,"_statsEnabled",!1);d(this,"_stats",{messageCount:0,totalBytes:0,largestMessageBytes:0,lastMessageBytes:0});d(this,"onError");d(this,"onClose");this.worker=e,e.onmessage=t=>{if(this.handlers.length===0)return;let n;zs(t.data)?qs(t.data)?n=js(t.data,this.strings,this.mutDecoder):n=Ks(t.data):n=t.data;for(const a of this.handlers)try{a(n)}catch(i){console.error("[async-dom] Handler error:",i)}},e.onerror=t=>{var a,i;const n=new Error(t.message??"Worker error");(a=this.onError)==null||a.call(this,n),this._readyState!=="closed"&&(this._readyState="closed",(i=this.onClose)==null||i.call(this))},e.onmessageerror=()=>{var n;const t=new Error("Worker message deserialization failed");(n=this.onError)==null||n.call(this,t)}}enableStats(e){this._statsEnabled=e}send(e){if(this._readyState==="open")if(Ys(e)){const t=Us(e);if(this._statsEnabled){const n=t.byteLength;this._stats.messageCount++,this._stats.totalBytes+=n,this._stats.lastMessageBytes=n,n>this._stats.largestMessageBytes&&(this._stats.largestMessageBytes=n)}this.worker.postMessage(t,[t])}else{if(this._statsEnabled){const t=JSON.stringify(e).length;this._stats.messageCount++,this._stats.totalBytes+=t,this._stats.lastMessageBytes=t,t>this._stats.largestMessageBytes&&(this._stats.largestMessageBytes=t)}this.worker.postMessage(e)}}onMessage(e){this.handlers.push(e)}close(){this._readyState="closed",this.worker.terminate()}get readyState(){return this._readyState}getStats(){return{...this._stats}}}class Gs{constructor(e){d(this,"handlers",[]);d(this,"_readyState","open");d(this,"_statsEnabled",!1);d(this,"_stats",{messageCount:0,totalBytes:0,largestMessageBytes:0,lastMessageBytes:0});d(this,"onError");d(this,"onClose");this.worker=e,e.onmessage=t=>{for(const n of this.handlers)try{n(t.data)}catch(a){console.error("[async-dom] Handler error:",a)}},e.onerror=t=>{var a,i;const n=new Error(t.message??"Worker error");(a=this.onError)==null||a.call(this,n),this._readyState!=="closed"&&(this._readyState="closed",(i=this.onClose)==null||i.call(this))},e.onmessageerror=()=>{var n;const t=new Error("Worker message deserialization failed");(n=this.onError)==null||n.call(this,t)}}enableStats(e){this._statsEnabled=e}send(e){if(this._readyState==="open"){if(this._statsEnabled){const t=JSON.stringify(e).length;this._stats.messageCount++,this._stats.totalBytes+=t,this._stats.lastMessageBytes=t,t>this._stats.largestMessageBytes&&(this._stats.largestMessageBytes=t)}this.worker.postMessage(e)}}onMessage(e){this.handlers.push(e)}close(){this._readyState="closed",this.worker.terminate()}get readyState(){return this._readyState}getStats(){return{...this._stats}}}class Xs{constructor(e,t){d(this,"ws",null);d(this,"handlers",[]);d(this,"_readyState","connecting");d(this,"_stats",{messageCount:0,totalBytes:0,largestMessageBytes:0,lastMessageBytes:0});d(this,"onError");d(this,"onClose");d(this,"attempt",0);d(this,"messageQueue",[]);d(this,"closed",!1);d(this,"reconnectTimer",null);d(this,"maxRetries");d(this,"baseDelay");d(this,"maxDelay");this.url=e,this.maxRetries=(t==null?void 0:t.maxRetries)??Yn,this.baseDelay=(t==null?void 0:t.baseDelay)??jn,this.maxDelay=(t==null?void 0:t.maxDelay)??Vn,this.connect()}connect(){this.closed||(this._readyState="connecting",this.ws=new WebSocket(this.url),this.ws.onopen=()=>{this._readyState="open",this.attempt=0,this.flushQueue()},this.ws.onmessage=e=>{try{const t=JSON.parse(e.data);for(const n of this.handlers)try{n(t)}catch(a){console.error("[async-dom] Handler error:",a)}}catch{console.error("[async-dom] Failed to parse WebSocket message")}},this.ws.onclose=()=>{this.closed||this.scheduleReconnect()},this.ws.onerror=()=>{var e;(e=this.ws)==null||e.close()})}scheduleReconnect(){if(this.attempt>=this.maxRetries){this._readyState="closed",console.error(`[async-dom] WebSocket reconnection failed after ${this.maxRetries} attempts`);return}const e=Math.min(this.baseDelay*2**this.attempt+Math.random()*1e3,this.maxDelay);this.attempt++,this.reconnectTimer=setTimeout(()=>{this.connect()},e)}flushQueue(){for(;this.messageQueue.length>0;){const e=this.messageQueue.shift();if(!e)break;this.sendRaw(e)}}sendRaw(e){var a;const t=JSON.stringify(e),n=t.length;this._stats.messageCount++,this._stats.totalBytes+=n,this._stats.lastMessageBytes=n,n>this._stats.largestMessageBytes&&(this._stats.largestMessageBytes=n),(a=this.ws)==null||a.send(t)}send(e){var t;this._readyState==="open"&&((t=this.ws)==null?void 0:t.readyState)===WebSocket.OPEN?this.sendRaw(e):this._readyState!=="closed"&&this.messageQueue.push(e)}onMessage(e){this.handlers.push(e)}close(){var e;this.closed=!0,this._readyState="closed",this.reconnectTimer!==null&&clearTimeout(this.reconnectTimer),(e=this.ws)==null||e.close(),this.messageQueue.length=0}get readyState(){return this._readyState}getStats(){return{...this._stats}}}class Js{constructor(){d(this,"threads",new Map);d(this,"messageHandlers",[])}createWorkerThread(e){const t=this._uniqueAppId(e.name),n=typeof __ASYNC_DOM_BINARY__<"u"&&__ASYNC_DOM_BINARY__,a=e.transport??(n?new Vs(e.worker):new Gs(e.worker));return a.onMessage(i=>{this.notifyHandlers(t,i)}),this.threads.set(t,{transport:a,appId:t}),t}createRemoteThread(e){const t=this._uniqueAppId(e.name),n=e.transport;return n.onMessage(a=>{this.notifyHandlers(t,a)}),this.threads.set(t,{transport:n,appId:t}),t}createWebSocketThread(e){const t=this._uniqueAppId(e.name),n=new Xs(e.url,e.options);return n.onMessage(a=>{this.notifyHandlers(t,a)}),this.threads.set(t,{transport:n,appId:t}),t}sendToThread(e,t){const n=this.threads.get(e);n&&n.transport.send(t)}broadcast(e){for(const t of this.threads.values())t.transport.send(e)}destroyThread(e){const t=this.threads.get(e);t&&(t.transport.close(),this.threads.delete(e))}destroyAll(){for(const e of[...this.threads.keys()])this.destroyThread(e)}onMessage(e){this.messageHandlers.push(e)}getTransport(e){var t;return((t=this.threads.get(e))==null?void 0:t.transport)??null}notifyHandlers(e,t){for(const n of this.messageHandlers)n(e,t)}_uniqueAppId(e){if(!e)return Math.random().toString(36).slice(2,7);let t=e;if(!this.threads.has(t))return t;let n=2;for(;this.threads.has(`${e}-${n}`);)n++;return t=`${e}-${n}`,t}}const Qs=new Set(["innerWidth","innerHeight","outerWidth","outerHeight","devicePixelRatio","screen.width","screen.height","screen.availWidth","screen.availHeight","screen.colorDepth","screen.pixelDepth","screen.orientation.type","scrollX","scrollY","visualViewport.width","visualViewport.height","navigator.language","navigator.languages","navigator.userAgent","navigator.hardwareConcurrency","document.visibilityState","document.hidden","localStorage.getItem","localStorage.setItem","localStorage.removeItem","localStorage.length","localStorage.key","sessionStorage.getItem","sessionStorage.setItem","sessionStorage.removeItem","sessionStorage.length","sessionStorage.key"]);function ea(s){var Ue,Re;const e=new Xn(s.scheduler),t=new Js,n=new Map,a=new Map,i=Fn(s.debug),h=new Bn,C=new ts,O=new Map,V=200,z=new On,D=new Map;let te=null,W=null;const ae=new Map;function pe(c){t.sendToThread(c,{type:"debugQuery",query:"tree"}),t.sendToThread(c,{type:"debugQuery",query:"stats"}),t.sendToThread(c,{type:"debugQuery",query:"perTypeCoalesced"}),t.sendToThread(c,{type:"debugQuery",query:"coalescedLog"})}function he(c,f){try{const L=JSON.parse(f.data),S=L.nodeId,_=L.property;switch(f.queryType){case $e.BoundingRect:{const ne=c.getNode(S);if(!ne||!("getBoundingClientRect"in ne))return null;const se=ne.getBoundingClientRect();return{top:se.top,left:se.left,right:se.right,bottom:se.bottom,width:se.width,height:se.height,x:se.x,y:se.y}}case $e.ComputedStyle:{const ne=c.getNode(S);if(!ne)return{};const se=window.getComputedStyle(ne),H={},ve=["display","position","top","left","right","bottom","width","height","color","background-color","font-size","font-family","font-weight","line-height","text-align","visibility","opacity","overflow","z-index","float","clear","cursor","pointer-events","box-sizing","flex-direction","justify-content","align-items","flex-wrap","flex-grow","flex-shrink","flex-basis","grid-template-columns","grid-template-rows","gap","transform","border-radius","box-shadow","text-decoration","white-space","word-break","overflow-wrap","min-width","max-width","min-height","max-height","margin-top","margin-right","margin-bottom","margin-left","padding-top","padding-right","padding-bottom","padding-left"];for(const Z of ve){const ie=se.getPropertyValue(Z);ie&&(H[Z]=ie)}return H}case $e.NodeProperty:{const ne=c.getNode(S);return!ne||!_?null:ne[_]??null}case $e.WindowProperty:{if(!_||!Qs.has(_))return null;if(_.startsWith("localStorage.")||_.startsWith("sessionStorage.")){const H=_.indexOf("."),ve=_.slice(0,H),Z=_.slice(H+1),ie=ve==="localStorage"?window.localStorage:window.sessionStorage,U=L.args;return Z==="getItem"&&(U==null?void 0:U[0])!=null?ie.getItem(U[0]):Z==="setItem"&&(U==null?void 0:U[0])!=null&&U[1]!==void 0?(ie.setItem(U[0],U[1]),null):Z==="removeItem"&&(U==null?void 0:U[0])!=null?(ie.removeItem(U[0]),null):Z==="length"?ie.length:Z==="key"&&(U==null?void 0:U[0])!==void 0?ie.key(Number(U[0])):null}const ne=_.split(".");let se=window;for(const H of ne){if(se==null)return null;se=se[H]}return se??null}default:return null}}catch{return null}}e.setApplier((c,f,L)=>{if(c.action==="addEventListener"){const _=n.get(f);_&&(_.attach(c.id,c.name,c.listenerId),h.eventsForwarded++);return}if(c.action==="configureEvent"){const _=n.get(f);_&&_.configureEvent(c.id,c.name,{preventDefault:c.preventDefault,passive:c.passive});return}if(c.action==="removeEventListener"){const _=n.get(f);_&&_.detach(c.listenerId);return}let S;f===W&&te?S=te:(S=D.get(f),S&&(te=S,W=f)),S&&(S.apply(c,L),h.mutationsApplied++)}),t.onMessage((c,f)=>{if(fn(f)){if(f.sentAt!=null&&e.recordWorkerLatency(f.sentAt),e.enqueue(f.mutations,c,f.priority??"normal",f.uid),f.causalEvent){const L=f.mutations.filter(S=>"id"in S).map(S=>S.id);C.recordBatch(f.uid,L,f.mutations.length,f.causalEvent),z.registerBatchEvent(f.uid,f.causalEvent)}return}if(ct(f)&&f.type==="eventTimingResult"){const L=n.get(c);L&&L.updateTraceWithWorkerTiming(f.listenerId,f.dispatchMs,f.mutationCount);return}if(ct(f)&&f.type==="perfEntries"){const L=f;let S=O.get(c);S||(S=[],O.set(c,S)),S.push(...L.entries),S.length>V&&S.splice(0,S.length-V);return}if(ct(f)&&f.type==="debugResult"){const L=f,S=ae.get(c)??{tree:null,workerStats:null,perTypeCoalesced:null,coalescedLog:null};L.query==="tree"&&(S.tree=L.result),L.query==="stats"&&(S.workerStats=L.result),L.query==="perTypeCoalesced"&&(S.perTypeCoalesced=L.result),L.query==="coalescedLog"&&(S.coalescedLog=L.result),ae.set(c,S)}}),s.worker&&ue(s.worker,s.target);function ue(c,f,L,S,_,ne,se){var Oe,Fe;let H;if(c)H=t.createWorkerThread({worker:c,transport:S,name:ne});else if(S)H=t.createRemoteThread({transport:S,name:ne});else throw new Error("[async-dom] addAppInternal requires either a worker or a transport");const ve=new Wt;let Z=null;f&&(Z=typeof f=="string"?document.querySelector(f):f);let ie;if(Z&&L){const G=L===!0?{mode:"open"}:L,K=Z.attachShadow(G);ie={body:K,head:K,html:Z}}else Z&&(ie={body:Z,head:document.head,html:Z});const U=new Bs(ve,void 0,ie);(i.onWarning||i.onMutation)&&U.setDebugHooks({onWarning:i.onWarning,onMutation:i.onMutation});const we=U.getRoot();ve.set(Pn,we.body),ve.set(Hn,we.head),ve.set(zn,we.html),ve.set(un,document),U.onNodeRemoved=G=>{const K=n.get(H);K&&K.detachByNodeId(G)},D.set(H,U);const fe=new xs(H,ve),ge=t.getTransport(H);if(ge){(Oe=s.debug)!=null&&Oe.exposeDevtools&&((Fe=ge.enableStats)==null||Fe.call(ge,!0)),fe.setTransport(ge);const G=()=>{fe.detachAll(),n.delete(H),U.clear(),D.delete(H),W===H&&(te=null,W=null);const K=a.get(H);K&&(K.stopPolling(),a.delete(H)),e.setAppCount(D.size)};console.debug("[async-dom] App",H,"transport ready, readyState:",ge.readyState),ge.onError=K=>{console.error("[async-dom] App",H,"worker error:",K.message),_==null||_({message:K.message,stack:K.stack,name:K.name},H)},ge.onClose=()=>{console.warn("[async-dom] App",H,"worker disconnected, cleaning up"),G()},ge.onMessage(K=>{if(ct(K)&&K.type==="error"&&"error"in K){const _e=K;_==null||_(_e.error,H);const ye=_e.error,oe=ye.filename?` at ${ye.filename}:${ye.lineno??"?"}:${ye.colno??"?"}`:"";ln({code:ye.isUnhandledRejection?"WORKER_UNHANDLED_REJECTION":"WORKER_ERROR",message:`[${String(H)}] ${ye.name??"Error"}: ${ye.message}${oe}${ye.stack?`
${ye.stack}`:""}`,context:{appId:String(H),error:ye},timestamp:performance.now()})}})}i.onEvent&&(fe.onTimingResult=G=>{var K;(K=i.onEvent)==null||K.call(i,{side:"main",phase:"dispatch",eventType:G.eventType,listenerId:G.listenerId,targetId:null,timestamp:G.timestamp,transportMs:G.transportMs,dispatchMs:G.dispatchMs,mutationCount:G.mutationCount})}),n.set(H,fe),e.setAppCount(D.size);const Ge=c?!0:se??!1;let ke;if(Ge&&typeof SharedArrayBuffer<"u")try{ke=new SharedArrayBuffer(65536);const G=new Zn(ke);G.startPolling(K=>he(U,K)),a.set(H,G)}catch{ke=void 0}return ge&&ge.onMessage(G=>{if(ct(G)&&G.type==="query"){const K=G,ye={boundingRect:$e.BoundingRect,computedStyle:$e.ComputedStyle,nodeProperty:$e.NodeProperty,windowProperty:$e.WindowProperty}[K.query]??$e.NodeProperty,oe=he(U,{queryType:ye,data:JSON.stringify({nodeId:K.nodeId,property:K.property})});ge.send({type:"queryResult",uid:K.uid,result:oe})}}),t.sendToThread(H,{type:"init",appId:H,location:{hash:window.location.hash,href:window.location.href,port:window.location.port,host:window.location.host,origin:window.location.origin,hostname:window.location.hostname,pathname:window.location.pathname,protocol:window.location.protocol,search:window.location.search,state:window.history.state},sharedBuffer:ke}),H}let Ne=null;if((Ue=s.debug)!=null&&Ue.exposeDevtools&&(globalThis.__ASYNC_DOM_DEVTOOLS__={scheduler:{pending:()=>e.pendingCount,stats:()=>e.getStats(),frameLog:()=>e.getFrameLog(),flush:()=>e.flush()},getEventTraces:()=>{const c=[];for(const f of n.values())c.push(...f.getEventTraces());return c.sort((f,L)=>f.timestamp-L.timestamp),c},enableHighlightUpdates:c=>{for(const f of D.values())f.enableHighlightUpdates(c)},findRealNode:c=>{for(const f of D.values()){const L=f.getNode(c);if(L)return L}return null},getListenersForNode:c=>{const f=[];for(const L of n.values())f.push(...L.getListenersForNode(c));return f},debugStats:()=>h.snapshot(),apps:()=>[...D.keys()],renderers:()=>{const c={};for(const[f,L]of D)c[String(f)]={root:L.getRoot()};return c},refreshDebugData:()=>{for(const c of D.keys())pe(c)},getAppData:c=>ae.get(c),getTransportStats:()=>{var f;const c={};for(const L of D.keys()){const S=t.getTransport(L);c[String(L)]=((f=S==null?void 0:S.getStats)==null?void 0:f.call(S))??null}return c},getAllAppsData:()=>{const c={};for(const[f,L]of ae)c[String(f)]=L;return c},replayMutation:(c,f)=>{const L=D.get(f);L&&L.apply(c)},clearAndReapply:(c,f)=>{for(const L of D.values()){const S=L.getRoot();S&&(S.body.textContent="",S.head.textContent="");const _=Math.min(f,c.length);for(let ne=0;ne<_;ne++)L.apply(c[ne].mutation,c[ne].batchUid);break}},getCausalityTracker:()=>C,getWorkerPerfEntries:()=>{const c={};for(const[f,L]of O)c[String(f)]=L.slice();return c},getMutationCorrelation:()=>z},typeof document<"u"&&(Ne=bs())),(Re=s.debug)!=null&&Re.exposeDevtools){const c=i.onMutation,f=i.onWarning,L=i.onEvent,S=i.onSyncRead;i.onMutation=_=>{c==null||c(_),fs(_),z.indexMutation(_)},i.onWarning=_=>{f==null||f(_),ln(_)},i.onEvent=_=>{L==null||L(_),ms(_)},i.onSyncRead=_=>{S==null||S(_),gs(_)}}console.debug("[async-dom] Initialized",{apps:s.worker?1:0,debug:!!s.debug,scheduler:s.scheduler??"default"});const Ve=()=>{t.broadcast({type:"visibility",state:document.visibilityState})};return document.addEventListener("visibilitychange",Ve),{start(){e.start()},stop(){e.stop()},destroy(){e.stop(),e.flush();for(const c of D.values())c.clear();D.clear(),te=null,W=null;for(const c of n.values())c.detachAll();for(const c of a.values())c.stopPolling();a.clear(),document.removeEventListener("visibilitychange",Ve),t.destroyAll(),Ne&&(Ne.destroy(),Ne=null)},addApp(c){return ue(c.worker,c.mountPoint,c.shadow,c.transport,c.onError,c.name)},addRemoteApp(c){return ue(void 0,c.mountPoint,c.shadow,c.transport,c.onError,c.name,c.enableSyncChannel)},removeApp(c){const f=n.get(c);f&&(f.detachAll(),n.delete(c));const L=D.get(c);L&&(L.clear(),D.delete(c)),W===c&&(te=null,W=null);const S=a.get(c);S&&(S.stopPolling(),a.delete(c)),t.destroyThread(c),e.setAppCount(D.size)}}}export{Bs as DomRenderer,xs as EventBridge,Xn as FrameScheduler,Js as ThreadManager,ea as createAsyncDom};
