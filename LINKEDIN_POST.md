# LinkedIn Post — async-dom Launch

## Posting Strategy

- **When:** Tuesday or Thursday, 7-9 AM in your audience's timezone
- **Attach:** Architecture graphic or demo screenshot (1200x628). Carousel/image = 3x engagement over plain text.
- **No links in body** — they cut reach 30%. Post demo/GitHub link in a comment 1-2 min after.
- **Reply to every comment** in the first 60-90 minutes. This is when the algorithm decides whether to amplify.
- **End with a question** — comments are the strongest signal.
- **Pin** to your Featured section.

---

## OPTION A — The Strategic Framing (Recommended for CTO/CEO audience)

```
Most web architecture has a fundamental design flaw:
everything runs on a single thread, and everything is visible.

Your framework, your business logic, your data structures —
all on the main thread, all in the DOM, all accessible
to scrapers, bots, and anyone with a browser.

We rethought this from first principles.

What if application logic ran in a completely separate context?
What if the DOM was just a projection — a rendering target,
not a source of truth?

That's what async-dom does.

Your entire UI framework — React, Vue, Svelte — runs in a Web Worker.
The main thread receives only rendering instructions
and applies them with a frame-budgeted scheduler.

The implications are significant:

→ Content never exists in the HTML payload
→ Business logic is architecturally isolated from the page
→ Zero framework runtime competes with user interaction
→ Multiple frameworks coexist on one page without iframes
→ The same app can stream to any device via WebSocket

We built a live demo with React, Vue, and Svelte
running simultaneously — three separate workers,
three shadow DOMs, zero framework code on the main thread.

Open source. MIT licensed.

What architectural constraints would this remove for your team?

#WebArchitecture #FrontendEngineering #OpenSource
```

**First comment (post 1-2 min after):**
```
Live demo — three frameworks running simultaneously in Web Workers:
https://lifeart.github.io/async-dom/

Source and documentation:
https://github.com/lifeart/async-dom

We're looking for design partners exploring worker-based rendering,
content protection, or micro-frontend isolation.
```

---

## OPTION B — The Industry Problem (AI scraping angle)

```
Cloudflare blocked 416 billion AI bot requests in one year.

OpenAI crawls 1,700x more content than it sends back as traffic.
robots.txt is voluntary. Legal remedies take years.

The web publishing industry is looking for technical enforcement.
But most approaches are reactive — rate limiting, CAPTCHAs,
detection heuristics. An arms race by design.

What if the defense was architectural instead?

async-dom runs your UI framework inside a Web Worker.
The main thread applies only rendering instructions.
The HTML payload is structurally empty.

This isn't a content protection tool.
It's a rendering architecture that makes scraping
a reverse-engineering problem instead of a parsing problem.

The same architecture also solves performance:

→ Framework execution moves off the main thread entirely
→ Multi-core utilization — not just one of your 8 cores
→ Frame-budgeted scheduling keeps interaction responsive
→ Each micro-frontend runs in its own isolated worker

The demo runs React, Vue, and Svelte simultaneously
on a single page. Zero shared state. Zero conflicts.

Open source under MIT.

How is your organization thinking about
the intersection of content protection and web architecture?

#ContentProtection #WebArchitecture #AIGovernance #OpenSource
```

**First comment (post 1-2 min after):**
```
Live demo: https://lifeart.github.io/async-dom/
GitHub: https://github.com/lifeart/async-dom

Particularly interested in perspectives from publishing,
media, education, and SaaS teams dealing with
AI scraping or proprietary UI protection.
```

---

## OPTION C — The Builder Narrative (Personal story, highest engagement ceiling)

```
I started building async-dom in 2017
with a simple question:

What if the DOM was just a remote display?

Run application logic in a Web Worker.
Send rendering instructions to the main thread.
Let the browser paint.

9 years later, this architecture solves problems
I never anticipated when I started:

→ AI scrapers get an empty HTML shell — no content to extract
→ Business logic is isolated at the browser engine level — not by policy, by architecture
→ Framework execution moves entirely off the main thread — zero competition with user input
→ Multiple frameworks coexist on one page — React, Vue, Svelte in separate workers
→ The same app streams to any screen via WebSocket — TVs, kiosks, IoT displays

The hardest technical challenge was synchronous DOM reads.
When your code runs in a worker but needs getBoundingClientRect(),
you need SharedArrayBuffer and Atomics to block without deadlocking.

The most surprising outcome was content protection.
When the DOM is a procedural projection, there's nothing
meaningful in the page source. That turned out to matter
more in 2026 than it did in 2017.

The live demo runs three frameworks simultaneously.
Three workers. Three shadow DOMs.
Zero framework code on the main thread.

Open source. MIT licensed.

What problem would this architecture solve for you?

#WebArchitecture #OpenSource #FrontendEngineering #WebWorkers
```

**First comment (post 1-2 min after):**
```
Live demo (React + Vue + Svelte in workers):
https://lifeart.github.io/async-dom/

GitHub: https://github.com/lifeart/async-dom

I'd welcome perspectives from anyone working on:
- Content protection strategies beyond robots.txt
- Micro-frontend architecture at scale
- Performance on constrained devices
- Streaming UI to non-browser surfaces
```

---

## OPTION D — The Concise Executive Brief

```
Your web application's single-threaded architecture
is both a performance ceiling and a security liability.

Framework execution, business logic, and user interaction
all compete for the same 16ms frame budget.
And everything — source code, data, tokens — sits in the DOM.

async-dom inverts this.

Your entire UI framework runs in a Web Worker.
The main thread receives only rendering instructions.

The result:
→ Framework runtime off the main thread — zero jank
→ Content architecturally absent from the HTML payload
→ Business logic isolated at the engine level
→ Multiple frameworks on one page — no iframes, no conflicts
→ Remote rendering via WebSocket to any device

Open source. MIT licensed.
Built for teams that need both performance and isolation.

What trade-offs do you see in this architecture?

#WebArchitecture #Engineering #OpenSource
```

**First comment (post 1-2 min after):**
```
Live demo: https://lifeart.github.io/async-dom/
GitHub: https://github.com/lifeart/async-dom
```

---

## Content Calendar — Follow-up Posts (one per week)

1. **"The web has a single-threaded problem. Here's the architectural fix."**
   Performance-focused. Core Web Vitals angle. Resonates with engineering leaders tracking Lighthouse scores.

2. **"robots.txt is a polite request, not a wall."**
   Content protection angle. Timely with NYT v. OpenAI, IAB legislation. Resonates with publishing, media, legal.

3. **"We ran React, Vue, and Svelte on one page. No iframes. No conflicts."**
   Multi-framework angle. Resonates with platform teams building micro-frontends.

4. **"What if your app ran on a server and streamed UI to any screen?"**
   WebSocket/IoT angle. Resonates with teams building for SmartTV, kiosks, embedded displays.

5. **"The hardest problem in worker-based rendering: synchronous DOM reads"**
   Deep technical post. Resonates with senior engineers. SharedArrayBuffer + Atomics story.
