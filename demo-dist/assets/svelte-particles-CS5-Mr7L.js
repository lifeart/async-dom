import"./modulepreload-polyfill-B5Qt9EMX.js";import{_ as k,r as v}from"./resolve-debug-u5wjmbkC.js";function E(t,o){let r=null,x=!1;if(typeof window>"u")return{destroy(){}};const c=o.worker,f=typeof c=="string"?new Worker(new URL(c,import.meta.url),{type:"module"}):c();return k(async()=>{const{createAsyncDom:p}=await import("./index-C6fVA7KL.js");return{createAsyncDom:p}},[]).then(({createAsyncDom:p})=>{var h;if(x){f.terminate();return}r=p({target:t,worker:f,scheduler:o.scheduler,debug:v(o.debug)}),r.start(),(h=o.onReady)==null||h.call(o,r)}),{destroy(){x=!0,r==null||r.destroy(),r=null}}}const e=document.getElementById("app");e.style.fontFamily="system-ui, -apple-system, sans-serif";e.style.background="#0d1117";e.style.color="#e6edf3";e.style.minHeight="100vh";e.style.padding="20px";const i=document.createElement("div");i.style.textAlign="center";i.style.marginBottom="20px";i.innerHTML=`
  <h1 style="font-size: 1.8rem; font-weight: 700;">
    <span style="color: #ff3e00;">Svelte</span> + async-dom: Particle Life
  </h1>
  <p style="color: #8b949e; margin-top: 6px;">
    Particle simulation with emergent behaviors — computed &amp; rendered entirely in a Web Worker. This UI stays responsive.
  </p>
`;e.appendChild(i);const d=document.createElement("div");d.style.cssText="display: flex; justify-content: center; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;";const a=document.createElement("div");a.style.cssText="padding: 8px 16px; border-radius: 8px; background: hsl(0, 70%, 20%); border: 1px solid hsl(0, 70%, 40%); font-size: 0.85rem;";const n=document.createElement("div");n.style.cssText="padding: 8px 16px; border-radius: 8px; background: #3a1a1a; border: 1px solid #da3633; font-size: 0.85rem;";n.textContent="⏳ Loading worker...";d.appendChild(a);d.appendChild(n);e.appendChild(d);const y=document.createElement("p");y.style.cssText="text-align: center; color: #8b949e; font-size: 0.85rem; margin-bottom: 16px;";y.innerHTML="Colored particles follow attraction/repulsion rules creating emergent life-like patterns. The worker manages <strong>300+</strong> particles and renders a <strong>60×60</strong> grid (3,600 cells).";e.appendChild(y);const l=document.createElement("div");l.style.cssText="max-width: 720px; margin: 0 auto; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; background: #161b22;";const b=document.createElement("div"),s=document.createElement("div");s.style.cssText="text-align: center; padding: 60px 20px; color: #8b949e;";s.innerHTML=`
  <div style="font-size: 2rem; margin-bottom: 12px; animation: pulse 1.5s ease-in-out infinite;">✨</div>
  <p>Initializing Particle Life worker...</p>
  <style>@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }</style>
`;l.appendChild(s);l.appendChild(b);e.appendChild(l);const u=document.createElement("div");u.style.cssText="max-width: 720px; margin: 16px auto 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;";u.innerHTML=`
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
`;e.appendChild(u);let m=0,g=0;function w(){m=(m+.5)%360;const t=Math.round(m);a.style.background=`hsl(${t}, 70%, 20%)`,a.style.borderColor=`hsl(${t}, 70%, 40%)`,a.textContent=`🎨 Main thread alive — hue: ${t}°`,g=requestAnimationFrame(w)}g=requestAnimationFrame(w);const C=t=>{s.parentNode&&s.remove(),n.style.background="#1a3a1a",n.style.borderColor="#2ea043",n.textContent="✅ Worker ready",console.log("async-dom Svelte action instance ready:",t)},T=t=>{console.error("async-dom error:",t)},L=E(b,{worker:()=>new Worker(new URL("/assets/worker-B6iOwDM8.js",import.meta.url),{type:"module"}),onReady:C,onError:T});window.addEventListener("unload",()=>{cancelAnimationFrame(g),L.destroy()});
