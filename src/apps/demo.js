var lastStyle = 'none';
var blacksOnTime = 0;
var hasFullDom = false;
var blacksToRemove = [];
var colorUpdateInterval = 45000;
var score = 0;
var containerId = 'git-hub-container';
var localId = 'git-hub-link';
var scoreBoardId = 'score-board';


document.body.setAttribute('style','font-family: Roboto; font-weight: 400; background-color: #000000; background-repeat: no-repeat; background-size: cover');

function updateScore(result) {
    if (result === 'black') {
        score += 10;
    } else if (result === 'white') {
        score += 5;
    } else {
        score -= 2;
    }
    if (!hasFullDom) {
        return;
    }
    document.getElementById(scoreBoardId).textContent = `Your Score: ${score}`;
}
function removeBlacks() {
    if (!hasFullDom) {
        return;
    }
    blacksToRemove.map((id)=>{
        let item = document.getElementById(id);
        if (item) {
            item.remove();
        }
    });
    blacksToRemove = [];
}
function getRandomColor() {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}
function scheduleColorUpdate(id) {
    
    setTimeout(function() {
        (document.getElementById(id)||document.body).style['background-color'] = getRandomColor();
        scheduleColorUpdate(id);
    }, colorUpdateInterval*Math.sin(Date.now()));
}
function scheduleVisibilityUpdate(id) {
    setTimeout(function() {
        (document.getElementById(id)||document.body).style['background-color'] = Math.random() >= 0.5 ? 'black': getRandomColor();
        scheduleVisibilityUpdate(id);
    }, colorUpdateInterval*Math.sin(Date.now()));
}
function initDOM() {
    let scoreNode  = document.createElement('div');
    scoreNode.id = scoreBoardId;
    scoreNode.textContent = 'Your Score: 0';
    scoreNode.style = 'position:fixed; top:0; padding: 4px; right:0; width: 250px;background-color:rgba(0,0,0,0.7);color:#fff;'
    let container = document.createElement('div');
    container.id = containerId;
    container.style = 'padding:4px;display:block;clear:left;text-align:center;transition: background-color 0.5s ease;background-color:#232323;';
    let ghLink = document.createElement('a');
    ghLink.id = localId;
    ghLink.href = 'https://github.com/lifeart/demo-async-dom';
    ghLink.target = '_blank';
    ghLink.title = 'View on GitHub';
    ghLink.textContent = 'GitHub Link / 7000 DOM Nodes / 1400+ Updates per Second / 60 FPS / 28 000 Event listeners';
    ghLink.style = 'text-decoration:none;color:#f2f2f2;';
    
    document.body.appendChild(scoreNode);
    document.body.appendChild(container);
    container.appendChild(ghLink);
    hasFullDom = true;
}

function _initWebApp() {
for (let i = 0; i < 7000; i++) {
var id = i;
var style = 'cursor:pointer;display:inline-block;margin-left:6px;width:10px;height:10px;transition: background-color 0.5s ease;background-color:' + getRandomColor() + ';';


let node = document.createElement('div');
node.id = id;
document.body.appendChild(node);
node.onclick = function() {
    if (!hasFullDom) {
        return;
    }
    updateScore(node.style['background-color']);
    node.remove();
}
node.ondblclick = function() {
    alert('You double clicked on Me (#'+node.id+')!');
}
node.onmouseenter = function() {
    let color = node.style['background-color'];
    if (lastStyle === 'black' && color === 'black') {
        blacksOnTime++;
        blacksToRemove.push(node.id);
        for (var i = 0; i < blacksOnTime; i++) {
            updateScore('black');
        }
    } else if (lastStyle !== 'black' && color === 'black') {
        blacksOnTime = 1;
        blacksToRemove = [];
        blacksToRemove.push(node.id);
        lastStyle = color;
        updateScore('black');
    } else {
        removeBlacks();
        lastStyle = color;
        blacksOnTime = 0;
    }
    node.style['background-color'] = 'white';
}
node.onmouseleave = function() {
    setTimeout(()=>{
        node.style['background-color'] = getRandomColor();
    }, 2500);
}
node.style = style;
if (i % 10 === 0) {
    scheduleColorUpdate(id);
    scheduleVisibilityUpdate(id);
} else {
    scheduleColorUpdate(id);
    scheduleVisibilityUpdate(id);
}
}}
_initWebApp();
initDOM();