# async-dom
Async Dom

------------------------------------------
# Demos in https://github.com/lifeart/demo-async-dom/
------------------------------------------

2 apps separately running in web-workers, using async dom https://lifeart.github.io/async-dom/

# Supported WebWorker dom implementations
* Pseudo Dom
* JSDom
* Simple Dom
* Domino


# How to run glimmer streaming from websockets?

1. `npm install`
2. `npm run serve`
3. `visit http://127.0.0.1:8080`

# Logic

1. All DOM modifications collected in single pool
2. For each `requestAnimationFrame` we create fittable modifications list (pool slice)
3. If our modifications took more than 16ms, we put remaining modifications back to pool
4. Repeat all operations for next frame

* DOM modifications are sorted for optimal "rolling changes" (first create an element, add styles, and then add to DOM (not create an element, add to DOM, add styles))
* Optional DOM modifications (if the performance does not allow this modification, it is thrown out of the queue)
* Modifications orioritization and batching (you can create an array of modifications that will always be executed within a single frame)

# Description
This is a proof of concept of asynchronous DOM modification example with:
* event binding
* DOM modifications batching
* 60 fps performance
* optional DOM updates

# Main thread (DOM EventLoop)
* Only DOM update logic

# WebWorker 
* Business logic
* All DOM modifications came from WebWorker and applyed to Main thread DOM


# RealLife usage?

1. Share NDA UI's (user can't copy js logic) / for UI demos
2. SmartTV -> execute complicated buisiness logic (math) on backend and stream smooth ui
3. Marketing - > track user experience (websocket can broadcast ui changes for multiple users)
4. Parallel editing demo -> catch events from 2+ users and apply to single app
5. Internet of things -> execute app and stream result to any device
6. DOM rendering time-traveling for JS frameworks debugging
7. Rendering testing -> if snapshots/chunks are same - UI is good
8. You can run zoo of frameworks/(different versions of framework) on one page in web workers and use all of them, without iframes and side effects