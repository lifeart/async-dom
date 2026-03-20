import"./modulepreload-polyfill-B5Qt9EMX.js";import{_ as w,r as k}from"./resolve-debug-u5wjmbkC.js";function v(t,o){let r=null,x=!1;if(typeof window>"u")return{destroy(){}};const c=o.worker,f=typeof c=="string"?new Worker(new URL(c,import.meta.url),{type:"module"}):c();return w(async()=>{const{createAsyncDom:p}=await import("./index-COhMOYYP.js");return{createAsyncDom:p}},[]).then(({createAsyncDom:p})=>{var h;if(x){f.terminate();return}r=p({target:t,worker:f,scheduler:o.scheduler,debug:k(o.debug)}),r.start(),(h=o.onReady)==null||h.call(o,r)}),{destroy(){x=!0,r==null||r.destroy(),r=null}}}const e=document.getElementById("app");e.style.fontFamily="system-ui, -apple-system, sans-serif";e.style.background="#0d1117";e.style.color="#e6edf3";e.style.minHeight="100vh";e.style.padding="20px";const i=document.createElement("div");i.style.textAlign="center";i.style.marginBottom="20px";i.innerHTML=`
  <h1 style="font-size: 1.8rem; font-weight: 700;">
    <span style="color: #ff3e00;">Svelte</span> + async-dom: Particle Life
  </h1>
  <p style="color: #8b949e; margin-top: 6px;">
    Particle simulation with emergent behaviors — computed &amp; rendered entirely in a Web Worker. This UI stays responsive.
  </p>
`;e.appendChild(i);const d=document.createElement("div");d.style.cssText="display: flex; justify-content: center; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;";const s=document.createElement("div");s.style.cssText="padding: 8px 16px; border-radius: 8px; background: hsl(0, 70%, 20%); border: 1px solid hsl(0, 70%, 40%); font-size: 0.85rem;";const n=document.createElement("div");n.style.cssText="padding: 8px 16px; border-radius: 8px; background: #3a1a1a; border: 1px solid #da3633; font-size: 0.85rem;";n.textContent="⏳ Loading worker...";d.appendChild(s);d.appendChild(n);e.appendChild(d);const y=document.createElement("p");y.style.cssText="text-align: center; color: #8b949e; font-size: 0.85rem; margin-bottom: 16px;";y.innerHTML="Colored particles follow attraction/repulsion rules creating emergent life-like patterns. The worker manages <strong>300+</strong> particles and renders a <strong>60×60</strong> grid (3,600 cells).";e.appendChild(y);const l=document.createElement("div");l.style.cssText="max-width: 720px; margin: 0 auto; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; background: #161b22;";const a=document.createElement("div");a.style.cssText="text-align: center; padding: 60px 20px; color: #8b949e;";a.innerHTML=`
  <div style="font-size: 2rem; margin-bottom: 12px; animation: pulse 1.5s ease-in-out infinite;">✨</div>
  <p>Initializing Particle Life worker...</p>
  <style>@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }</style>
`;l.appendChild(a);e.appendChild(l);const u=document.createElement("div");u.style.cssText="max-width: 720px; margin: 16px auto 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;";u.innerHTML=`
  <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px;">
    <h3 style="font-size: 0.8rem; color: #ff3e00; margin-bottom: 6px;">API: use:asyncDom Action</h3>
    <code style="font-size: 0.7rem; color: #8b949e; display: block; white-space: pre-wrap; line-height: 1.5;">&lt;div use:asyncDom={{
  worker: "./worker.ts",
  onReady: (inst) =&gt; ...,
  onError: (err) =&gt; ...
}} /&gt;</code>
  </div>
  <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px;">
    <h3 style="font-size: 0.8rem; color: #ff3e00; margin-bottom: 6px;">API: Direct Action Call</h3>
    <code style="font-size: 0.7rem; color: #8b949e; display: block; white-space: pre-wrap; line-height: 1.5;">import { asyncDom } from
  "async-dom/svelte";

const { destroy } = asyncDom(
  node, {
    worker: () =&gt; new Worker(...),
    onReady: (inst) =&gt; ...
  });</code>
  </div>
`;e.appendChild(u);let m=0,g=0;function b(){m=(m+.5)%360;const t=Math.round(m);s.style.background=`hsl(${t}, 70%, 20%)`,s.style.borderColor=`hsl(${t}, 70%, 40%)`,s.textContent=`🎨 Main thread alive — hue: ${t}°`,g=requestAnimationFrame(b)}g=requestAnimationFrame(b);const E=t=>{a.parentNode&&a.remove(),n.style.background="#1a3a1a",n.style.borderColor="#2ea043",n.textContent="✅ Worker ready",console.log("async-dom Svelte action instance ready:",t)},C=t=>{console.error("async-dom error:",t)},T=v(l,{worker:()=>new Worker(new URL("/assets/worker-a4lXtOsj.js",import.meta.url),{type:"module"}),onReady:E,onError:C});window.addEventListener("unload",()=>{cancelAnimationFrame(g),T.destroy()});
