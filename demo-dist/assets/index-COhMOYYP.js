var In=Object.defineProperty;var Rn=(n,e,t)=>e in n?In(n,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):n[e]=t;var c=(n,e,t)=>Rn(n,typeof e!="symbol"?e+"":e,t);const Qe={MISSING_NODE:"ASYNC_DOM_MISSING_NODE",BLOCKED_PROPERTY:"ASYNC_DOM_BLOCKED_PROPERTY"},_n={ASYNC_DOM_MISSING_NODE:{description:"A DOM mutation referenced a node ID that doesn't exist in the node cache.",suggestion:"Ensure nodes are created before being referenced. Check for race conditions between create and update mutations."},ASYNC_DOM_SYNC_TIMEOUT:{description:"A synchronous read (getBoundingClientRect, computedStyle) timed out waiting for the main thread response.",suggestion:"Reduce sync read frequency, increase timeout, or use cached values when possible."},ASYNC_DOM_LISTENER_NOT_FOUND:{description:"An event was received for a listener ID that is not registered.",suggestion:"This may indicate a timing issue where a listener was removed before its event was processed."},ASYNC_DOM_EVENT_ATTACH_FAILED:{description:"Failed to attach an event listener to a DOM node.",suggestion:"Verify the target node exists in the DOM when the listener is being attached."},ASYNC_DOM_TRANSPORT_NOT_OPEN:{description:"Attempted to send a message through a closed or connecting transport.",suggestion:"Ensure the transport connection is established before sending mutations."},ASYNC_DOM_BLOCKED_PROPERTY:{description:"A setProperty call was blocked because the property is not in the allowed list.",suggestion:"Add the property to additionalAllowedProperties in the renderer permissions if it's safe."},WORKER_ERROR:{description:"An unhandled error occurred in the worker thread.",suggestion:"Check the stack trace for the error source. Add error handling in your worker code."},WORKER_UNHANDLED_REJECTION:{description:"An unhandled promise rejection occurred in the worker thread.",suggestion:"Add .catch() handlers to promises or use try/catch with async/await in your worker code."}},Dn={warning(n){console.warn(`[async-dom] ${n.code}: ${n.message}`,n.context)},mutation(n){console.log(`[async-dom:${n.side}] mutation:${n.action}`,n.mutation)},event(n){console.log(`[async-dom:${n.side}] event:${n.phase} ${n.eventType} listenerId=${n.listenerId}`)},syncRead(n){console.log(`[async-dom] sync:${n.queryType} node=${n.nodeId} ${n.result} (${n.latencyMs.toFixed(1)}ms)`)},scheduler(n){console.log(`[async-dom] frame:${n.frameId} actions=${n.actionsProcessed} time=${n.frameTimeMs.toFixed(1)}ms queue=${n.queueDepth}`)}};class Bn{constructor(){c(this,"mutationsAdded",0);c(this,"mutationsCoalesced",0);c(this,"mutationsFlushed",0);c(this,"mutationsApplied",0);c(this,"eventsForwarded",0);c(this,"eventsDispatched",0);c(this,"syncReadRequests",0);c(this,"syncReadTimeouts",0)}snapshot(){return{mutationsAdded:this.mutationsAdded,mutationsCoalesced:this.mutationsCoalesced,mutationsFlushed:this.mutationsFlushed,mutationsApplied:this.mutationsApplied,eventsForwarded:this.eventsForwarded,eventsDispatched:this.eventsDispatched,syncReadRequests:this.syncReadRequests,syncReadTimeouts:this.syncReadTimeouts}}reset(){this.mutationsAdded=0,this.mutationsCoalesced=0,this.mutationsFlushed=0,this.mutationsApplied=0,this.eventsForwarded=0,this.eventsDispatched=0,this.syncReadRequests=0,this.syncReadTimeouts=0}}class On{constructor(){c(this,"nodeIndex",new Map);c(this,"maxEntriesPerNode",20);c(this,"batchEventMap",new Map)}registerBatchEvent(e,t){if(this.batchEventMap.set(e,t),this.batchEventMap.size>500){const s=this.batchEventMap.keys().next().value;s!==void 0&&this.batchEventMap.delete(s)}}indexMutation(e){const s=e.mutation.id;if(s==null)return;const a=e.batchUid!=null?this.batchEventMap.get(e.batchUid)??null:null;let i=this.nodeIndex.get(s);i||(i=[],this.nodeIndex.set(s,i)),i.push({batchUid:e.batchUid,action:e.action,timestamp:e.timestamp,causalEvent:a}),i.length>this.maxEntriesPerNode&&i.shift()}getWhyUpdated(e){return this.nodeIndex.get(e)??[]}clear(){this.nodeIndex.clear(),this.batchEventMap.clear()}}function Fn(n){if(!n)return{onMutation:null,onEvent:null,onSyncRead:null,onScheduler:null,onWarning:null};const e={...Dn,...n.logger};return{onMutation:n.logMutations?t=>e.mutation(t):null,onEvent:n.logEvents?t=>e.event(t):null,onSyncRead:n.logSyncReads?t=>e.syncRead(t):null,onScheduler:n.logScheduler?t=>e.scheduler(t):null,onWarning:n.logWarnings?t=>e.warning(t):null}}const Pn=1,Hn=2,zn=3,fn=4;function mn(n){return n.type==="mutation"}function Wn(n){return n.type==="event"}function it(n){return!mn(n)&&!Wn(n)}class Wt{constructor(){c(this,"cache",new Map);c(this,"reverseCache",new WeakMap)}get(e){return e===fn?document:this.cache.get(e)??null}getId(e){return this.reverseCache.get(e)??null}set(e,t){this.cache.set(e,t),this.reverseCache.set(t,e)}delete(e){const t=this.cache.get(e);t&&this.reverseCache.delete(t),this.cache.delete(e)}clear(){this.cache.clear()}has(e){return this.cache.has(e)}}const qn=16,Dt=1500,nn=3e3,Un=500,Kn=60,Yn=10,jn=1e3,Vn=3e4,Gn=30;class Xn{constructor(e={}){c(this,"queue",[]);c(this,"actionTimes",new Map);c(this,"frameId",0);c(this,"running",!1);c(this,"rafId",0);c(this,"uidCounter",0);c(this,"timePerLastFrame",0);c(this,"totalActionsLastFrame",0);c(this,"isScrolling",!1);c(this,"scrollTimer",null);c(this,"scrollAbort",null);c(this,"viewportHeight",0);c(this,"viewportWidth",0);c(this,"boundingRectCache",new Map);c(this,"boundingRectCacheFrame",new Map);c(this,"frameBudgetMs");c(this,"enableViewportCulling");c(this,"enablePrioritySkipping");c(this,"applier",null);c(this,"appCount",0);c(this,"appBudgets",new Map);c(this,"lastTickTime",0);c(this,"healthCheckTimer",null);c(this,"queueOverflowWarned",!1);c(this,"lastEnqueueTime",0);c(this,"droppedFrameCount",0);c(this,"lastWorkerToMainLatencyMs",0);c(this,"frameLog",[]);this.frameBudgetMs=e.frameBudgetMs??qn,this.enableViewportCulling=e.enableViewportCulling??!0,this.enablePrioritySkipping=e.enablePrioritySkipping??!0}setApplier(e){this.applier=e}setAppCount(e){this.appCount=e}enqueue(e,t,s="normal",a){this.lastEnqueueTime=performance.now();for(const i of e)this.uidCounter++,this.queue.push({mutation:i,priority:s,uid:this.uidCounter,appId:t,batchUid:a});this.queue.length>1e4&&!this.queueOverflowWarned&&(this.queueOverflowWarned=!0,console.warn(`[async-dom] Scheduler queue overflow: ${this.queue.length} pending mutations. Possible causes: tab hidden, applier not set, or mutations arriving faster than processing.`)),this.queue.length<=1e4&&(this.queueOverflowWarned=!1)}start(){this.running||(this.running=!0,this.lastTickTime=0,this.setupScrollListener(),this.scheduleFrame(),this.healthCheckTimer=setTimeout(()=>{this.running&&this.lastTickTime===0&&console.warn(`[async-dom] Scheduler started but tick() has not fired after 1 second. This usually means the tab is hidden (rAF does not fire in background tabs). Queue has ${this.queue.length} pending mutations.`)},1e3),console.debug("[async-dom] Scheduler started"))}scheduleFrame(){this.running&&(typeof document<"u"&&document.hidden?setTimeout(()=>this.tick(performance.now()),this.frameBudgetMs):this.rafId=requestAnimationFrame(e=>this.tick(e)))}stop(){this.running=!1,this.healthCheckTimer&&(clearTimeout(this.healthCheckTimer),this.healthCheckTimer=null),this.rafId&&(cancelAnimationFrame(this.rafId),this.rafId=0),this.scrollAbort&&(this.scrollAbort.abort(),this.scrollAbort=null),this.clearViewportCache()}clearViewportCache(){this.boundingRectCache.clear(),this.boundingRectCacheFrame.clear()}flush(){const e=this.applier;if(e){this.queue.sort(sn);for(const t of this.queue)e(t.mutation,t.appId,t.batchUid);this.queue.length=0}}get pendingCount(){return this.queue.length}recordWorkerLatency(e){this.lastWorkerToMainLatencyMs=Math.max(0,Date.now()-e)}getStats(){return{pending:this.queue.length,frameId:this.frameId,lastFrameTimeMs:this.timePerLastFrame,lastFrameActions:this.totalActionsLastFrame,isRunning:this.running,lastTickTime:this.lastTickTime,enqueueToApplyMs:this.lastTickTime>0&&this.lastEnqueueTime>0?Math.max(0,this.lastTickTime-this.lastEnqueueTime):0,droppedFrameCount:this.droppedFrameCount,workerToMainLatencyMs:this.lastWorkerToMainLatencyMs}}getFrameLog(){return this.frameLog.slice()}tick(e){if(!this.running)return;this.lastTickTime=performance.now();const t=performance.now();this.frameId++,this.calcViewportSize(),this.queue.sort(sn);const s=this.applier;if(!s){this.scheduleNext(t);return}let a=0;const i=this.getActionsForFrame(),h=[],w=new Map,H=new Map,K=new Map;this.appCount>1&&this.appBudgets.clear();let q=0;for(;q<this.queue.length&&a<i;){const te=performance.now()-t;if(this.queue.length<nn&&te>=this.frameBudgetMs)break;const z=this.queue[q];if(q++,this.shouldSkip(z))continue;if(this.appCount>1){const he=this.appBudgets.get(z.appId)??0,ye=Math.ceil(i/this.appCount);if(he>=ye){h.push(z);const Te=String(z.appId);K.set(Te,(K.get(Te)??0)+1);continue}this.appBudgets.set(z.appId,he+1)}const se=performance.now();s(z.mutation,z.appId,z.batchUid);const ge=performance.now()-se;{const he=String(z.appId);H.set(he,(H.get(he)??0)+1)}this.recordTiming(z.mutation.action,ge),w.set(z.mutation.action,(w.get(z.mutation.action)??0)+ge),a++}q===this.queue.length?this.queue.length=0:q>0&&(this.queue=this.queue.slice(q)),h.length>0&&(this.queue=h.concat(this.queue));const D=performance.now()-t;if(a>0){D>this.frameBudgetMs&&this.droppedFrameCount++,this.timePerLastFrame=D,this.totalActionsLastFrame=a;let te;if(H.size>0||K.size>0){te=new Map;const z=new Set([...H.keys(),...K.keys()]);for(const se of z)te.set(se,{mutations:H.get(se)??0,deferred:K.get(se)??0})}this.frameLog.push({frameId:this.frameId,totalMs:D,actionCount:a,timingBreakdown:w,perApp:te}),this.frameLog.length>Gn&&this.frameLog.shift()}this.scheduleNext(t)}scheduleNext(e){const t=performance.now()-e;t+1>=this.frameBudgetMs?this.scheduleFrame():setTimeout(()=>{this.scheduleFrame()},this.frameBudgetMs-t)}getActionsForFrame(){const e=this.queue.length;if(e>25e3)return e;if(e>=nn)return Un;if(e>Dt)return Dt;const t=this.getAvgActionTime();return t>0?Math.max(1,Math.floor(this.frameBudgetMs*3/t)):2e3}shouldSkip(e){if(!this.enablePrioritySkipping)return!1;const t=e.mutation;return"optional"in t&&t.optional?this.isScrolling||this.queue.length>Dt/2||this.timePerLastFrame>this.frameBudgetMs+.2?!0:(this.enableViewportCulling&&t.action,!1):!1}recordTiming(e,t){t>0&&this.actionTimes.set(e,t+.02)}getAvgActionTime(){return this.totalActionsLastFrame===0?0:this.timePerLastFrame/this.totalActionsLastFrame}calcViewportSize(){this.viewportHeight=window.innerHeight||document.documentElement.clientHeight,this.viewportWidth=window.innerWidth||document.documentElement.clientWidth}isInViewport(e){const t=e.id;if(!t)return!0;const s=this.boundingRectCacheFrame.get(t);if(s!==void 0&&s+Kn>this.frameId)return this.boundingRectCache.get(t)??!0;const a=e.getBoundingClientRect(),i=a.top>=0&&a.left>=0&&a.bottom<=this.viewportHeight&&a.right<=this.viewportWidth;return this.boundingRectCache.set(t,i),this.boundingRectCacheFrame.set(t,this.frameId),i}setupScrollListener(){this.scrollAbort&&this.scrollAbort.abort(),this.scrollAbort=new AbortController,window.addEventListener("scroll",()=>{this.isScrolling=!0,this.scrollTimer!==null&&clearTimeout(this.scrollTimer),this.scrollTimer=setTimeout(()=>{this.isScrolling=!1},66)},{passive:!0,signal:this.scrollAbort.signal})}}function sn(n,e){const t={high:0,normal:1,low:2},s=t[n.priority],a=t[e.priority];if(s!==a)return s-a;const i="optional"in n.mutation&&n.mutation.optional?1:0,h="optional"in e.mutation&&e.mutation.optional?1:0;return i!==h?i-h:n.uid-e.uid}const Bt=16,Ot=4096,Jn=1,Qn=2;var Me=(n=>(n[n.BoundingRect=0]="BoundingRect",n[n.ComputedStyle=1]="ComputedStyle",n[n.NodeProperty=2]="NodeProperty",n[n.WindowProperty=3]="WindowProperty",n))(Me||{});class Zn{constructor(e){c(this,"signal");c(this,"meta");c(this,"requestRegion");c(this,"responseRegion");c(this,"encoder",new TextEncoder);c(this,"decoder",new TextDecoder);c(this,"polling",!1);c(this,"pollChannel",null);this.signal=new Int32Array(e,0,4),this.meta=this.signal,this.requestRegion=new Uint8Array(e,Bt,Ot),this.responseRegion=new Uint8Array(e,Bt+Ot,e.byteLength-Bt-Ot)}poll(){if(Atomics.load(this.signal,0)!==Jn)return null;const t=Atomics.load(this.meta,1),s=Atomics.load(this.meta,2),a=this.requestRegion.slice(0,s),i=this.decoder.decode(a);return{queryType:t,data:i}}respond(e){const t=JSON.stringify(e),s=this.encoder.encode(t);this.responseRegion.set(s),Atomics.store(this.meta,3,s.byteLength),Atomics.store(this.signal,0,Qn),Atomics.notify(this.signal,0)}startPolling(e){if(!this.polling)if(this.polling=!0,typeof MessageChannel<"u"){this.pollChannel=new MessageChannel;let t=0;const s=()=>{var i,h;if(!this.polling)return;const a=this.poll();if(a){t=0;const w=e(a);this.respond(w),(i=this.pollChannel)==null||i.port2.postMessage(null)}else if(t++,t<=2)(h=this.pollChannel)==null||h.port2.postMessage(null);else{const w=Math.min(1<<t-3,16);setTimeout(()=>{var H;this.polling&&((H=this.pollChannel)==null||H.port2.postMessage(null))},w)}};this.pollChannel.port1.onmessage=s,this.pollChannel.port2.postMessage(null)}else{const t=setInterval(()=>{if(!this.polling){clearInterval(t);return}const s=this.poll();if(s){const a=e(s);this.respond(a)}},4)}}stopPolling(){this.polling=!1,this.pollChannel&&(this.pollChannel.port1.close(),this.pollChannel.port2.close(),this.pollChannel=null)}}function es(n){var i;const e=new Map,t=[],s=new Map,a=[];for(const h of n)if(h.causalEvent){const w=`event:${h.causalEvent.eventType}:${h.causalEvent.listenerId}:${h.causalEvent.timestamp}`;s.has(w)||s.set(w,[]),(i=s.get(w))==null||i.push(h)}else a.push(h);for(const[h,w]of s){const K=w[0].causalEvent,q={type:"event",id:h,label:`${K.eventType} (${K.listenerId})`,children:[]};for(const D of w){const te=`batch:${D.batchUid}`,z={type:"batch",id:te,label:`Batch #${D.batchUid} (${D.mutationCount} muts)`,children:[]};for(const se of D.nodeIds){const ge=`node:${se}`;e.has(ge)||e.set(ge,{type:"node",id:ge,label:`#${se}`,children:[]}),z.children.push(ge)}e.set(te,z),q.children.push(te)}e.set(h,q),t.push(h)}for(const h of a){const w=`batch:${h.batchUid}`,H={type:"batch",id:w,label:`Batch #${h.batchUid} (${h.mutationCount} muts, no event)`,children:[]};for(const K of h.nodeIds){const q=`node:${K}`;e.has(q)||e.set(q,{type:"node",id:q,label:`#${K}`,children:[]}),H.children.push(q)}e.set(w,H),t.push(w)}return{nodes:e,roots:t}}class ts{constructor(){c(this,"batches",[]);c(this,"maxBatches",100)}recordBatch(e,t,s,a){this.batches.push({batchUid:e,causalEvent:a,nodeIds:new Set(t),mutationCount:s,timestamp:Date.now()}),this.batches.length>this.maxBatches&&this.batches.shift()}getBatches(){return this.batches.slice()}buildGraph(){return es(this.batches)}findBatchesForNode(e){return this.batches.filter(t=>t.nodeIds.has(e))}clear(){this.batches.length=0}}function Et(n){return n===0?"0 B":n<1024?`${n} B`:n<1024*1024?`${(n/1024).toFixed(1)} KB`:`${(n/(1024*1024)).toFixed(1)} MB`}function ns(n){return{entries:[...n],currentIndex:0,isPlaying:!1}}function an(n){return n.currentIndex>=n.entries.length?null:n.entries[n.currentIndex++]}function Ft(n,e){n.currentIndex=Math.max(0,Math.min(e,n.entries.length))}function ss(n){n.currentIndex=0,n.isPlaying=!1}function as(n){const e={version:1,exportedAt:new Date().toISOString(),...n};return JSON.stringify(e,os,2)}function os(n,e){return e instanceof Map?Object.fromEntries(e):e}function rs(n){const e=JSON.parse(n);if(!e||typeof e!="object")throw new Error("Invalid session: not an object");if(e.version!==1)throw new Error(`Unsupported session version: ${e.version}`);if(!Array.isArray(e.mutationLog))throw new Error("Invalid session: mutationLog must be an array");if(!Array.isArray(e.warningLog))throw new Error("Invalid session: warningLog must be an array");if(!Array.isArray(e.eventLog))throw new Error("Invalid session: eventLog must be an array");if(!Array.isArray(e.syncReadLog))throw new Error("Invalid session: syncReadLog must be an array");const t=1e4;return e.mutationLog.length>t&&(e.mutationLog=e.mutationLog.slice(-t)),e.warningLog.length>t&&(e.warningLog=e.warningLog.slice(-t)),e.eventLog.length>t&&(e.eventLog=e.eventLog.slice(-t)),e.syncReadLog.length>t&&(e.syncReadLog=e.syncReadLog.slice(-t)),e}function is(n,e){const t=new Blob([n],{type:"application/json"}),s=URL.createObjectURL(t),a=document.createElement("a");a.href=s,a.download=e,a.click(),URL.revokeObjectURL(s)}function Pt(n,e){if(n.length===0)return 0;const t=Math.ceil(e/100*n.length)-1;return n[Math.max(0,t)]}function on(n){if(n.length===0)return{p50:0,p95:0,p99:0};const e=[...n].sort((t,s)=>t-s);return{p50:Pt(e,50),p95:Pt(e,95),p99:Pt(e,99)}}function lt(n){return n>16?"red":n>5?"yellow":"green"}function rn(n){return n>50?"red":n>5?"yellow":"green"}function Ht(n){const e={type:n.type};return n.tag!==void 0&&(e.tag=n.tag),n.id!==void 0&&(e.id=n.id),n.className!==void 0&&(e.className=n.className),n.text!==void 0&&(e.text=n.text),n.attributes&&(e.attributes={...n.attributes}),n.children&&(e.children=n.children.map(Ht)),e}function ls(n,e){return!n&&!e?null:!n&&e?dt(e):n&&!e?pt(n):zt(n,e)}function dt(n){const e={diffType:"added",node:n};return n.children&&(e.children=n.children.map(dt)),e}function pt(n){const e={diffType:"removed",node:n};return n.children&&(e.children=n.children.map(pt)),e}function zt(n,e){const t=[];if(n.type!==e.type||n.tag!==e.tag)return{diffType:"changed",node:e,changes:["replaced"],children:[pt(n),dt(e)]};if(n.type==="element"&&e.type==="element"){const H=n.attributes??{},K=e.attributes??{},q=new Set([...Object.keys(H),...Object.keys(K)]);for(const D of q)H[D]!==K[D]&&t.push(`attr:${D}`);n.className!==e.className&&t.push("className")}n.text!==e.text&&t.push("text");const s=n.children??[],a=e.children??[],i=cs(s,a),w={diffType:t.length>0?"changed":"unchanged",node:e};return t.length>0&&(w.changes=t),i.length>0&&(w.children=i),w}function cs(n,e){const t=[],s=new Map,a=[];for(const h of n)h.id!=null?s.set(h.id,{node:h,used:!1}):a.push(h);let i=0;for(const h of e)if(h.id!=null){const w=s.get(h.id);w?(w.used=!0,t.push(zt(w.node,h))):t.push(dt(h))}else i<a.length?(t.push(zt(a[i],h)),i++):t.push(dt(h));for(const[,h]of s)h.used||t.push(pt(h.node));for(let h=i;h<a.length;h++)t.push(pt(a[h]));return t}function gn(n){return n.diffType!=="unchanged"?!0:n.children?n.children.some(gn):!1}const ds=200,ps=200,hs=200,us=200,Ee=[],Ke=[],et=[],Se=[];let Le=0,ct=null,Ye=!1;function fs(n){Ye||(Ee.push(n),Ee.length>ds&&Ee.shift())}function ms(n){Ye||(et.push(n),et.length>hs&&et.shift())}function gs(n){Ye||(Se.push(n),Se.length>us&&Se.shift())}function ln(n){Ke.push(n),Ke.length>ps&&Ke.shift(),Le++,ct==null||ct()}const ys=`
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
`;function P(n){return n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function Ze(n){const e=new Date(n);if(Number.isNaN(e.getTime())){const h=new Date,w=String(h.getHours()).padStart(2,"0"),H=String(h.getMinutes()).padStart(2,"0"),K=String(h.getSeconds()).padStart(2,"0");return`${w}:${H}:${K}`}const t=String(e.getHours()).padStart(2,"0"),s=String(e.getMinutes()).padStart(2,"0"),a=String(e.getSeconds()).padStart(2,"0"),i=String(e.getMilliseconds()).padStart(3,"0");return`${t}:${s}:${a}.${i}`}function Ne(n,e){return n.length>e?`${n.slice(0,e)}...`:n}function cn(n){if(n.length===0)return"";const e="▁▂▃▄▅▆▇█",t=Math.max(...n),s=Math.min(...n),a=t-s||1;return n.map(i=>e[Math.min(Math.floor((i-s)/a*7),7)]).join("")}function bs(){const n=document.createElement("div");n.id="__async-dom-devtools__";const e=n.attachShadow({mode:"open"}),t=document.createElement("style");t.textContent=ys,e.appendChild(t);const s=document.createElement("div");s.className="panel collapsed";const a=document.createElement("button");a.className="toggle-tab";const i=document.createElement("span");i.style.cssText="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background-color:#4ec9b0;vertical-align:middle;",a.appendChild(i);const h=document.createElement("span");h.textContent="async-dom ▲",a.appendChild(h),s.appendChild(a);const w=document.createElement("div");w.className="header-bar";const H=document.createElement("span");H.className="header-title",H.textContent="async-dom devtools";const K=document.createElement("span");K.className="import-indicator",K.style.display="none",H.appendChild(K),w.appendChild(H);const q=document.createElement("div");q.className="header-actions";const D=document.createElement("button");D.className="header-btn",D.textContent="⬤",D.title="Highlight DOM updates",D.style.fontSize="8px",D.style.color="#808080",D.addEventListener("click",()=>{yt=!yt,D.style.color=yt?"#4ec9b0":"#808080";const o=be();o&&o.enableHighlightUpdates(yt)}),q.appendChild(D);const te=document.createElement("button");te.className="header-btn",te.textContent="↓",te.title="Export debug session",q.appendChild(te);const z=document.createElement("button");z.className="header-btn",z.textContent="↑",z.title="Import debug session",q.appendChild(z);const se=document.createElement("button");se.className="header-btn",se.textContent="↻",se.title="Refresh data from workers",q.appendChild(se);const ge=document.createElement("button");ge.className="header-btn",ge.textContent="▼",ge.title="Collapse",q.appendChild(ge),w.appendChild(q),s.appendChild(w);const he=document.createElement("div");he.className="app-bar",s.appendChild(he);let ye=null;const Te=document.createElement("div");Te.className="tab-bar";const je=["Tree","Performance","Log","Warnings","Graph"],Fe={},Ae={};for(const o of je){const r=document.createElement("button");r.className=`tab-btn${o==="Tree"?" active":""}`,r.textContent=o,r.dataset.tab=o,Te.appendChild(r),Fe[o]=r}s.appendChild(Te);const p=document.createElement("span");p.className="tab-badge",p.style.display="none";let f="Tree";function L(o){f=o;for(const r of je)Fe[r].classList.toggle("active",r===o),Ae[r].classList.toggle("active",r===o);o==="Warnings"&&(Le=0,Rt()),Xe()}for(const o of je)Fe[o].addEventListener("click",()=>L(o));const S=document.createElement("div");S.className="tab-content active",S.innerHTML='<div class="tree-empty">Click refresh to load virtual DOM tree from worker.</div>',Ae.Tree=S,s.appendChild(S);const _=document.createElement("div");_.className="tab-content",_.innerHTML='<div class="perf-row"><span class="perf-label">Loading...</span></div>',Ae.Performance=_,s.appendChild(_);const B=document.createElement("div");B.className="tab-content";const G=document.createElement("div");G.className="log-toolbar";const ie=document.createElement("input");ie.className="log-filter",ie.placeholder="Filter...",ie.type="text",G.appendChild(ie);const we=document.createElement("span");we.className="log-count",we.textContent="0",G.appendChild(we);const Z=document.createElement("button");Z.className="log-btn",Z.textContent="Pause",G.appendChild(Z);const le=document.createElement("button");le.className="log-btn active",le.textContent="Auto-scroll",G.appendChild(le);const V=document.createElement("button");V.className="log-btn",V.textContent="Clear",G.appendChild(V);const ae=document.createElement("button");ae.className="log-btn",ae.textContent="Replay",G.appendChild(ae),B.appendChild(G);const ue=document.createElement("div");ue.className="replay-bar",ue.style.display="none";const Pe=document.createElement("button");Pe.className="replay-btn",Pe.textContent="⏮",ue.appendChild(Pe);const He=document.createElement("button");He.className="replay-btn",He.textContent="◀",ue.appendChild(He);const ne=document.createElement("button");ne.className="replay-btn",ne.textContent="▶",ue.appendChild(ne);const U=document.createElement("button");U.className="replay-btn",U.textContent="▶❘",U.title="Step forward one entry",ue.appendChild(U);const $e=document.createElement("button");$e.className="replay-btn",$e.textContent="⏭",$e.title="Skip to end",ue.appendChild($e);const oe=document.createElement("input");oe.type="range",oe.className="replay-slider",oe.min="0",oe.max="0",oe.value="0",ue.appendChild(oe);const De=document.createElement("span");De.className="replay-position",De.textContent="0 / 0",ue.appendChild(De);const tt=document.createElement("button");tt.className="replay-btn",tt.textContent="1x",ue.appendChild(tt);const ht=document.createElement("button");ht.className="replay-btn replay-exit",ht.textContent="✕ Exit",ue.appendChild(ht);const fe=document.createElement("div");fe.className="log-list",fe.innerHTML='<div class="log-empty">No mutations captured yet.</div>',B.appendChild(fe),B.insertBefore(ue,fe),Ae.Log=B,s.appendChild(B);const nt=document.createElement("div");nt.className="tab-content";const st=document.createElement("div");st.className="log-toolbar";const Ve=document.createElement("input");Ve.className="log-filter",Ve.placeholder="Filter warnings...",Ve.type="text",st.appendChild(Ve);const Ge=document.createElement("button");Ge.className="log-btn warn-view-toggle",Ge.textContent="Chronological",st.appendChild(Ge);const Be=document.createElement("button");Be.className="log-btn",Be.textContent="Clear",st.appendChild(Be),nt.appendChild(st);const ke=document.createElement("div");ke.className="log-list",ke.innerHTML='<div class="warn-empty">No warnings captured yet.</div>',nt.appendChild(ke),Ae.Warnings=nt,s.appendChild(nt);const Oe=document.createElement("div");Oe.className="tab-content",Oe.innerHTML='<div class="graph-empty">No causality data yet. Interact with the app to generate event-mutation data.</div>',Ae.Graph=Oe,s.appendChild(Oe),Fe.Warnings.appendChild(p),e.appendChild(s),document.body.appendChild(n);let ut=null,ft=null,mt=null,gt=!0;const at=[],qt=30;let yt=!1,Tt=null,Nt=null;const ze=[],Ut=60;let A=null,ve=null,bt=1;const kt=[1,2,5];let J=null,Ie=null,We=null,qe=!1,Ue=null;function Re(){A&&(oe.max=String(A.entries.length),oe.value=String(A.currentIndex),De.textContent=`${A.currentIndex} / ${A.entries.length}`,ne.textContent=A.isPlaying?"⏸":"▶",ne.classList.toggle("active",A.isPlaying))}function bn(){J||(A=ns(Ee),ue.style.display="flex",ae.classList.add("active"),Re(),Ce())}function Mt(){ve&&(clearInterval(ve),ve=null),A&&(A.isPlaying=!1,A=null),ue.style.display="none",ae.classList.remove("active"),Ce()}function Kt(o){const r=be();if(!(r!=null&&r.replayMutation))return;const E=r.apps()[0];E&&r.replayMutation(o.mutation,E)}function vt(o){if(!A)return;const r=be();r!=null&&r.clearAndReapply&&r.clearAndReapply(A.entries,o)}function vn(){if(!A)return;const o=an(A);o&&Kt(o),Re(),Ce()}function xn(){A&&(A.currentIndex>0&&(Ft(A,A.currentIndex-1),vt(A.currentIndex)),Re(),Ce())}function wn(){A&&(ss(A),vt(0),Re(),Ce())}function Cn(){A&&(Ft(A,A.entries.length),vt(A.entries.length),Re(),Ce())}function Yt(){if(A){if(A.isPlaying=!A.isPlaying,A.isPlaying){const o=Math.max(50,500/bt);ve=setInterval(()=>{if(!A||A.currentIndex>=A.entries.length){A&&(A.isPlaying=!1),ve&&(clearInterval(ve),ve=null),Re();return}const r=an(A);r&&Kt(r),Re(),Ce()},o)}else ve&&(clearInterval(ve),ve=null);Re()}}function En(){const o=kt.indexOf(bt);bt=kt[(o+1)%kt.length],tt.textContent=`${bt}x`,A!=null&&A.isPlaying&&(ve&&(clearInterval(ve),ve=null),A.isPlaying=!1,Yt())}ae.addEventListener("click",()=>{A?Mt():bn()}),Pe.addEventListener("click",wn),He.addEventListener("click",xn),ne.addEventListener("click",Yt),U.addEventListener("click",vn),$e.addEventListener("click",Cn),oe.addEventListener("input",()=>{if(!A)return;const o=Number(oe.value);Ft(A,o),vt(A.currentIndex),Re(),Ce()}),tt.addEventListener("click",En),ht.addEventListener("click",Mt),te.addEventListener("click",()=>{var C;const o=be(),r=((C=o==null?void 0:o.scheduler)==null?void 0:C.stats())??{},E=(o==null?void 0:o.getAllAppsData())??{},l=Object.values(E)[0],$=as({mutationLog:J?J.mutationLog:[...Ee],warningLog:J?J.warningLog:[...Ke],eventLog:J?J.eventLog:[...et],syncReadLog:J?J.syncReadLog:[...Se],schedulerStats:r,tree:l==null?void 0:l.tree,appData:E}),W=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);is($,`async-dom-session-${W}.json`)}),z.addEventListener("click",()=>{const o=document.createElement("input");o.type="file",o.accept=".json",o.addEventListener("change",()=>{var l;const r=(l=o.files)==null?void 0:l[0];if(!r)return;const E=new FileReader;E.onload=()=>{try{const $=rs(E.result);Sn($)}catch($){console.error("[async-dom devtools] Import failed:",$)}},E.readAsText(r)}),o.click()});function jt(o){V.disabled=o,Z.disabled=o,le.disabled=o,ae.disabled=o,Be.disabled=o;const r=o?"0.4":"1";V.style.opacity=r,Z.style.opacity=r,le.style.opacity=r,ae.style.opacity=r,Be.style.opacity=r,o?(V.style.pointerEvents="none",Z.style.pointerEvents="none",le.style.pointerEvents="none",ae.style.pointerEvents="none",Be.style.pointerEvents="none"):(V.style.pointerEvents="",Z.style.pointerEvents="",le.style.pointerEvents="",ae.style.pointerEvents="",Be.style.pointerEvents="")}function Sn(o){J=o,A&&Mt(),K.textContent="[IMPORTED]",K.style.display="inline",jt(!0);let r=q.querySelector(".close-import-btn");r||(r=document.createElement("button"),r.className="header-btn close-import-btn",r.textContent="✕",r.title="Close imported session",r.style.color="#d7ba7d",r.addEventListener("click",Tn),q.insertBefore(r,q.firstChild)),Xe()}function Tn(){J=null,K.style.display="none",K.textContent="",jt(!1);const o=q.querySelector(".close-import-btn");o&&o.remove(),Xe()}function Nn(){var l;const o=be();if(!((l=o==null?void 0:o.scheduler)!=null&&l.stats))return;const r=o.scheduler.stats(),E=r.pending;E>1e3||!r.isRunning||r.lastFrameTimeMs>16?i.style.backgroundColor="#f44747":E>100||r.lastFrameTimeMs>12?i.style.backgroundColor="#d7ba7d":i.style.backgroundColor="#4ec9b0"}const kn=setInterval(Nn,2e3);function be(){return globalThis.__ASYNC_DOM_DEVTOOLS__}function Mn(){s.classList.remove("collapsed"),Vt(),$n()}function Ln(){s.classList.add("collapsed"),_t()}a.addEventListener("click",Mn),ge.addEventListener("click",Ln);function Vt(){const o=be();o&&(o.refreshDebugData(),setTimeout(()=>{Gt(),Xe()},250))}se.addEventListener("click",Vt);function Gt(){const o=be();if(!o)return;const r=o.apps();if(r.length<=1){he.classList.remove("visible"),ye=r[0]??null;return}he.classList.add("visible"),he.innerHTML="";const E=document.createElement("span");E.className="app-label",E.textContent="Apps:",he.appendChild(E),(ye===null||!r.includes(ye))&&(ye=r[0]);for(const l of r){const $=document.createElement("button");$.className=`app-btn${l===ye?" active":""}`,$.textContent=l,$.addEventListener("click",()=>{ye=l,Gt(),Xe()}),he.appendChild($)}}function Xe(){f==="Tree"?xt():f==="Performance"?wt():f==="Log"?Ce():f==="Warnings"?Je():f==="Graph"&&Qt()}function Xt(o,r){var M;if(o.innerHTML="",r.id!=null){const d=document.createElement("div");d.className="sidebar-title",d.textContent="Node",o.appendChild(d);const u=document.createElement("div");u.className="sidebar-row",u.innerHTML=`<span class="sidebar-key">_nodeId</span><span class="sidebar-val">${r.id}</span>`,o.appendChild(u)}const E=document.createElement("div");if(E.className="sidebar-row",E.innerHTML=`<span class="sidebar-key">type</span><span class="sidebar-val">${P(r.type)}</span>`,o.appendChild(E),r.tag){const d=document.createElement("div");d.className="sidebar-row",d.innerHTML=`<span class="sidebar-key">tag</span><span class="sidebar-val">${P(r.tag)}</span>`,o.appendChild(d)}const l=((M=r.children)==null?void 0:M.length)??0,$=document.createElement("div");$.className="sidebar-row",$.innerHTML=`<span class="sidebar-key">children</span><span class="sidebar-val">${l}</span>`,o.appendChild($);const W=be();if(W&&r.id!=null){const d=W.findRealNode(r.id),u=d?d.isConnected:!1,g=document.createElement("div");g.className="sidebar-row",g.innerHTML=`<span class="sidebar-key">isConnected</span><span class="sidebar-val">${u}</span>`,o.appendChild(g)}const C=r.attributes??{},m=Object.keys(C);if(m.length>0){const d=document.createElement("div");d.className="sidebar-title",d.textContent="Attributes",o.appendChild(d);for(const u of m){const g=document.createElement("div");g.className="sidebar-row",g.innerHTML=`<span class="sidebar-key">${P(u)}</span><span class="sidebar-val" title="${P(C[u])}">${P(Ne(C[u],30))}</span>`,o.appendChild(g)}}else if(r.type==="element"){const d=document.createElement("div");d.className="sidebar-title",d.textContent="Attributes",o.appendChild(d);const u=document.createElement("div");u.className="sidebar-empty",u.textContent="none",o.appendChild(u)}if(W&&r.id!=null){const d=W.getListenersForNode(r.id),u=document.createElement("div");if(u.className="sidebar-title",u.textContent=`Event Listeners (${d.length})`,o.appendChild(u),d.length===0){const g=document.createElement("div");g.className="sidebar-empty",g.textContent="none",o.appendChild(g)}else for(const g of d){const T=document.createElement("div");T.className="sidebar-listener",T.innerHTML=`<span class="sidebar-listener-event">${P(g.eventName)}</span><span class="sidebar-listener-id">${P(g.listenerId)}</span>`,o.appendChild(T)}}if(C.style){const d=document.createElement("div");d.className="sidebar-title",d.textContent="Inline Styles",o.appendChild(d);const u=C.style.split(";").filter(g=>g.trim());for(const g of u){const T=g.indexOf(":");if(T===-1)continue;const I=g.slice(0,T).trim(),y=g.slice(T+1).trim(),b=document.createElement("div");b.className="sidebar-row",b.innerHTML=`<span class="sidebar-key">${P(I)}</span><span class="sidebar-val">${P(y)}</span>`,o.appendChild(b)}}if(W&&r.id!=null){const d=W.findRealNode(r.id);if(d&&d.nodeType===1&&typeof getComputedStyle=="function"){const u=getComputedStyle(d),g=["display","position","width","height","margin","padding","color","backgroundColor","fontSize","fontFamily","overflow","visibility","opacity","zIndex"],T=document.createElement("div");T.className="sidebar-title",T.textContent="Computed Styles",o.appendChild(T);for(const I of g){const y=u.getPropertyValue(I.replace(/([A-Z])/g,"-$1").toLowerCase());if(y){const b=document.createElement("div");b.className="sidebar-row",b.innerHTML=`<span class="sidebar-key">${P(I)}</span><span class="sidebar-val sidebar-computed-val">${P(Ne(y,24))}</span>`,o.appendChild(b)}}}}if(r.id!=null){const d=r.id,u=Ee.filter(T=>T.mutation.id===d),g=document.createElement("div");if(g.className="sidebar-title",g.textContent=`Mutation History (${u.length})`,o.appendChild(g),u.length===0){const T=document.createElement("div");T.className="sidebar-empty",T.textContent="none captured",o.appendChild(T)}else{const T=u.slice(-10);for(const I of T){const y=I.mutation;let b="";y.name&&(b+=` ${y.name}`),y.property&&(b+=` .${y.property}`),y.value!==void 0&&(b+=`="${Ne(String(y.value),20)}"`),y.tag&&(b+=` <${y.tag}>`),y.textContent!==void 0&&(b+=` "${Ne(String(y.textContent),20)}"`),y.childId!==void 0&&(b+=` child:${y.childId}`);const k=document.createElement("div");k.className="sidebar-mutation",k.innerHTML=`<span class="sidebar-mut-time">${Ze(I.timestamp)}</span> <span class="sidebar-mut-action">${P(I.action)}</span>`+(b?`<br><span style="color:#808080;font-size:9px;padding-left:4px">${P(b.trim())}</span>`:""),o.appendChild(k)}}}if(r.id!=null){const d=r.id,u=be();if(u!=null&&u.getMutationCorrelation){const T=u.getMutationCorrelation().getWhyUpdated(d),I=document.createElement("div");if(I.className="why-updated-title",I.textContent=`Why Updated? (${T.length})`,o.appendChild(I),T.length===0){const y=document.createElement("div");y.className="sidebar-empty",y.textContent="no correlation data",o.appendChild(y)}else{const y=T.slice(-8);for(const b of y){const k=document.createElement("div");k.className="why-updated-chain";let x=`<span class="why-chain-mutation">${P(b.action)}</span>`;b.batchUid!=null&&(x+='<span class="why-chain-arrow">→</span>',x+=`<span class="why-chain-batch">Batch #${b.batchUid}</span>`),b.causalEvent?(x+='<span class="why-chain-arrow">→</span>',x+=`<span class="why-chain-event">${P(b.causalEvent.eventType)}</span>`):(x+='<span class="why-chain-arrow">→</span>',x+='<span class="why-chain-none">no event</span>'),k.innerHTML=x,o.appendChild(k)}}}}o.classList.add("visible")}function xt(){if(J){if(J.tree){const y=J.tree,b=document.createElement("div");b.className="tree-with-sidebar";const k=document.createElement("div");k.className="tree-main";const x=document.createElement("div");x.className="tree-refresh-bar";const O=document.createElement("span");O.className="tree-status",O.textContent="Imported session tree (read-only)",x.appendChild(O),k.appendChild(x);const ce=document.createElement("div");ce.className="node-sidebar";const N=be();N&&Lt(k,y,0,!0,N,ce),b.appendChild(k),b.appendChild(ce),S.innerHTML="",S.appendChild(b)}else S.innerHTML='<div class="tree-empty">Imported session has no tree data.</div>';return}const o=be();if(!o){S.innerHTML='<div class="tree-empty">Devtools API not available.</div>';return}const r=o.getAllAppsData(),E=Object.keys(r);if(E.length===0){S.innerHTML='<div class="tree-empty">No apps registered. Click ↻ to refresh.</div>';return}const l=ye&&r[ye]?ye:E[0],$=r[l];if(!$||!$.tree){S.innerHTML='<div class="tree-empty">No virtual DOM tree received yet. Click ↻ to refresh.</div>';return}const W=$.tree,C=document.createElement("div");C.className="tree-with-sidebar";const m=document.createElement("div");m.className="tree-main";const M=document.createElement("div");M.className="snapshot-bar";const d=document.createElement("button");if(d.className="snapshot-btn",d.textContent=Ie?We?"Reset Snapshots":"Snapshot B":"Snapshot A",d.addEventListener("click",()=>{Ie&&We?(Ie=null,We=null,qe=!1,Ue=null):Ie?We=Ht(W):Ie=Ht(W),xt()}),M.appendChild(d),Ie&&We){const y=document.createElement("button");y.className="snapshot-btn",y.textContent=qe?"Hide Diff":"Show Diff",y.addEventListener("click",()=>{qe=!qe,qe?Ue=ls(Ie,We):Ue=null,xt()}),M.appendChild(y)}const u=document.createElement("span");u.className="snapshot-info",Ie&&We?(u.textContent="2 snapshots captured",qe&&Ue&&(u.textContent+=gn(Ue)?" (changes found)":" (no changes)")):Ie&&(u.textContent="1 snapshot captured"),M.appendChild(u),m.appendChild(M);const g=document.createElement("div");g.className="tree-refresh-bar";const T=document.createElement("span");T.className="tree-status",T.textContent=`Virtual DOM for app: ${l}`,g.appendChild(T),m.appendChild(g);const I=document.createElement("div");I.className="node-sidebar",qe&&Ue?Jt(m,Ue,0,!0):Lt(m,W,0,!0,o,I),C.appendChild(m),C.appendChild(I),S.innerHTML="",S.appendChild(C),Tt&&Xt(I,Tt)}function Lt(o,r,E,l,$,W){const C=document.createElement("div");C.className=`tree-node${l?" expanded":""}`;const m=document.createElement("div");m.className="tree-line",m.style.paddingLeft=`${E*14}px`;function M(){var O;const x=(O=o.closest(".tree-with-sidebar"))==null?void 0:O.querySelector(".tree-line.selected");x&&x.classList.remove("selected"),m.classList.add("selected"),Tt=r,Xt(W,r)}if(r.type==="text"){const x=document.createElement("span");x.className="tree-toggle",m.appendChild(x);const O=document.createElement("span");if(O.className="tree-text-node",O.textContent=`"${Ne((r.text??"").trim(),50)}"`,m.appendChild(O),r.id!=null){const ce=document.createElement("span");ce.className="tree-nodeid",ce.textContent=`_${r.id}`,m.appendChild(ce)}m.addEventListener("click",M),C.appendChild(m),o.appendChild(C);return}if(r.type==="comment"){const x=document.createElement("span");x.className="tree-toggle",m.appendChild(x);const O=document.createElement("span");O.className="tree-comment",O.textContent=`<!-- ${Ne(r.text??"",40)} -->`,m.appendChild(O),m.addEventListener("click",M),C.appendChild(m),o.appendChild(C);return}const d=r.children??[],u=d.length>0,g=document.createElement("span");g.className="tree-toggle",g.textContent=u?l?"▼":"▶":" ",m.appendChild(g);const T=(r.tag??"???").toLowerCase(),I=document.createElement("span");let y=`<span class="tree-tag">&lt;${P(T)}</span>`;const b=r.attributes??{};if(b.id&&(y+=` <span class="tree-attr-name">id</span>=<span class="tree-attr-value">"${P(b.id)}"</span>`),r.className){const x=Ne(r.className,30);y+=` <span class="tree-attr-name">class</span>=<span class="tree-attr-value">"${P(x)}"</span>`}let k=0;for(const x in b)if(!(x==="id"||x==="class")){if(k>=2)break;y+=` <span class="tree-attr-name">${P(x)}</span>=<span class="tree-attr-value">"${P(Ne(b[x],20))}"</span>`,k++}if(y+='<span class="tree-tag">&gt;</span>',I.innerHTML=y,m.appendChild(I),r.id!=null){const x=document.createElement("span");x.className="tree-nodeid",x.textContent=`_${r.id}`,m.appendChild(x)}if(m.addEventListener("click",x=>{if(u&&x.target===g){C.classList.toggle("expanded"),g.textContent=C.classList.contains("expanded")?"▼":"▶";return}if(M(),r.id!=null){const O=$.findRealNode(r.id);if(O&&"scrollIntoView"in O){O.scrollIntoView({behavior:"smooth",block:"center"});const ce=O.style.outline,N=O.style.outlineOffset;O.style.outline="3px solid #007acc",O.style.outlineOffset="2px",setTimeout(()=>{O.style.outline=ce,O.style.outlineOffset=N},1500)}}}),C.appendChild(m),u){const x=document.createElement("div");x.className="tree-children";for(const O of d)Lt(x,O,E+1,E<2,$,W);C.appendChild(x)}o.appendChild(C)}function Jt(o,r,E,l,$,W){const C=r.node,m=document.createElement("div");m.className=`tree-node${l?" expanded":""}`;const M=document.createElement("div");M.className="tree-line",M.style.paddingLeft=`${E*14}px`,r.diffType==="added"?M.classList.add("diff-added"):r.diffType==="removed"?M.classList.add("diff-removed"):r.diffType==="changed"&&M.classList.add("diff-changed");const d=r.children??[],u=d.length>0;if(C.type==="text"){const k=document.createElement("span");k.className="tree-toggle",M.appendChild(k);const x=document.createElement("span");x.className="tree-text-node",x.textContent=`"${Ne((C.text??"").trim(),50)}"`,M.appendChild(x),At(M,r),m.appendChild(M),o.appendChild(m);return}if(C.type==="comment"){const k=document.createElement("span");k.className="tree-toggle",M.appendChild(k);const x=document.createElement("span");x.className="tree-comment",x.textContent=`<!-- ${Ne(C.text??"",40)} -->`,M.appendChild(x),At(M,r),m.appendChild(M),o.appendChild(m);return}const g=document.createElement("span");g.className="tree-toggle",g.textContent=u?l?"▼":"▶":" ",M.appendChild(g);const T=(C.tag??"???").toLowerCase(),I=document.createElement("span");let y=`<span class="tree-tag">&lt;${P(T)}</span>`;const b=C.attributes??{};if(b.id&&(y+=` <span class="tree-attr-name">id</span>=<span class="tree-attr-value">"${P(b.id)}"</span>`),C.className&&(y+=` <span class="tree-attr-name">class</span>=<span class="tree-attr-value">"${P(Ne(C.className,30))}"</span>`),y+='<span class="tree-tag">&gt;</span>',I.innerHTML=y,M.appendChild(I),C.id!=null){const k=document.createElement("span");k.className="tree-nodeid",k.textContent=`_${C.id}`,M.appendChild(k)}if(At(M,r),u&&g.addEventListener("click",k=>{k.stopPropagation(),m.classList.toggle("expanded"),g.textContent=m.classList.contains("expanded")?"▼":"▶"}),m.appendChild(M),u){const k=document.createElement("div");k.className="tree-children";for(const x of d)Jt(k,x,E+1,E<2);m.appendChild(k)}o.appendChild(m)}function At(o,r){if(r.diffType==="unchanged")return;const E=document.createElement("span");E.className=`diff-marker ${r.diffType}`,r.diffType==="added"?E.textContent="+ADD":r.diffType==="removed"?E.textContent="-DEL":r.diffType==="changed"&&(E.textContent=`~${(r.changes??[]).join(",")}`),o.appendChild(E)}function wt(){if(J){const N=J.schedulerStats;let v='<div class="perf-section-title">Imported Session (read-only)</div>';for(const[F,R]of Object.entries(N))v+=`<div class="perf-row"><span class="perf-label">${P(String(F))}</span><span class="perf-value">${P(String(R))}</span></div>`;v+=`<div class="perf-row"><span class="perf-label">Exported At</span><span class="perf-value">${P(J.exportedAt)}</span></div>`,v+=`<div class="perf-row"><span class="perf-label">Mutations</span><span class="perf-value">${J.mutationLog.length}</span></div>`,v+=`<div class="perf-row"><span class="perf-label">Warnings</span><span class="perf-value">${J.warningLog.length}</span></div>`,v+=`<div class="perf-row"><span class="perf-label">Events</span><span class="perf-value">${J.eventLog.length}</span></div>`,v+=`<div class="perf-row"><span class="perf-label">Sync Reads</span><span class="perf-value">${J.syncReadLog.length}</span></div>`,_.innerHTML=v;return}const o=be();if(!o){_.innerHTML='<div class="perf-row"><span class="perf-label">Devtools API not available.</span></div>';return}const r=o.scheduler.stats(),E=r.pending;at.push(E),at.length>qt&&at.shift();let l="";l+='<div class="perf-section-title">Scheduler<button class="flush-btn" id="flush-btn">⏩ Flush</button></div>';let $="";E>1e3?$="red":E>100?$="yellow":$="green",l+=`<div class="perf-row"><span class="perf-label">Pending</span><span class="perf-value ${$}">${E}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Frame ID</span><span class="perf-value">${r.frameId}</span></div>`;const W=r.lastFrameTimeMs>16?"red":r.lastFrameTimeMs>12?"yellow":"green";l+=`<div class="perf-row"><span class="perf-label">Frame Time</span><span class="perf-value ${W}">${r.lastFrameTimeMs.toFixed(1)}ms</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Frame Actions</span><span class="perf-value">${r.lastFrameActions}</span></div>`;const C=r.isRunning?"green":"yellow";l+=`<div class="perf-row"><span class="perf-label">Running</span><span class="perf-value ${C}">${r.isRunning?"Yes":"No"}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Last Tick</span><span class="perf-value">${r.lastTickTime>0?`${r.lastTickTime.toFixed(0)}ms`:"N/A"}</span></div>`;const m=r.workerToMainLatencyMs;m>0&&(ze.push(m),ze.length>Ut&&ze.shift());const M=lt(m);l+=`<div class="perf-row"><span class="perf-label">Worker→Main</span><span class="perf-value ${M}">${m>0?`${m.toFixed(1)}ms`:"N/A"}</span></div>`;const d=r.enqueueToApplyMs,u=lt(d);if(l+=`<div class="perf-row"><span class="perf-label">Enqueue→Apply</span><span class="perf-value ${u}">${d>0?`${d.toFixed(1)}ms`:"N/A"}</span></div>`,ze.length>0){const N=on(ze);l+=`<div class="perf-row"><span class="perf-label">Latency P50</span><span class="perf-value ${lt(N.p50)}">${N.p50.toFixed(1)}ms</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Latency P95</span><span class="perf-value ${lt(N.p95)}">${N.p95.toFixed(1)}ms</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Latency P99</span><span class="perf-value ${lt(N.p99)}">${N.p99.toFixed(1)}ms</span></div>`}ze.length>1&&(l+=`<div class="perf-row"><span class="perf-label">Latency (${Ut})</span><span class="perf-sparkline">${cn(ze)}</span></div>`);const g=r.droppedFrameCount,T=g>0?"red":"green";l+=`<div class="perf-row"><span class="perf-label">Dropped Frames</span><span class="perf-value ${T}">${g}</span></div>`,at.length>1&&(l+=`<div class="perf-row"><span class="perf-label">Queue (${qt}f)</span><span class="sparkline-with-threshold"><span class="perf-sparkline">${cn(at)}</span><span class="sparkline-threshold"></span></span></div>`);const I=o.apps();l+=`<div class="perf-row"><span class="perf-label">Apps</span><span class="perf-value">${I.length}</span></div>`;const y=o.getAllAppsData();for(const N of I){const v=y[N];if(!(v!=null&&v.workerStats))continue;const F=v.workerStats;l+=`<div class="perf-section-title">Worker: ${P(N)}</div>`,l+=`<div class="perf-row"><span class="perf-label">Mutations Added</span><span class="perf-value">${F.added}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Mutations Coalesced</span><span class="perf-value">${F.coalesced}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Mutations Flushed</span><span class="perf-value">${F.flushed}</span></div>`;const R=F.added>0?(F.coalesced/F.added*100).toFixed(1):"0.0",Y=Number.parseFloat(R)>50?"green":Number.parseFloat(R)>20?"yellow":"";l+=`<div class="perf-row"><span class="perf-label">Coalescing Ratio</span><span class="perf-value ${Y}">${R}%</span></div>`}if(o.debugStats){const N=o.debugStats();l+='<div class="perf-section-title">Main Thread Stats</div>';const v=[["mutationsAdded","Mutations Added"],["mutationsCoalesced","Mutations Coalesced"],["mutationsFlushed","Mutations Flushed"],["mutationsApplied","Mutations Applied"],["eventsForwarded","Events Forwarded"],["eventsDispatched","Events Dispatched"],["syncReadRequests","Sync Read Requests"],["syncReadTimeouts","Sync Read Timeouts"]];for(const[F,R]of v){const Y=N[F]??0,j=F==="syncReadTimeouts"&&Y>0?"red":"";l+=`<div class="perf-row"><span class="perf-label">${P(R)}</span><span class="perf-value ${j}">${Y}</span></div>`}}const b=o.scheduler.frameLog();if(b.length>0){l+='<div class="frame-section-title">Frames</div>';const N=16;for(const v of b){const F=Math.min(v.totalMs/N*100,100),R=v.totalMs/N;let Y;R>1?Y="red":R>.5?Y="yellow":Y="green";const j=v.totalMs>N?" !":"";if(l+=`<div class="frame-bar-row" data-frame-id="${v.frameId}">`,l+=`<span class="frame-label">#${v.frameId}</span>`,l+=`<span class="frame-bar-track"><span class="frame-bar-fill ${Y}" style="width:${F.toFixed(1)}%"></span></span>`,l+=`<span class="frame-info">${v.totalMs.toFixed(1)}ms / ${N}ms (${v.actionCount})${j}</span>`,l+="</div>",Nt===v.frameId){l+='<div class="frame-detail">';const X=[...v.timingBreakdown.entries()].sort((de,Q)=>Q[1]-de[1]);for(const[de,Q]of X)l+=`<div class="frame-detail-row"><span class="frame-detail-action">${P(de)}</span><span class="frame-detail-time">${Q.toFixed(2)}ms</span></div>`;l+="</div>"}}}for(const N of I){const v=y[N];if(!(v!=null&&v.perTypeCoalesced))continue;const F=v.perTypeCoalesced,R=Object.keys(F);if(R.length!==0){l+=`<div class="perf-section-title">Coalescing: ${P(N)}</div>`;for(const Y of R){const j=F[Y],X=j.added>0?(j.coalesced/j.added*100).toFixed(0):"0";l+='<div class="coalesce-row">',l+=`<span class="coalesce-action">${P(Y)}</span>`,l+=`<span class="coalesce-detail">${j.added} added, ${j.coalesced} coalesced</span>`,l+=`<span class="coalesce-pct">(${X}%)</span>`,l+="</div>"}}}if(o.getWorkerPerfEntries){const N=o.getWorkerPerfEntries(),v=Object.keys(N);for(const F of v){const R=N[F];if(!R||R.length===0)continue;l+=`<div class="perf-section-title">Worker CPU: ${P(F)}</div>`;const Y=R.reduce((ee,me)=>ee+me.duration,0),j=Math.max(...R.map(ee=>ee.duration)),X=R.filter(ee=>ee.name.includes(":event:")),de=R.filter(ee=>ee.name.includes(":flush:")),Q=X.reduce((ee,me)=>ee+me.duration,0),pe=de.reduce((ee,me)=>ee+me.duration,0);l+=`<div class="worker-util"><span class="worker-util-label">Total worker time: </span><span class="worker-util-value">${Y.toFixed(1)}ms</span></div>`,l+=`<div class="worker-util"><span class="worker-util-label">Event handlers: </span><span class="worker-util-value">${Q.toFixed(1)}ms (${X.length} calls)</span></div>`,l+=`<div class="worker-util"><span class="worker-util-label">Flush/coalesce: </span><span class="worker-util-value">${pe.toFixed(1)}ms (${de.length} calls)</span></div>`;const xe=R.slice().sort((ee,me)=>me.duration-ee.duration).slice(0,10);for(const ee of xe){const me=j>0?Math.max(ee.duration/j*100,2):0,rt=ee.name.replace("async-dom:","");l+='<div class="worker-perf-bar">',l+=`<span class="worker-perf-name" title="${P(ee.name)}">${P(rt)}</span>`,l+=`<span class="worker-perf-track"><span class="worker-perf-fill" style="width:${me.toFixed(1)}%"></span></span>`,l+=`<span class="worker-perf-duration">${ee.duration.toFixed(2)}ms</span>`,l+="</div>"}}}if(b.length>0){const N=b.filter(v=>v.perApp&&v.perApp.size>0);if(N.length>0){l+='<div class="perf-section-title">Multi-App Interleaving</div>';const v=new Set;for(const j of N)if(j.perApp)for(const X of j.perApp.keys())v.add(X);const F=new Map,R=["#569cd6","#4ec9b0","#d7ba7d","#c586c0","#f44747","#ce9178","#6a9955"];let Y=0;for(const j of v)F.set(j,R[Y%R.length]),Y++;l+='<div class="multiapp-legend">';for(const[j,X]of F)l+=`<span class="multiapp-legend-item"><span class="multiapp-legend-dot" style="background:${X}"></span>${P(j)}</span>`;l+="</div>";for(const j of N.slice(-20)){const X=j.perApp;let de=0,Q=0;for(const[,pe]of X)de+=pe.mutations,Q+=pe.deferred;if(de!==0){l+='<div class="multiapp-frame">',l+=`<span class="multiapp-frame-label">#${j.frameId}</span>`,l+='<span class="multiapp-stacked-bar">';for(const[pe,xe]of X){const ee=xe.mutations/de*100,me=F.get(pe)??"#569cd6";l+=`<span class="multiapp-segment" style="width:${ee.toFixed(1)}%;background:${me}" title="${P(pe)}: ${xe.mutations} muts, ${xe.deferred} deferred"></span>`}l+="</span>",l+=`<span class="multiapp-info">${de} muts${Q>0?` (${Q} def)`:""}</span>`,l+="</div>"}}}}if(Ee.length>0){const N=new Map;for(const R of Ee)N.set(R.action,(N.get(R.action)??0)+1);const v=[...N.entries()].sort((R,Y)=>Y[1]-R[1]),F=v.length>0?v[0][1]:1;l+='<div class="perf-section-title">Mutation Types</div>';for(const[R,Y]of v){const j=Math.max(Y/F*100,2);l+='<div class="chart-bar-row">',l+=`<span class="chart-bar-label">${P(R)}</span>`,l+=`<span class="chart-bar-track"><span class="chart-bar-fill" style="width:${j.toFixed(1)}%"></span></span>`,l+=`<span class="chart-bar-value">${Y}</span>`,l+="</div>"}}if(Se.length>0){const N=Se.length,v=Se.filter(Q=>Q.result==="timeout").length,F=N>0?(v/N*100).toFixed(1):"0.0",R=Se.map(Q=>Q.latencyMs),Y=on(R);l+='<div class="perf-section-title">Sync Reads</div>',l+=`<div class="perf-row"><span class="perf-label">Total</span><span class="perf-value">${N}</span></div>`;const j=v>0?"red":"green";l+=`<div class="perf-row"><span class="perf-label">Timeout Rate</span><span class="perf-value ${j}">${F}% (${v})</span></div>`,l+=`<div class="perf-row"><span class="perf-label">P95 Latency</span><span class="perf-value ${rn(Y.p95)}">${Y.p95.toFixed(1)}ms</span></div>`,l+='<div class="heatmap-container">';const X=Se.slice(-100),de=["boundingRect","computedStyle","nodeProperty","windowProperty"];for(let Q=0;Q<X.length;Q++){const pe=X[Q],xe=rn(pe.latencyMs),ee=de[pe.queryType]??`query:${pe.queryType}`;l+=`<div class="heatmap-block ${xe}" data-sync-read-idx="${Q}" title="${pe.latencyMs.toFixed(1)}ms ${ee} node=${pe.nodeId} ${pe.result}"></div>`}l+="</div>"}if(o.getTransportStats){const N=o.getTransportStats(),v=Object.keys(N);if(v.length>0){l+='<div class="perf-section-title">Transport</div>';for(const F of v){const R=N[F];if(!R)continue;v.length>1&&(l+=`<div class="perf-row"><span class="perf-label" style="font-weight:600">App: ${P(F)}</span><span class="perf-value"></span></div>`),l+=`<div class="perf-row"><span class="perf-label">Messages Sent</span><span class="perf-value">${R.messageCount}</span></div>`,l+=`<div class="perf-row"><span class="perf-label">Total Bytes</span><span class="perf-value">${Et(R.totalBytes)}</span></div>`;const Y=R.messageCount>0?Math.round(R.totalBytes/R.messageCount):0;l+=`<div class="perf-row"><span class="perf-label">Avg Message Size</span><span class="perf-value">${Et(Y)}</span></div>`;const j=R.largestMessageBytes>102400?"red":"",X=R.largestMessageBytes>102400?'<span class="transport-warn">[!] exceeds 100KB</span>':"";l+=`<div class="perf-row"><span class="perf-label">Largest Message</span><span class="perf-value ${j}">${Et(R.largestMessageBytes)}${X}</span></div>`;const de=R.lastMessageBytes>102400?"red":"",Q=R.lastMessageBytes>102400?'<span class="transport-warn">[!] exceeds 100KB</span>':"";l+=`<div class="perf-row"><span class="perf-label">Last Message</span><span class="perf-value ${de}">${Et(R.lastMessageBytes)}${Q}</span></div>`}}}_.innerHTML=l;const k=_.querySelectorAll(".heatmap-block"),x=["boundingRect","computedStyle","nodeProperty","windowProperty"];for(const N of k)N.addEventListener("click",v=>{const F=v.currentTarget,R=F.querySelector(".heatmap-tooltip");if(R){R.remove();return}for(const pe of k){const xe=pe.querySelector(".heatmap-tooltip");xe&&xe.remove()}const Y=Number(F.dataset.syncReadIdx),X=Se.slice(-100)[Y];if(!X)return;const de=x[X.queryType]??`query:${X.queryType}`,Q=document.createElement("div");Q.className="heatmap-tooltip",Q.textContent=`${de} node=${X.nodeId} ${X.latencyMs.toFixed(1)}ms ${X.result}`,F.appendChild(Q)});const O=_.querySelector("#flush-btn");O&&O.addEventListener("click",N=>{N.stopPropagation();const v=be();v&&v.scheduler.flush(),wt()});const ce=_.querySelectorAll(".frame-bar-row");for(const N of ce)N.addEventListener("click",()=>{const v=Number(N.dataset.frameId);Nt=Nt===v?null:v,wt()})}function Qt(){const o=be();if(!(o!=null&&o.getCausalityTracker)){Oe.innerHTML='<div class="graph-empty">Causality tracker not available.</div>';return}const E=o.getCausalityTracker().buildGraph();if(E.roots.length===0){Oe.innerHTML='<div class="graph-empty">No causality data yet. Interact with the app to generate event-to-mutation data.</div>';return}Oe.innerHTML="";const l=document.createElement("div");l.className="graph-container";for(const $ of E.roots)Zt(l,E,$,0);Oe.appendChild(l)}function Zt(o,r,E,l){const $=r.nodes.get(E);if(!$)return;const W=document.createElement("div");W.style.paddingLeft=`${l*16}px`;const C=document.createElement("div");let m="graph-node";$.type==="event"?m+=" event-node":$.type==="batch"?m+=" batch-node":m+=" dom-node",C.className=m;const M=document.createElement("span");M.className=`graph-node-type ${$.type}`,M.textContent=$.type==="event"?"EVT":$.type==="batch"?"BAT":"NOD",C.appendChild(M);const d=document.createElement("span");if(d.className="graph-node-label",d.textContent=$.label,C.appendChild(d),W.appendChild(C),o.appendChild(W),$.children.length>0){const u=document.createElement("div");u.className="graph-children";for(const g of $.children)Zt(u,r,g,l+1);o.appendChild(u)}}let Ct=0,$t=!1;Z.addEventListener("click",()=>{Ye=!Ye,Z.textContent=Ye?"Resume":"Pause",Z.classList.toggle("active",Ye)}),le.addEventListener("click",()=>{gt=!gt,le.classList.toggle("active",gt)});function An(o){switch(o){case"createNode":case"createComment":case"appendChild":case"bodyAppendChild":case"headAppendChild":case"insertBefore":return"color-green";case"setAttribute":case"removeAttribute":case"setStyle":case"setClassName":case"setProperty":case"setTextContent":case"setHTML":case"insertAdjacentHTML":return"color-blue";case"removeNode":case"removeChild":return"color-red";default:return""}}function en(o){const r=document.createElement("div"),E=An(o.action);r.className=`log-entry${E?` ${E}`:""}`;const l=document.createElement("span");l.className="log-time",l.textContent=Ze(o.timestamp),r.appendChild(l);const $=document.createElement("span");$.className="log-action",$.textContent=o.action,r.appendChild($);const W=document.createElement("span");W.className="log-detail";const C="id"in o.mutation?o.mutation.id:void 0;let m=C!=null?`#${C}`:"";const M=o.mutation;return M.tag&&(m+=` tag=${M.tag}`),M.name&&o.action!=="addEventListener"&&(m+=` ${M.name}`),M.property&&(m+=` ${M.property}`),W.textContent=m,r.appendChild(W),r}function Ce(){const o=J?J.mutationLog:Ee,r=J?J.eventLog:et,E=J?J.syncReadLog:Se,l=A?A.entries.slice(0,A.currentIndex):o;if(we.textContent=String(l.length),l.length===0){if(Ct!==0||A){const d=A?"Replay position: 0. Step forward to see mutations.":"No mutations captured yet.";fe.innerHTML=`<div class="log-empty">${d}</div>`,Ct=0}return}const $=ie.value.toLowerCase().trim(),W=document.createDocumentFragment(),C=[];let m=null;for(const d of l){if($&&!d.action.toLowerCase().includes($))continue;const u=d.batchUid;u!=null&&m!==null&&m.batchUid===u?m.entries.push(d):(m={batchUid:u,entries:[d]},C.push(m))}for(const d of C){if(d.batchUid==null||d.entries.length<=1){for(const k of d.entries)W.appendChild(en(k));continue}const u=document.createElement("div");u.className="batch-group";const g=document.createElement("div");g.className="batch-header";const T=document.createElement("span");T.className="batch-toggle",T.textContent="▶",g.appendChild(T);const I=document.createElement("span");I.className="batch-uid",I.textContent=`Batch #${d.batchUid}`,g.appendChild(I);const y=document.createElement("span");y.className="batch-count",y.textContent=`— ${d.entries.length} mutations`,g.appendChild(y),g.addEventListener("click",()=>{u.classList.toggle("expanded"),T.textContent=u.classList.contains("expanded")?"▼":"▶"}),u.appendChild(g);const b=document.createElement("div");b.className="batch-entries";for(const k of d.entries)b.appendChild(en(k));u.appendChild(b),W.appendChild(u)}if(fe.innerHTML="",fe.appendChild(W),A&&A.currentIndex>0){const d=fe.querySelectorAll(".log-entry"),u=A.currentIndex-1;u<d.length&&(d[u].classList.add("replay-highlight"),d[u].scrollIntoView({block:"nearest"}))}const M=be();if(M){const d=M.getEventTraces();if(d.length>0){const u=document.createElement("div");u.className="event-trace-section";const g=document.createElement("div");g.className="event-trace-title",g.textContent=`Event Round-Trips (${d.length})`,u.appendChild(g);const T=d.slice(-20);let I=1;for(const y of T){const b=y.serializeMs+(y.transportMs??0)+(y.dispatchMs??0);b>I&&(I=b)}for(const y of T){const b=y.serializeMs,k=y.transportMs??0,x=y.dispatchMs??0,O=y.mutationCount??Ee.filter(me=>me.timestamp>=y.timestamp&&me.timestamp<=y.timestamp+100).length,ce=b+k+x,N=120/(I||1),v=document.createElement("div");v.className="event-timeline";const F=document.createElement("span");F.className="event-trace-type",F.style.cssText="width:60px;flex-shrink:0;font-size:10px;overflow:hidden;text-overflow:ellipsis;",F.textContent=`[${y.eventType}]`,v.appendChild(F);const R=document.createElement("span");R.className="event-phase serialize",R.style.width=`${Math.max(b*N,4)}px`,R.title=`serialize: ${b.toFixed(1)}ms`,v.appendChild(R);const Y=document.createElement("span");Y.className="event-phase-label",Y.textContent=`${b.toFixed(1)}ms`,v.appendChild(Y);const j=document.createElement("span");j.className="event-phase-label",j.textContent="→",v.appendChild(j);const X=document.createElement("span");X.className="event-phase transport",X.style.width=`${Math.max(k*N,4)}px`,X.title=`transport: ${k.toFixed(1)}ms`,v.appendChild(X);const de=document.createElement("span");de.className="event-phase-label",de.textContent=`${k.toFixed(1)}ms`,v.appendChild(de);const Q=document.createElement("span");Q.className="event-phase-label",Q.textContent="→",v.appendChild(Q);const pe=document.createElement("span");pe.className="event-phase dispatch",pe.style.width=`${Math.max(x*N,4)}px`,pe.title=`dispatch: ${x.toFixed(1)}ms`,v.appendChild(pe);const xe=document.createElement("span");if(xe.className="event-phase-label",xe.textContent=`${x.toFixed(1)}ms`,v.appendChild(xe),O>0){const me=document.createElement("span");me.className="event-phase-label",me.textContent="→",v.appendChild(me);const rt=document.createElement("span");rt.className="event-mutation-count",rt.textContent=`${O} mut${O!==1?"s":""}`,v.appendChild(rt)}const ee=document.createElement("div");ee.className="event-timeline-detail",ee.innerHTML=`<div><strong>${P(y.eventType)}</strong> total: ${ce.toFixed(1)}ms</div><div>main:serialize ${b.toFixed(2)}ms</div><div>transport ${k.toFixed(2)}ms</div><div>worker:dispatch ${x.toFixed(2)}ms</div><div>mutations generated: ${O}</div>`,v.addEventListener("click",()=>{ee.classList.toggle("visible")}),u.appendChild(v),u.appendChild(ee)}fe.appendChild(u)}}if(r.length>0){const d=document.createElement("div");d.className="log-section-title",d.textContent=`Events (${r.length})`,fe.appendChild(d);const u=r.slice(-50);for(const g of u){const T=document.createElement("div");T.className="log-entry event-entry";const I=document.createElement("span");I.className="log-time",I.textContent=Ze(g.timestamp),T.appendChild(I);const y=document.createElement("span");y.className="log-action",y.textContent=g.eventType,T.appendChild(y);const b=document.createElement("span");b.className="log-detail",b.textContent=`${g.phase}→${g.phase==="serialize"?"dispatch":"done"} targetId=${g.targetId??"?"}`,T.appendChild(b),fe.appendChild(T)}}if(E.length>0){const d=document.createElement("div");d.className="log-section-title",d.textContent=`Sync Reads (${E.length})`,fe.appendChild(d);const u=E.slice(-50);for(const g of u){const T=document.createElement("div");T.className="log-entry syncread-entry";const I=document.createElement("span");I.className="log-time",I.textContent=Ze(g.timestamp),T.appendChild(I);const y=document.createElement("span");y.className="log-action";const b=["boundingRect","computedStyle","nodeProperty","windowProperty"];y.textContent=b[g.queryType]??`query:${g.queryType}`,T.appendChild(y);const k=document.createElement("span");k.className="log-detail",k.textContent=`node=${g.nodeId} ${g.latencyMs.toFixed(1)}ms ${g.result}`,T.appendChild(k),fe.appendChild(T)}}{const d=document.createElement("div");d.className="coalesced-toggle";const u=document.createElement("input");u.type="checkbox",u.id="coalesced-toggle-cb",u.checked=$t;const g=document.createElement("label");if(g.htmlFor="coalesced-toggle-cb",g.textContent="Show coalesced",d.appendChild(u),d.appendChild(g),fe.appendChild(d),u.addEventListener("change",()=>{$t=u.checked,Ce()}),$t){const T=M?M.getAllAppsData():{};let I=[];for(const b of Object.values(T))b!=null&&b.coalescedLog&&Array.isArray(b.coalescedLog)&&(I=I.concat(b.coalescedLog));I.sort((b,k)=>k.timestamp-b.timestamp);const y=I.slice(0,50);if(y.length>0){const b=document.createElement("div");b.className="log-section-title",b.textContent=`Coalesced (${y.length} of ${I.length})`,fe.appendChild(b);for(const k of y){const x=document.createElement("div");x.className="coalesced-entry";const O=document.createElement("span");O.className="log-time",O.textContent=Ze(k.timestamp),x.appendChild(O);const ce=document.createElement("span");ce.className="log-action",ce.textContent=k.action,x.appendChild(ce);const N=document.createElement("span");N.className="log-detail",N.textContent=k.key,x.appendChild(N),fe.appendChild(x)}}}}gt&&!A&&(fe.scrollTop=fe.scrollHeight),Ct=l.length}ie.addEventListener("input",Ce),V.addEventListener("click",()=>{Ee.length=0,Ct=0,fe.innerHTML='<div class="log-empty">No mutations captured yet.</div>',we.textContent="0"});let _e=0,ot="grouped";const It=new Set;Ge.addEventListener("click",()=>{ot=ot==="grouped"?"chronological":"grouped",Ge.textContent=ot==="grouped"?"Chronological":"Grouped",Ge.classList.toggle("active",ot==="chronological"),_e=-1,Je()}),Ve.addEventListener("input",()=>{_e=-1,Je()});function tn(o){const r=document.createElement("div");r.className="warn-entry";const E=document.createElement("span");E.className="warn-time",E.textContent=Ze(o.timestamp),r.appendChild(E);const l=document.createElement("span");l.className=`warn-code ${o.code}`,l.textContent=o.code,r.appendChild(l);const $=document.createElement("span");$.className="warn-msg";const W=o.message.split(`
`)[0],C=o.message.includes(`
`);if($.textContent=W,r.appendChild($),C){r.style.cursor="pointer";const m=document.createElement("pre");m.className="warn-stack",m.textContent=o.message,m.style.display="none",r.appendChild(m),r.addEventListener("click",()=>{m.style.display=m.style.display==="none"?"block":"none"})}return r}function Je(){const o=J?J.warningLog:Ke;if(o.length===0){_e!==0&&(ke.innerHTML='<div class="warn-empty">No warnings captured yet.</div>',_e=0);return}if(o.length===_e)return;const r=Ve.value.toLowerCase().trim(),E=document.createDocumentFragment(),l=r?o.filter(C=>C.code.toLowerCase().includes(r)||C.message.toLowerCase().includes(r)):o,$=l.filter(C=>!It.has(C.code)),W=l.length-$.length;if(ot==="chronological")for(const C of $)E.appendChild(tn(C));else{const C=new Map;for(const m of $){let M=C.get(m.code);M||(M=[],C.set(m.code,M)),M.push(m)}for(const[m,M]of C){const d=document.createElement("div");d.className="warn-group";const u=document.createElement("div");u.className="warn-group-header";const g=document.createElement("span");g.className="warn-group-toggle",g.textContent="▶",u.appendChild(g);const T=document.createElement("span");T.className=`warn-group-code warn-code ${m}`,T.textContent=m,u.appendChild(T);const I=document.createElement("span");I.className="warn-group-count",I.textContent=`(${M.length})`,u.appendChild(I);const y=document.createElement("button");y.className="warn-suppress-btn",y.textContent="Suppress",y.addEventListener("click",x=>{x.stopPropagation(),It.add(m),_e=-1,Je()}),u.appendChild(y),u.addEventListener("click",()=>{d.classList.toggle("expanded"),g.textContent=d.classList.contains("expanded")?"▼":"▶"}),d.appendChild(u);const b=_n[m];if(b){const x=document.createElement("div");x.className="warn-group-doc";const O=document.createElement("div");O.className="warn-group-desc",O.textContent=b.description,x.appendChild(O);const ce=document.createElement("div");ce.className="warn-group-suggestion",ce.textContent=`Suggestion: ${b.suggestion}`,x.appendChild(ce),d.appendChild(x)}const k=document.createElement("div");k.className="warn-group-entries";for(const x of M)k.appendChild(tn(x));d.appendChild(k),E.appendChild(d)}}if(ke.innerHTML="",ke.appendChild(E),W>0){const C=document.createElement("div");C.className="warn-suppressed-note",C.textContent=`${W} suppressed warning${W!==1?"s":""} hidden`;const m=document.createElement("button");m.className="warn-suppress-btn",m.textContent="Show all",m.style.marginLeft="8px",m.addEventListener("click",()=>{It.clear(),_e=-1,Je()}),C.appendChild(m),ke.appendChild(C)}ke.scrollTop=ke.scrollHeight,_e=o.length}Be.addEventListener("click",()=>{Ke.length=0,Le=0,_e=0,ke.innerHTML='<div class="warn-empty">No warnings captured yet.</div>',Rt()});function Rt(){Le>0&&f!=="Warnings"?(p.textContent=String(Le>99?"99+":Le),p.style.display="inline-block"):p.style.display="none",h.textContent=Le>0?`async-dom (${Le>99?"99+":Le}) ▲`:"async-dom ▲"}ct=Rt;function $n(){_t(),ut=setInterval(()=>{if(f==="Tree"){const o=be();o&&o.refreshDebugData(),setTimeout(xt,250)}},2e3),ft=setInterval(()=>{if(f==="Performance"){const o=be();o&&o.refreshDebugData(),setTimeout(wt,250)}},1e3),mt=setInterval(()=>{f==="Log"&&Ce(),f==="Warnings"&&Je(),f==="Graph"&&Qt()},500),Xe()}function _t(){ut&&(clearInterval(ut),ut=null),ft&&(clearInterval(ft),ft=null),mt&&(clearInterval(mt),mt=null)}return{destroy(){_t(),ve&&(clearInterval(ve),ve=null),clearInterval(kn),ct=null,Ee.length=0,Ke.length=0,et.length=0,Se.length=0,Le=0,n.remove()}}}const vs=100;class xs{constructor(e,t){c(this,"listeners",new Map);c(this,"eventConfig",new Map);c(this,"nodeCache");c(this,"transport",null);c(this,"appId");c(this,"eventTraces",[]);c(this,"_onTimingResult",null);this.appId=e,this.nodeCache=t??new Wt}set onTimingResult(e){this._onTimingResult=e}setTransport(e){this.transport=e}setNodeCache(e){this.nodeCache=e}configureEvent(e,t,s){if(this.eventConfig.set(`${e}_${t}`,s),s.preventDefault&&dn(t)){for(const[a,i]of this.listeners.entries())if(i.nodeId===e&&i.eventName===t){i.controller.abort(),this.attach(e,t,a);break}}}attach(e,t,s){const a=this.nodeCache.get(e);if(!a)return;const i=new AbortController;this.listeners.set(s,{controller:i,nodeId:e,eventName:t});const h=this._isPassiveForListener(s,t);a.addEventListener(t,w=>{var se;const H=`${e}_${t}`,K=this.eventConfig.get(H);K!=null&&K.preventDefault&&w.preventDefault();const q=performance.now(),D=Cs(w,this.nodeCache),te=performance.now()-q,z=Date.now();this.eventTraces.push({eventType:w.type,listenerId:s,serializeMs:te,timestamp:performance.now(),sentAt:z}),this.eventTraces.length>vs&&this.eventTraces.shift(),(se=this.transport)==null||se.send({type:"event",appId:this.appId,listenerId:s,event:D})},{signal:i.signal,passive:h})}detach(e){const t=this.listeners.get(e);t&&(t.controller.abort(),this.listeners.delete(e))}detachByNodeId(e){for(const[t,s]of this.listeners)s.nodeId===e&&(s.controller.abort(),this.listeners.delete(t))}getEventTraces(){return this.eventTraces.slice()}updateTraceWithWorkerTiming(e,t,s){var i;const a=Date.now();for(let h=this.eventTraces.length-1;h>=0;h--){const w=this.eventTraces[h];if(w.listenerId===e&&w.transportMs===void 0){w.transportMs=Math.max(0,a-w.sentAt-t),w.dispatchMs=t,w.mutationCount=s,(i=this._onTimingResult)==null||i.call(this,w);return}}}getListenersForNode(e){const t=[];for(const[s,a]of this.listeners)a.nodeId===e&&t.push({listenerId:s,eventName:a.eventName});return t}detachAll(){for(const e of this.listeners.values())e.controller.abort();this.listeners.clear()}_isPassiveForListener(e,t){for(const[s,a]of this.eventConfig.entries())if(s.endsWith(`_${t}`)&&a.preventDefault)return!1;return dn(t)}}const ws=new Set(["scroll","touchstart","touchmove","wheel","mousewheel"]);function dn(n){return ws.has(n)}function St(n,e){if(!n)return null;if(e){const t=e.getId(n);if(t!=null)return String(t)}return n.id??null}function Cs(n,e){var h;const t=((h=n.composedPath)==null?void 0:h.call(n)[0])??n.target,s={type:n.type,target:St(t,e),currentTarget:St(n.currentTarget,e),bubbles:n.bubbles,cancelable:n.cancelable,composed:n.composed,eventPhase:n.eventPhase,isTrusted:n.isTrusted,timeStamp:n.timeStamp};n.type==="click"&&(n.target instanceof HTMLAnchorElement||n.currentTarget instanceof HTMLAnchorElement)&&n.preventDefault(),n instanceof MouseEvent&&(s.clientX=n.clientX,s.clientY=n.clientY,s.pageX=n.pageX,s.pageY=n.pageY,s.screenX=n.screenX,s.screenY=n.screenY,s.offsetX=n.offsetX,s.offsetY=n.offsetY,s.button=n.button,s.buttons=n.buttons,s.altKey=n.altKey,s.ctrlKey=n.ctrlKey,s.metaKey=n.metaKey,s.shiftKey=n.shiftKey,s.relatedTarget=St(n.relatedTarget,e),s.detail=n.detail),n instanceof KeyboardEvent&&(s.key=n.key,s.code=n.code,s.keyCode=n.keyCode,s.altKey=n.altKey,s.ctrlKey=n.ctrlKey,s.metaKey=n.metaKey,s.shiftKey=n.shiftKey),n instanceof InputEvent&&(s.data=n.data??void 0,s.inputType=n.inputType);const a=n.target;a instanceof HTMLInputElement?(s.value=a.value,s.checked=a.checked):a instanceof HTMLTextAreaElement?s.value=a.value:a instanceof HTMLSelectElement&&(s.value=a.value,s.selectedIndex=a.selectedIndex);const i=n.target;return i instanceof HTMLMediaElement&&(s.currentTime=i.currentTime,s.duration=Number.isFinite(i.duration)?i.duration:0,s.paused=i.paused,s.ended=i.ended,s.readyState=i.readyState),n instanceof FocusEvent&&(s.relatedTarget=n.relatedTarget instanceof Element?St(n.relatedTarget,e):null),n instanceof WheelEvent&&Object.assign(s,{deltaX:n.deltaX,deltaY:n.deltaY,deltaZ:n.deltaZ,deltaMode:n.deltaMode}),s}const Es=new Set(["script","iframe","object","embed","form","base","meta","link","style"]),Ss=/^on/i,Ts=new Set(["href","src","data","action","formaction","xlink:href"]),Ns=new Set(["srcdoc","formaction"]);function ks(n){const e=n.trim().toLowerCase();return/^\s*javascript\s*:/i.test(e)||/^\s*vbscript\s*:/i.test(e)||/^\s*data\s*:\s*text\/html/i.test(e)}function pn(n){const s=new DOMParser().parseFromString(`<body>${n}</body>`,"text/html").body;return yn(s),s.innerHTML}function yn(n){const e=Array.from(n.childNodes);for(const t of e)if(t.nodeType===Node.ELEMENT_NODE){const s=t,a=s.tagName.toLowerCase();if(Es.has(a)){s.remove();continue}const i=[];for(let h=0;h<s.attributes.length;h++){const w=s.attributes[h],H=w.name.toLowerCase();(Ss.test(H)||Ns.has(H)||Ts.has(H)&&ks(w.value))&&i.push(w.name)}for(const h of i)s.removeAttribute(h);yn(s)}}const Ms=new Set(["srcdoc","formaction"]),Ls=new Set(["href","src","data","action","xlink:href"]);function As(n){const e=n.trim().toLowerCase();return/^\s*javascript\s*:/i.test(e)||/^\s*vbscript\s*:/i.test(e)||/^\s*data\s*:\s*text\/html/i.test(e)}const $s={allowHeadAppend:!1,allowBodyAppend:!1,allowNavigation:!0,allowScroll:!0,allowUnsafeHTML:!1},Is=new Set(["value","checked","disabled","selectedIndex","indeterminate","readOnly","required","placeholder","type","name","scrollTop","scrollLeft","textContent","nodeValue","src","currentTime","volume","muted","controls","loop","poster","autoplay","tabIndex","title","lang","dir","hidden","draggable","contentEditable","htmlFor","open","selected","multiple","width","height","colSpan","rowSpan"]),Rs=new Set(["play","pause","load","focus","blur","click","scrollIntoView","requestFullscreen","select","setCustomValidity","reportValidity","showModal","close"]),_s=new Set(["svg","path","circle","ellipse","line","polygon","polyline","rect","g","defs","use","text","tspan","clippath","mask","image","symbol","marker","lineargradient","radialgradient","stop","filter","fegaussianblur","feoffset","feblend","foreignobject"]),Ds="http://www.w3.org/2000/svg";class Bs{constructor(e,t,s){c(this,"nodeCache");c(this,"permissions");c(this,"root");c(this,"_additionalAllowedProperties");c(this,"onNodeRemoved",null);c(this,"_onWarning",null);c(this,"_onMutation",null);c(this,"highlightEnabled",!1);this.nodeCache=e??new Wt,this.permissions={...$s,...t},this._additionalAllowedProperties=new Set(this.permissions.additionalAllowedProperties??[]),this.root=s??{body:document.body,head:document.head,html:document.documentElement}}setDebugHooks(e){this._onWarning=e.onWarning??null,this._onMutation=e.onMutation??null}enableHighlightUpdates(e){this.highlightEnabled=e}highlightNode(e){if(!this.highlightEnabled)return;const t=this.nodeCache.get(e);if(!(t!=null&&t.style))return;const s=t.style.outline;t.style.outline="2px solid rgba(78, 201, 176, 0.8)",setTimeout(()=>{t.style.outline=s},300)}apply(e,t){switch(this._onMutation&&this._onMutation({side:"main",action:e.action,mutation:e,timestamp:performance.now(),batchUid:t}),e.action){case"createNode":this.createNode(e.id,e.tag,e.textContent);break;case"createComment":this.createComment(e.id,e.textContent);break;case"appendChild":this.appendChild(e.id,e.childId);break;case"removeNode":this.removeNode(e.id);break;case"removeChild":this.removeChild(e.id,e.childId);break;case"insertBefore":this.insertBefore(e.id,e.newId,e.refId);break;case"setAttribute":this.setAttribute(e.id,e.name,e.value);break;case"removeAttribute":this.removeAttribute(e.id,e.name);break;case"setStyle":this.setStyle(e.id,e.property,e.value);break;case"setProperty":this.setProperty(e.id,e.property,e.value);break;case"setTextContent":this.setTextContent(e.id,e.textContent);break;case"setClassName":this.setClassName(e.id,e.name);break;case"setHTML":this.setHTML(e.id,e.html);break;case"addEventListener":break;case"configureEvent":break;case"removeEventListener":break;case"headAppendChild":this.headAppendChild(e.id);break;case"bodyAppendChild":this.bodyAppendChild(e.id);break;case"pushState":this.permissions.allowNavigation&&window.history.pushState(e.state,e.title,e.url);break;case"replaceState":this.permissions.allowNavigation&&window.history.replaceState(e.state,e.title,e.url);break;case"scrollTo":this.permissions.allowScroll&&window.scrollTo(e.x,e.y);break;case"insertAdjacentHTML":this.insertAdjacentHTML(e.id,e.position,e.html);break;case"callMethod":this.callMethod(e.id,e.method,e.args);break}if(this.highlightEnabled&&"id"in e){const s=e.action;(s==="appendChild"||s==="setAttribute"||s==="setStyle"||s==="setClassName"||s==="setTextContent"||s==="setHTML")&&this.highlightNode(e.id)}}getNode(e){return this.nodeCache.get(e)}clear(){this.nodeCache.clear()}getRoot(){return this.root}createNode(e,t,s){if(this.nodeCache.has(e))return;if(t==="HTML"){this.nodeCache.set(e,this.root.html);return}if(t==="BODY"){this.nodeCache.set(e,this.root.body);return}if(t==="HEAD"){this.nodeCache.set(e,this.root.head);return}if(t.charAt(0)==="#"){const h=document.createTextNode(s??"");this.nodeCache.set(e,h);return}const a=t.toLowerCase();let i;_s.has(a)?i=document.createElementNS(Ds,a):i=document.createElement(t),s&&(i.textContent=s),this.nodeCache.set(e,i)}createComment(e,t){if(this.nodeCache.has(e))return;const s=document.createComment(t);this.nodeCache.set(e,s)}appendChild(e,t){var i;const s=this.nodeCache.get(e),a=this.nodeCache.get(t);if(!s||!a){const h=`appendChild: ${s?"child":"parent"} not found`;console.warn(`[async-dom] ${h}`,{parentId:e,childId:t}),(i=this._onWarning)==null||i.call(this,{code:Qe.MISSING_NODE,message:h,context:{parentId:e,childId:t},timestamp:performance.now()});return}s.appendChild(a)}removeNode(e){var s;const t=this.nodeCache.get(e);if(!t){const a="removeNode: node not found";console.warn(`[async-dom] ${a}`,{id:e}),(s=this._onWarning)==null||s.call(this,{code:Qe.MISSING_NODE,message:a,context:{id:e},timestamp:performance.now()});return}this._cleanupSubtreeListeners(t,e),this.nodeCache.delete(e),t.parentNode?t.parentNode.removeChild(t):"remove"in t&&typeof t.remove=="function"&&t.remove()}removeChild(e,t){const s=this.nodeCache.get(e),a=this.nodeCache.get(t);s&&(a!=null&&a.parentNode)&&(this._cleanupSubtreeListeners(a,t),this.nodeCache.delete(t),a.parentNode.removeChild(a))}insertBefore(e,t,s){var w;if(e===t)return;const a=this.nodeCache.get(e),i=this.nodeCache.get(t);if(!a||!i){const H=`insertBefore: ${a?"newNode":"parent"} not found`;console.warn(`[async-dom] ${H}`,{parentId:e,newId:t,refId:s}),(w=this._onWarning)==null||w.call(this,{code:Qe.MISSING_NODE,message:H,context:{parentId:e,newId:t,refId:s},timestamp:performance.now()});return}const h=s?this.nodeCache.get(s):null;a.insertBefore(i,h??null)}setAttribute(e,t,s){var h;const a=this.nodeCache.get(e);if(!a||!("setAttribute"in a)){const w="setAttribute: node not found";console.warn(`[async-dom] ${w}`,{id:e,name:t,value:s}),(h=this._onWarning)==null||h.call(this,{code:Qe.MISSING_NODE,message:w,context:{id:e,name:t,value:s},timestamp:performance.now()});return}const i=t.toLowerCase();/^on/i.test(i)||Ms.has(i)||Ls.has(i)&&As(s)||(t==="id"&&this.nodeCache.set(s,a),a.setAttribute(t,s))}removeAttribute(e,t){const s=this.nodeCache.get(e);!s||!("removeAttribute"in s)||s.removeAttribute(t)}setStyle(e,t,s){var i;const a=this.nodeCache.get(e);if(!(a!=null&&a.style)){const h="setStyle: node not found";console.warn(`[async-dom] ${h}`,{id:e,property:t,value:s}),(i=this._onWarning)==null||i.call(this,{code:Qe.MISSING_NODE,message:h,context:{id:e,property:t,value:s},timestamp:performance.now()});return}a.style.setProperty(t,s)}setProperty(e,t,s){var i;const a=this.nodeCache.get(e);if(a){if(!Is.has(t)&&!this._additionalAllowedProperties.has(t)){(i=this._onWarning)==null||i.call(this,{code:Qe.BLOCKED_PROPERTY,message:`setProperty: property "${t}" is not in the allowed list`,context:{id:e,property:t},timestamp:performance.now()});return}a[t]=s}}setTextContent(e,t){const s=this.nodeCache.get(e);s&&(s.textContent=t)}setClassName(e,t){const s=this.nodeCache.get(e);s&&(s.className=t)}setHTML(e,t){const s=this.nodeCache.get(e);s&&(s.innerHTML=this.permissions.allowUnsafeHTML?t:pn(t))}insertAdjacentHTML(e,t,s){const a=this.nodeCache.get(e);!a||!("insertAdjacentHTML"in a)||a.insertAdjacentHTML(t,this.permissions.allowUnsafeHTML?s:pn(s))}headAppendChild(e){if(!this.permissions.allowHeadAppend)return;const t=this.nodeCache.get(e);t&&this.root.head.appendChild(t)}bodyAppendChild(e){if(!this.permissions.allowBodyAppend)return;const t=this.nodeCache.get(e);t&&this.root.body.appendChild(t)}callMethod(e,t,s){const a=this.nodeCache.get(e);if(!a)return;if(!Rs.has(t)){console.warn(`[async-dom] Blocked callMethod: "${t}" is not allowed`);return}const i=a[t];typeof i=="function"&&i.apply(a,s)}_cleanupSubtreeListeners(e,t){var a;(a=this.onNodeRemoved)==null||a.call(this,t);const s=e.childNodes;for(let i=0;i<s.length;i++){const h=s[i],w=this.nodeCache.getId(h);w&&(this._cleanupSubtreeListeners(h,w),this.nodeCache.delete(w))}}}const re={CreateNode:0,CreateComment:1,AppendChild:2,RemoveNode:3,RemoveChild:4,InsertBefore:5,SetAttribute:6,RemoveAttribute:7,SetStyle:8,SetProperty:9,SetTextContent:10,SetClassName:11,SetHTML:12,AddEventListener:13,HeadAppendChild:14,BodyAppendChild:15,PushState:16,ReplaceState:17,ScrollTo:18,InsertAdjacentHTML:19,ConfigureEvent:20,RemoveEventListener:21,CallMethod:22};class Os{constructor(e){c(this,"view");c(this,"offset",0);c(this,"strings");this.strings=e}readU8(){if(this.offset+1>this.view.byteLength)throw new Error("Binary decode: unexpected end of buffer");return this.view.getUint8(this.offset++)}readU16(){if(this.offset+2>this.view.byteLength)throw new Error("Binary decode: unexpected end of buffer");const e=this.view.getUint16(this.offset,!0);return this.offset+=2,e}readU32(){if(this.offset+4>this.view.byteLength)throw new Error("Binary decode: unexpected end of buffer");const e=this.view.getUint32(this.offset,!0);return this.offset+=4,e}readStr(){return this.strings.get(this.readU16())}readNodeId(){return this.readU32()}decode(e){this.view=new DataView(e),this.offset=0;const t=[];for(;this.offset<e.byteLength;){const s=this.readU8();t.push(this.decodeMutation(s))}return t}decodeMutation(e){switch(e){case re.CreateNode:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr();return{action:"createNode",id:t,tag:s,...a?{textContent:a}:{}}}case re.CreateComment:return{action:"createComment",id:this.readNodeId(),textContent:this.readStr()};case re.AppendChild:return{action:"appendChild",id:this.readNodeId(),childId:this.readNodeId()};case re.RemoveNode:return{action:"removeNode",id:this.readNodeId()};case re.RemoveChild:return{action:"removeChild",id:this.readNodeId(),childId:this.readNodeId()};case re.InsertBefore:{const t=this.readNodeId(),s=this.readNodeId(),a=this.readU32();return{action:"insertBefore",id:t,newId:s,refId:a===4294967295?null:a}}case re.SetAttribute:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr(),i=this.readU8()===1;return{action:"setAttribute",id:t,name:s,value:a,...i?{optional:i}:{}}}case re.RemoveAttribute:return{action:"removeAttribute",id:this.readNodeId(),name:this.readStr()};case re.SetStyle:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr(),i=this.readU8()===1;return{action:"setStyle",id:t,property:s,value:a,...i?{optional:i}:{}}}case re.SetProperty:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr();return{action:"setProperty",id:t,property:s,value:JSON.parse(a)}}case re.SetTextContent:return{action:"setTextContent",id:this.readNodeId(),textContent:this.readStr()};case re.SetClassName:return{action:"setClassName",id:this.readNodeId(),name:this.readStr()};case re.SetHTML:return{action:"setHTML",id:this.readNodeId(),html:this.readStr()};case re.AddEventListener:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr();return{action:"addEventListener",id:t,name:s,listenerId:a}}case re.HeadAppendChild:return{action:"headAppendChild",id:this.readNodeId()};case re.BodyAppendChild:return{action:"bodyAppendChild",id:this.readNodeId()};case re.PushState:{const t=JSON.parse(this.readStr()),s=this.readStr(),a=this.readStr();return{action:"pushState",state:t,title:s,url:a}}case re.ReplaceState:{const t=JSON.parse(this.readStr()),s=this.readStr(),a=this.readStr();return{action:"replaceState",state:t,title:s,url:a}}case re.ScrollTo:return{action:"scrollTo",x:this.readU32(),y:this.readU32()};case re.InsertAdjacentHTML:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr();return{action:"insertAdjacentHTML",id:t,position:s,html:a}}case re.ConfigureEvent:{const t=this.readNodeId(),s=this.readStr(),a=this.readU8()===1,i=this.readU8()===1;return{action:"configureEvent",id:t,name:s,preventDefault:a,...i?{passive:i}:{}}}case re.RemoveEventListener:return{action:"removeEventListener",id:this.readNodeId(),listenerId:this.readStr()};case re.CallMethod:{const t=this.readNodeId(),s=this.readStr(),a=this.readStr();return{action:"callMethod",id:t,method:s,args:JSON.parse(a)}}default:throw new Error(`Unknown mutation opcode: ${e}`)}}}class Fs{constructor(){c(this,"stringToIndex",new Map);c(this,"indexToString",[]);c(this,"pending",[])}store(e){const t=this.stringToIndex.get(e);if(t!==void 0)return t;const s=this.indexToString.length;return this.stringToIndex.set(e,s),this.indexToString.push(e),this.pending.push(e),s}get(e){return this.indexToString[e]??""}consumePending(){const e=this.pending;return this.pending=[],e}registerBulk(e){for(const t of e)if(!this.stringToIndex.has(t)){const s=this.indexToString.length;this.stringToIndex.set(t,s),this.indexToString.push(t)}}get size(){return this.indexToString.length}}const Ps=new TextEncoder,Hs=new TextDecoder;function zs(n){return n instanceof ArrayBuffer||typeof n=="object"&&n!==null&&"byteLength"in n&&"slice"in n&&typeof n.slice=="function"&&!ArrayBuffer.isView(n)}const Ws=2;function qs(n){return n.byteLength<1?!1:new DataView(n).getUint8(0)===Ws}function Us(n){const e=JSON.stringify(n),t=Ps.encode(e),s=new ArrayBuffer(t.byteLength);return new Uint8Array(s).set(t),s}function Ks(n){return JSON.parse(Hs.decode(n))}function Ys(n){return n.type==="mutation"}new TextEncoder;const hn=new TextDecoder;function js(n,e,t){const s=new DataView(n),a=new Uint8Array(n);let i=0;i+=1;const h=s.getUint32(i,!0);i+=4;const w=s.getUint16(i,!0);i+=2;const H=hn.decode(a.slice(i,i+w));i+=w;const K=s.getUint8(i++),D=["normal","high","low"][K]??"normal",te=s.getUint16(i,!0);i+=2;const z=[];for(let he=0;he<te;he++){const ye=s.getUint16(i,!0);i+=2,z.push(hn.decode(a.slice(i,i+ye))),i+=ye}e.registerBulk(z);const se=n.slice(i),ge=t.decode(se);return{type:"mutation",appId:H,uid:h,mutations:ge,...D!=="normal"?{priority:D}:{}}}class Vs{constructor(e){c(this,"handlers",[]);c(this,"_readyState","open");c(this,"strings",new Fs);c(this,"mutDecoder",new Os(this.strings));c(this,"_statsEnabled",!1);c(this,"_stats",{messageCount:0,totalBytes:0,largestMessageBytes:0,lastMessageBytes:0});c(this,"onError");c(this,"onClose");this.worker=e,e.onmessage=t=>{if(this.handlers.length===0)return;let s;zs(t.data)?qs(t.data)?s=js(t.data,this.strings,this.mutDecoder):s=Ks(t.data):s=t.data;for(const a of this.handlers)try{a(s)}catch(i){console.error("[async-dom] Handler error:",i)}},e.onerror=t=>{var a,i;const s=new Error(t.message??"Worker error");(a=this.onError)==null||a.call(this,s),this._readyState!=="closed"&&(this._readyState="closed",(i=this.onClose)==null||i.call(this))},e.onmessageerror=()=>{var s;const t=new Error("Worker message deserialization failed");(s=this.onError)==null||s.call(this,t)}}enableStats(e){this._statsEnabled=e}send(e){if(this._readyState==="open")if(Ys(e)){const t=Us(e);if(this._statsEnabled){const s=t.byteLength;this._stats.messageCount++,this._stats.totalBytes+=s,this._stats.lastMessageBytes=s,s>this._stats.largestMessageBytes&&(this._stats.largestMessageBytes=s)}this.worker.postMessage(t,[t])}else{if(this._statsEnabled){const t=JSON.stringify(e).length;this._stats.messageCount++,this._stats.totalBytes+=t,this._stats.lastMessageBytes=t,t>this._stats.largestMessageBytes&&(this._stats.largestMessageBytes=t)}this.worker.postMessage(e)}}onMessage(e){this.handlers.push(e)}close(){this._readyState="closed",this.worker.terminate()}get readyState(){return this._readyState}getStats(){return{...this._stats}}}class Gs{constructor(e){c(this,"handlers",[]);c(this,"_readyState","open");c(this,"_statsEnabled",!1);c(this,"_stats",{messageCount:0,totalBytes:0,largestMessageBytes:0,lastMessageBytes:0});c(this,"onError");c(this,"onClose");this.worker=e,e.onmessage=t=>{for(const s of this.handlers)try{s(t.data)}catch(a){console.error("[async-dom] Handler error:",a)}},e.onerror=t=>{var a,i;const s=new Error(t.message??"Worker error");(a=this.onError)==null||a.call(this,s),this._readyState!=="closed"&&(this._readyState="closed",(i=this.onClose)==null||i.call(this))},e.onmessageerror=()=>{var s;const t=new Error("Worker message deserialization failed");(s=this.onError)==null||s.call(this,t)}}enableStats(e){this._statsEnabled=e}send(e){if(this._readyState==="open"){if(this._statsEnabled){const t=JSON.stringify(e).length;this._stats.messageCount++,this._stats.totalBytes+=t,this._stats.lastMessageBytes=t,t>this._stats.largestMessageBytes&&(this._stats.largestMessageBytes=t)}this.worker.postMessage(e)}}onMessage(e){this.handlers.push(e)}close(){this._readyState="closed",this.worker.terminate()}get readyState(){return this._readyState}getStats(){return{...this._stats}}}class Xs{constructor(e,t){c(this,"ws",null);c(this,"handlers",[]);c(this,"_readyState","connecting");c(this,"_stats",{messageCount:0,totalBytes:0,largestMessageBytes:0,lastMessageBytes:0});c(this,"onError");c(this,"onClose");c(this,"attempt",0);c(this,"messageQueue",[]);c(this,"closed",!1);c(this,"reconnectTimer",null);c(this,"maxRetries");c(this,"baseDelay");c(this,"maxDelay");this.url=e,this.maxRetries=(t==null?void 0:t.maxRetries)??Yn,this.baseDelay=(t==null?void 0:t.baseDelay)??jn,this.maxDelay=(t==null?void 0:t.maxDelay)??Vn,this.connect()}connect(){this.closed||(this._readyState="connecting",this.ws=new WebSocket(this.url),this.ws.onopen=()=>{this._readyState="open",this.attempt=0,this.flushQueue()},this.ws.onmessage=e=>{try{const t=JSON.parse(e.data);for(const s of this.handlers)try{s(t)}catch(a){console.error("[async-dom] Handler error:",a)}}catch{console.error("[async-dom] Failed to parse WebSocket message")}},this.ws.onclose=()=>{this.closed||this.scheduleReconnect()},this.ws.onerror=()=>{var e;(e=this.ws)==null||e.close()})}scheduleReconnect(){if(this.attempt>=this.maxRetries){this._readyState="closed",console.error(`[async-dom] WebSocket reconnection failed after ${this.maxRetries} attempts`);return}const e=Math.min(this.baseDelay*2**this.attempt+Math.random()*1e3,this.maxDelay);this.attempt++,this.reconnectTimer=setTimeout(()=>{this.connect()},e)}flushQueue(){for(;this.messageQueue.length>0;){const e=this.messageQueue.shift();if(!e)break;this.sendRaw(e)}}sendRaw(e){var a;const t=JSON.stringify(e),s=t.length;this._stats.messageCount++,this._stats.totalBytes+=s,this._stats.lastMessageBytes=s,s>this._stats.largestMessageBytes&&(this._stats.largestMessageBytes=s),(a=this.ws)==null||a.send(t)}send(e){var t;this._readyState==="open"&&((t=this.ws)==null?void 0:t.readyState)===WebSocket.OPEN?this.sendRaw(e):this._readyState!=="closed"&&this.messageQueue.push(e)}onMessage(e){this.handlers.push(e)}close(){var e;this.closed=!0,this._readyState="closed",this.reconnectTimer!==null&&clearTimeout(this.reconnectTimer),(e=this.ws)==null||e.close(),this.messageQueue.length=0}get readyState(){return this._readyState}getStats(){return{...this._stats}}}class Js{constructor(){c(this,"threads",new Map);c(this,"messageHandlers",[])}createWorkerThread(e){const t=un(),s=typeof __ASYNC_DOM_BINARY__<"u"&&__ASYNC_DOM_BINARY__,a=e.transport??(s?new Vs(e.worker):new Gs(e.worker));return a.onMessage(i=>{this.notifyHandlers(t,i)}),this.threads.set(t,{transport:a,appId:t}),t}createWebSocketThread(e){const t=un(),s=new Xs(e.url,e.options);return s.onMessage(a=>{this.notifyHandlers(t,a)}),this.threads.set(t,{transport:s,appId:t}),t}sendToThread(e,t){const s=this.threads.get(e);s&&s.transport.send(t)}broadcast(e){for(const t of this.threads.values())t.transport.send(e)}destroyThread(e){const t=this.threads.get(e);t&&(t.transport.close(),this.threads.delete(e))}destroyAll(){for(const e of[...this.threads.keys()])this.destroyThread(e)}onMessage(e){this.messageHandlers.push(e)}getTransport(e){var t;return((t=this.threads.get(e))==null?void 0:t.transport)??null}notifyHandlers(e,t){for(const s of this.messageHandlers)s(e,t)}}function un(){return Math.random().toString(36).slice(2,7)}const Qs=new Set(["innerWidth","innerHeight","outerWidth","outerHeight","devicePixelRatio","screen.width","screen.height","screen.availWidth","screen.availHeight","screen.colorDepth","screen.pixelDepth","screen.orientation.type","scrollX","scrollY","visualViewport.width","visualViewport.height","navigator.language","navigator.languages","navigator.userAgent","navigator.hardwareConcurrency","document.visibilityState","document.hidden","localStorage.getItem","localStorage.setItem","localStorage.removeItem","localStorage.length","localStorage.key","sessionStorage.getItem","sessionStorage.setItem","sessionStorage.removeItem","sessionStorage.length","sessionStorage.key"]);function ea(n){var Fe,Ae;const e=new Xn(n.scheduler),t=new Js,s=new Map,a=new Map,i=Fn(n.debug),h=new Bn,w=new ts,H=new Map,K=200,q=new On,D=new Map;let te=null,z=null;const se=new Map;function ge(p){t.sendToThread(p,{type:"debugQuery",query:"tree"}),t.sendToThread(p,{type:"debugQuery",query:"stats"}),t.sendToThread(p,{type:"debugQuery",query:"perTypeCoalesced"}),t.sendToThread(p,{type:"debugQuery",query:"coalescedLog"})}function he(p,f){try{const L=JSON.parse(f.data),S=L.nodeId,_=L.property;switch(f.queryType){case Me.BoundingRect:{const B=p.getNode(S);if(!B||!("getBoundingClientRect"in B))return null;const G=B.getBoundingClientRect();return{top:G.top,left:G.left,right:G.right,bottom:G.bottom,width:G.width,height:G.height,x:G.x,y:G.y}}case Me.ComputedStyle:{const B=p.getNode(S);if(!B)return{};const G=window.getComputedStyle(B),ie={},we=["display","position","top","left","right","bottom","width","height","color","background-color","font-size","font-family","font-weight","line-height","text-align","visibility","opacity","overflow","z-index","float","clear","cursor","pointer-events","box-sizing","flex-direction","justify-content","align-items","flex-wrap","flex-grow","flex-shrink","flex-basis","grid-template-columns","grid-template-rows","gap","transform","border-radius","box-shadow","text-decoration","white-space","word-break","overflow-wrap","min-width","max-width","min-height","max-height","margin-top","margin-right","margin-bottom","margin-left","padding-top","padding-right","padding-bottom","padding-left"];for(const Z of we){const le=G.getPropertyValue(Z);le&&(ie[Z]=le)}return ie}case Me.NodeProperty:{const B=p.getNode(S);return!B||!_?null:B[_]??null}case Me.WindowProperty:{if(!_||!Qs.has(_))return null;if(_.startsWith("localStorage.")||_.startsWith("sessionStorage.")){const ie=_.indexOf("."),we=_.slice(0,ie),Z=_.slice(ie+1),le=we==="localStorage"?window.localStorage:window.sessionStorage,V=L.args;return Z==="getItem"&&(V==null?void 0:V[0])!=null?le.getItem(V[0]):Z==="setItem"&&(V==null?void 0:V[0])!=null&&V[1]!==void 0?(le.setItem(V[0],V[1]),null):Z==="removeItem"&&(V==null?void 0:V[0])!=null?(le.removeItem(V[0]),null):Z==="length"?le.length:Z==="key"&&(V==null?void 0:V[0])!==void 0?le.key(Number(V[0])):null}const B=_.split(".");let G=window;for(const ie of B){if(G==null)return null;G=G[ie]}return G??null}default:return null}}catch{return null}}e.setApplier((p,f,L)=>{if(p.action==="addEventListener"){const _=s.get(f);_&&(_.attach(p.id,p.name,p.listenerId),h.eventsForwarded++);return}if(p.action==="configureEvent"){const _=s.get(f);_&&_.configureEvent(p.id,p.name,{preventDefault:p.preventDefault,passive:p.passive});return}if(p.action==="removeEventListener"){const _=s.get(f);_&&_.detach(p.listenerId);return}let S;f===z&&te?S=te:(S=D.get(f),S&&(te=S,z=f)),S&&(S.apply(p,L),h.mutationsApplied++)}),t.onMessage((p,f)=>{if(mn(f)){if(f.sentAt!=null&&e.recordWorkerLatency(f.sentAt),e.enqueue(f.mutations,p,f.priority??"normal",f.uid),f.causalEvent){const L=f.mutations.filter(S=>"id"in S).map(S=>S.id);w.recordBatch(f.uid,L,f.mutations.length,f.causalEvent),q.registerBatchEvent(f.uid,f.causalEvent)}return}if(it(f)&&f.type==="eventTimingResult"){const L=s.get(p);L&&L.updateTraceWithWorkerTiming(f.listenerId,f.dispatchMs,f.mutationCount);return}if(it(f)&&f.type==="perfEntries"){const L=f;let S=H.get(p);S||(S=[],H.set(p,S)),S.push(...L.entries),S.length>K&&S.splice(0,S.length-K);return}if(it(f)&&f.type==="debugResult"){const L=f,S=se.get(p)??{tree:null,workerStats:null,perTypeCoalesced:null,coalescedLog:null};L.query==="tree"&&(S.tree=L.result),L.query==="stats"&&(S.workerStats=L.result),L.query==="perTypeCoalesced"&&(S.perTypeCoalesced=L.result),L.query==="coalescedLog"&&(S.coalescedLog=L.result),se.set(p,S)}}),n.worker&&ye(n.worker,n.target);function ye(p,f,L,S,_){var Pe,He;const B=t.createWorkerThread({worker:p,transport:S}),G=new Wt;let ie=null;f&&(ie=typeof f=="string"?document.querySelector(f):f);let we;if(ie&&L){const ne=L===!0?{mode:"open"}:L,U=ie.attachShadow(ne);we={body:U,head:U,html:ie}}else ie&&(we={body:ie,head:document.head,html:ie});const Z=new Bs(G,void 0,we);(i.onWarning||i.onMutation)&&Z.setDebugHooks({onWarning:i.onWarning,onMutation:i.onMutation});const le=Z.getRoot();G.set(Pn,le.body),G.set(Hn,le.head),G.set(zn,le.html),G.set(fn,document),Z.onNodeRemoved=ne=>{const U=s.get(B);U&&U.detachByNodeId(ne)},D.set(B,Z);const V=new xs(B,G),ae=t.getTransport(B);if(ae){(Pe=n.debug)!=null&&Pe.exposeDevtools&&((He=ae.enableStats)==null||He.call(ae,!0)),V.setTransport(ae);const ne=()=>{V.detachAll(),s.delete(B),Z.clear(),D.delete(B),z===B&&(te=null,z=null);const U=a.get(B);U&&(U.stopPolling(),a.delete(B)),e.setAppCount(D.size)};console.debug("[async-dom] App",B,"transport ready, readyState:",ae.readyState),ae.onError=U=>{console.error("[async-dom] App",B,"worker error:",U.message),_==null||_({message:U.message,stack:U.stack,name:U.name},B)},ae.onClose=()=>{console.warn("[async-dom] App",B,"worker disconnected, cleaning up"),ne()},ae.onMessage(U=>{if(it(U)&&U.type==="error"&&"error"in U){const $e=U;_==null||_($e.error,B);const oe=$e.error,De=oe.filename?` at ${oe.filename}:${oe.lineno??"?"}:${oe.colno??"?"}`:"";ln({code:oe.isUnhandledRejection?"WORKER_UNHANDLED_REJECTION":"WORKER_ERROR",message:`[${String(B)}] ${oe.name??"Error"}: ${oe.message}${De}${oe.stack?`
${oe.stack}`:""}`,context:{appId:String(B),error:oe},timestamp:performance.now()})}})}i.onEvent&&(V.onTimingResult=ne=>{var U;(U=i.onEvent)==null||U.call(i,{side:"main",phase:"dispatch",eventType:ne.eventType,listenerId:ne.listenerId,targetId:null,timestamp:ne.timestamp,transportMs:ne.transportMs,dispatchMs:ne.dispatchMs,mutationCount:ne.mutationCount})}),s.set(B,V),e.setAppCount(D.size);let ue;if(typeof SharedArrayBuffer<"u")try{ue=new SharedArrayBuffer(65536);const ne=new Zn(ue);ne.startPolling(U=>he(Z,U)),a.set(B,ne)}catch{ue=void 0}return ae&&ae.onMessage(ne=>{if(it(ne)&&ne.type==="query"){const U=ne,oe={boundingRect:Me.BoundingRect,computedStyle:Me.ComputedStyle,nodeProperty:Me.NodeProperty,windowProperty:Me.WindowProperty}[U.query]??Me.NodeProperty,De=he(Z,{queryType:oe,data:JSON.stringify({nodeId:U.nodeId,property:U.property})});ae.send({type:"queryResult",uid:U.uid,result:De})}}),t.sendToThread(B,{type:"init",appId:B,location:{hash:window.location.hash,href:window.location.href,port:window.location.port,host:window.location.host,origin:window.location.origin,hostname:window.location.hostname,pathname:window.location.pathname,protocol:window.location.protocol,search:window.location.search,state:window.history.state},sharedBuffer:ue}),B}let Te=null;if((Fe=n.debug)!=null&&Fe.exposeDevtools&&(globalThis.__ASYNC_DOM_DEVTOOLS__={scheduler:{pending:()=>e.pendingCount,stats:()=>e.getStats(),frameLog:()=>e.getFrameLog(),flush:()=>e.flush()},getEventTraces:()=>{const p=[];for(const f of s.values())p.push(...f.getEventTraces());return p.sort((f,L)=>f.timestamp-L.timestamp),p},enableHighlightUpdates:p=>{for(const f of D.values())f.enableHighlightUpdates(p)},findRealNode:p=>{for(const f of D.values()){const L=f.getNode(p);if(L)return L}return null},getListenersForNode:p=>{const f=[];for(const L of s.values())f.push(...L.getListenersForNode(p));return f},debugStats:()=>h.snapshot(),apps:()=>[...D.keys()],renderers:()=>{const p={};for(const[f,L]of D)p[String(f)]={root:L.getRoot()};return p},refreshDebugData:()=>{for(const p of D.keys())ge(p)},getAppData:p=>se.get(p),getTransportStats:()=>{var f;const p={};for(const L of D.keys()){const S=t.getTransport(L);p[String(L)]=((f=S==null?void 0:S.getStats)==null?void 0:f.call(S))??null}return p},getAllAppsData:()=>{const p={};for(const[f,L]of se)p[String(f)]=L;return p},replayMutation:(p,f)=>{const L=D.get(f);L&&L.apply(p)},clearAndReapply:(p,f)=>{for(const L of D.values()){const S=L.getRoot();S&&(S.body.textContent="",S.head.textContent="");const _=Math.min(f,p.length);for(let B=0;B<_;B++)L.apply(p[B].mutation,p[B].batchUid);break}},getCausalityTracker:()=>w,getWorkerPerfEntries:()=>{const p={};for(const[f,L]of H)p[String(f)]=L.slice();return p},getMutationCorrelation:()=>q},typeof document<"u"&&(Te=bs())),(Ae=n.debug)!=null&&Ae.exposeDevtools){const p=i.onMutation,f=i.onWarning,L=i.onEvent,S=i.onSyncRead;i.onMutation=_=>{p==null||p(_),fs(_),q.indexMutation(_)},i.onWarning=_=>{f==null||f(_),ln(_)},i.onEvent=_=>{L==null||L(_),ms(_)},i.onSyncRead=_=>{S==null||S(_),gs(_)}}console.debug("[async-dom] Initialized",{apps:n.worker?1:0,debug:!!n.debug,scheduler:n.scheduler??"default"});const je=()=>{t.broadcast({type:"visibility",state:document.visibilityState})};return document.addEventListener("visibilitychange",je),{start(){e.start()},stop(){e.stop()},destroy(){e.stop(),e.flush();for(const p of D.values())p.clear();D.clear(),te=null,z=null;for(const p of s.values())p.detachAll();for(const p of a.values())p.stopPolling();a.clear(),document.removeEventListener("visibilitychange",je),t.destroyAll(),Te&&(Te.destroy(),Te=null)},addApp(p){return ye(p.worker,p.mountPoint,p.shadow,p.transport,p.onError)},removeApp(p){const f=s.get(p);f&&(f.detachAll(),s.delete(p));const L=D.get(p);L&&(L.clear(),D.delete(p)),z===p&&(te=null,z=null);const S=a.get(p);S&&(S.stopPolling(),a.delete(p)),t.destroyThread(p),e.setAppCount(D.size)}}}export{Bs as DomRenderer,xs as EventBridge,Xn as FrameScheduler,Js as ThreadManager,ea as createAsyncDom};
