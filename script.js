const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const timeEl = document.getElementById("time");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const enterBtn = document.getElementById("enterBtn");
const introScreen = document.getElementById("introScreen");
const gameApp = document.getElementById("gameApp");

const carImg = new Image();
carImg.src = "assets/car_transparent.png";

const TILE = 40;
const COLS = 21;
const ROWS = 15;

let maze = [];
let player, score, lives, timeLeft, running, timerId, spawnTimerId;
let keys = {};
let items = [];
let sleepyClouds = [];
let hazards = [];
let message = "";
let lastHit = 0;

function generateMaze(){
  // Odd-size DFS maze: walls everywhere, then carve paths
  maze = Array.from({length: ROWS}, () => Array(COLS).fill("#"));

  function carve(x, y){
    maze[y][x] = " ";
    const dirs = [[2,0],[-2,0],[0,2],[0,-2]].sort(() => Math.random() - 0.5);

    for(const [dx, dy] of dirs){
      const nx = x + dx;
      const ny = y + dy;

      if(nx > 0 && nx < COLS-1 && ny > 0 && ny < ROWS-1 && maze[ny][nx] === "#"){
        maze[y + dy/2][x + dx/2] = " ";
        carve(nx, ny);
      }
    }
  }

  carve(1,1);

  // Open a few extra paths so the game feels less tight
  for(let i=0; i<18; i++){
    const x = 1 + Math.floor(Math.random() * (COLS-2));
    const y = 1 + Math.floor(Math.random() * (ROWS-2));
    if(x % 2 === 0 || y % 2 === 0) maze[y][x] = " ";
  }

  maze[1][1] = "S";
  maze[ROWS-2][COLS-2] = "E";

  // Ensure area around finish is reachable/open
  maze[ROWS-2][COLS-3] = " ";
  maze[ROWS-3][COLS-2] = " ";

  // Convert to strings for drawing/collision
  maze = maze.map(row => row.join(""));
}

function getRandomOpenTile(){
  let tries = 0;
  while(tries < 500){
    const x = 1 + Math.floor(Math.random() * (COLS-2));
    const y = 1 + Math.floor(Math.random() * (ROWS-2));
    const cell = maze[y][x];
    const farFromStart = Math.abs(x-1) + Math.abs(y-1) > 4;
    const farFromEnd = Math.abs(x-(COLS-2)) + Math.abs(y-(ROWS-2)) > 2;
    if(cell !== "#" && farFromStart && farFromEnd){
      return {x, y};
    }
    tries++;
  }
  return {x:3, y:3};
}

function init(){
  generateMaze();

  player = {x:1*TILE+6, y:1*TILE+6, size:30, speed:3.25};
  score = 0;
  lives = 3;
  timeLeft = 75;
  running = false;
  keys = {};
  items = [];
  sleepyClouds = [];
  hazards = [];
  message = "New maze generated!";
  lastHit = 0;

  for(let i=0; i<4; i++) spawnItem("alert");
  for(let i=0; i<4; i++) spawnItem("coffee");
  for(let i=0; i<3; i++) spawnSleepyCloud();

  updateUi();
  draw();
}

function updateUi(){
  scoreEl.textContent = score;
  livesEl.textContent = "❤️".repeat(Math.max(lives,0));
  timeEl.textContent = timeLeft;
}

function sound(type){
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const audio = new AudioContext();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.connect(gain);
  gain.connect(audio.destination);

  if(type==="collect"){ osc.frequency.value=880; gain.gain.value=.06; }
  if(type==="coffee"){ osc.frequency.value=1040; gain.gain.value=.07; }
  if(type==="danger"){ osc.frequency.value=130; gain.gain.value=.09; }
  if(type==="spawn"){ osc.frequency.value=620; gain.gain.value=.025; }
  if(type==="win"){
    osc.frequency.value=880;
    gain.gain.value=.08;
    setTimeout(()=>{
      const audio2 = new AudioContext();
      const osc2 = audio2.createOscillator();
      const gain2 = audio2.createGain();
      osc2.connect(gain2);
      gain2.connect(audio2.destination);
      osc2.frequency.value = 1180;
      gain2.gain.value = .07;
      osc2.start();
      gain2.gain.exponentialRampToValueAtTime(.001, audio2.currentTime + .45);
      osc2.stop(audio2.currentTime + .5);
    },120);
  }

  if(type==="lose"){
    osc.frequency.value=180;
    gain.gain.value=.08;

    setTimeout(()=>{
      const audio3 = new AudioContext();
      const osc3 = audio3.createOscillator();
      const gain3 = audio3.createGain();
      osc3.connect(gain3);
      gain3.connect(audio3.destination);
      osc3.frequency.value = 90;
      gain3.gain.value = .06;
      osc3.start();
      gain3.gain.exponentialRampToValueAtTime(.001, audio3.currentTime + .6);
      osc3.stop(audio3.currentTime + .65);
    },150);
  }

  osc.start();
  gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .22);
  osc.stop(audio.currentTime + .24);
}

function startGame(){
  init();
  running = true;
  overlay.classList.remove("show");
  clearInterval(timerId);
  clearInterval(spawnTimerId);

  timerId = setInterval(()=>{
    if(!running) return;
    timeLeft--;
    updateUi();
    if(timeLeft <= 0) lose("Time is over! The driver lost focus.");
  },1000);

  // Every few seconds: things appear/disappear in different places
  spawnTimerId = setInterval(()=>{
    if(!running) return;

    // Remove old temporary objects
    items = items.filter(item => Date.now() < item.expireAt);
    sleepyClouds = sleepyClouds.filter(cloud => Date.now() < cloud.expireAt);

    const r = Math.random();
    if(r < 0.35) spawnSleepyCloud();
    else if(r < 0.80) spawnItem("coffee");
    else spawnItem("alert");

    message = "New object appeared!";
  },2200);

  requestAnimationFrame(loop);
}

function spawnItem(type){
  const p = getRandomOpenTile();
  items.push({
    x:p.x,
    y:p.y,
    type:type,
    expireAt: Date.now() + (type==="coffee" ? 5200 : 6500)
  });
  if(running) sound(type==="coffee" ? "coffee" : "spawn");
}

function spawnSleepyCloud(){
  const p = getRandomOpenTile();
  sleepyClouds.push({
    x:p.x*TILE + 5,
    y:p.y*TILE + 5,
    dir: Math.random() < .5 ? -1 : 1,
    speed: 0.7 + Math.random()*1.1,
    expireAt: Date.now() + 5600
  });
  if(running) sound("spawn");
}

function tileAt(px, py){
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if(!maze[ty] || !maze[ty][tx]) return "#";
  return maze[ty][tx];
}

function isWall(x,y,size){
  return (
    tileAt(x,y)==="#" ||
    tileAt(x+size,y)==="#" ||
    tileAt(x,y+size)==="#" ||
    tileAt(x+size,y+size)==="#"
  );
}

function rectsOverlap(a,b){
  return a.x < b.x + b.w && a.x + a.size > b.x && a.y < b.y + b.h && a.y + a.size > b.y;
}

function update(){
  let nx = player.x;
  let ny = player.y;

if(keys.ArrowUp || gamepadButtons.up) ny -= player.speed;
if(keys.ArrowDown || gamepadButtons.down) ny += player.speed;
if(keys.ArrowLeft || gamepadButtons.left) nx -= player.speed;
if(keys.ArrowRight || gamepadButtons.right) nx += player.speed;

  if(!isWall(nx, ny, player.size)){
    player.x = nx;
    player.y = ny;
  }

  // Remove expired objects
  items = items.filter(item => Date.now() < item.expireAt);
  sleepyClouds = sleepyClouds.filter(cloud => Date.now() < cloud.expireAt);

  items.forEach(item=>{
    const cx = item.x*TILE + 10;
    const cy = item.y*TILE + 10;

    if(Math.hypot(player.x - cx, player.y - cy) < 31){
      if(item.type === "coffee"){
        if(lives < 3){
          lives++;
          message = "Coffee restored focus! +1 heart ☕❤️";
        }else{
          message = "Coffee collected! Hearts already full ☕";
        }
        sound("coffee");
      }else{
        score += 1;
        message = "Alert point collected! +1 👁️";
        sound("collect");
      }
      item.expireAt = 0;
      updateUi();
    }
  });

  sleepyClouds.forEach(cloud=>{
    cloud.x += cloud.speed * cloud.dir;

    if(tileAt(cloud.x, cloud.y)==="#" || tileAt(cloud.x+30, cloud.y)==="#"){
      cloud.dir *= -1;
      cloud.x += cloud.speed * cloud.dir * 4;
    }

    if(rectsOverlap({x:player.x,y:player.y,size:player.size}, {x:cloud.x,y:cloud.y,w:34,h:34})){
      hitDanger("Sleep sign touched! -2 points and -1 heart 💤");
      cloud.expireAt = 0;
    }
  });

  if(tileAt(player.x+player.size/2, player.y+player.size/2)==="E"){
    win();
  }
}

function hitDanger(text){
  const now = Date.now();
  if(now-lastHit < 900) return;
  lastHit = now;

  score = Math.max(0, score - 2);
  lives--;
  message = text;
  sound("danger");
  updateUi();

  if(lives <= 0) lose("No hearts left. Drowsiness detected too many times!");
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = "#EEF1F6";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  for(let y=0;y<maze.length;y++){
    for(let x=0;x<maze[y].length;x++){
      const c = maze[y][x];

      if(c==="#"){
        ctx.fillStyle = "#13264B";
        ctx.fillRect(x*TILE,y*TILE,TILE,TILE);
        ctx.fillStyle = "rgba(255,255,255,.08)";
        ctx.fillRect(x*TILE+3,y*TILE+3,TILE-6,3);
      } else {
        ctx.fillStyle = "#F6F7FA";
        ctx.fillRect(x*TILE,y*TILE,TILE,TILE);
        ctx.strokeStyle = "rgba(19,38,75,.06)";
        ctx.strokeRect(x*TILE,y*TILE,TILE,TILE);
      }

      if(c==="S"){
        ctx.fillStyle = "#59D98E";
        ctx.fillRect(x*TILE+4,y*TILE+4,TILE-8,TILE-8);
        ctx.fillStyle = "#13264B";
        ctx.font = "16px Arial";
        ctx.fillText("START",x*TILE+2,y*TILE+25);
      }

      if(c==="E"){
        ctx.fillStyle = "#F4C430";
        ctx.fillRect(x*TILE+4,y*TILE+4,TILE-8,TILE-8);
        ctx.font = "24px Arial";
        ctx.fillText("🏁",x*TILE+8,y*TILE+28);
      }
    }
  }
  items.forEach(item=>{
    const remaining = Math.max(0, item.expireAt - Date.now()) / 1000;
    const pulse = 40 + Math.sin(Date.now()/140)*4;

    // glowing background
    ctx.beginPath();
    ctx.fillStyle = "rgba(19,38,75,0.95)";
    ctx.arc(item.x*TILE+20, item.y*TILE+20, 20, 0, Math.PI*2);
    ctx.fill();

    ctx.shadowColor = "#F4C430";
    ctx.shadowBlur = 18;
    ctx.font = pulse + "px Arial";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(item.type==="coffee" ? "☕" : "👁️", item.x*TILE-1, item.y*TILE+35);

    ctx.shadowBlur = 0;
  });

  sleepyClouds.forEach(cloud=>{
    const remaining = Math.max(0, cloud.expireAt - Date.now()) / 1000;
    const sleepPulse = 44 + Math.sin(Date.now()/150)*4;

    ctx.beginPath();
    ctx.fillStyle = "rgba(19,38,75,0.95)";
    ctx.arc(cloud.x+18, cloud.y+18, 22, 0, Math.PI*2);
    ctx.fill();

    ctx.shadowColor = "#FFFFFF";
    ctx.shadowBlur = 18;
    ctx.font = sleepPulse + "px Arial";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("💤", cloud.x-2, cloud.y+36);

    ctx.shadowBlur = 0;
  });

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.30)";
  ctx.shadowBlur = 12;
  ctx.drawImage(carImg, player.x-12, player.y-20, 58, 58);
  ctx.restore();

  if(message){
    ctx.fillStyle = "rgba(19,38,75,.88)";
    ctx.fillRect(165, 12, 510, 42);
    ctx.fillStyle = "#F4C430";
    ctx.font = "18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(message, 420, 39);
    ctx.textAlign = "left";
  }

  ctx.fillStyle = "rgba(19,38,75,.92)";
  ctx.fillRect(0, canvas.height-38, canvas.width, 38);
  ctx.fillStyle = "#F4C430";
  ctx.font = "17px Arial";
  ctx.fillText("Intelligent Driver Drowsiness Detection using Deep Learning", 20, canvas.height-13);
}

function loop(){
  if(!running) return;
  update();
  draw();
  requestAnimationFrame(loop);
}

function showOverlay(title, text){
  overlay.innerHTML = `<div class="card"><h2>${title}</h2><p>${text}</p><p class="hint">Press Restart to generate a new maze</p></div>`;
  overlay.classList.add("show");
}

function win(){
  if(!running) return;
  running = false;
  clearInterval(timerId);
  clearInterval(spawnTimerId);
  sound("win");
  showOverlay("Safe Arrival 🏁", `Amazing driving! You reached the destination with ${score} alert points and ${lives} heart(s).`);
}

function lose(text){
  if(!running) return;
  running = false;
  clearInterval(timerId);
  clearInterval(spawnTimerId);
  sound("lose");
  showOverlay("💔Game Over ", text + " Better luck next drive!");
}

document.addEventListener("keydown", e=>{
  keys[e.key] = true;
  if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault();
});

document.addEventListener("keyup", e=> keys[e.key] = false);

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);

carImg.onload = init;


// Touch buttons for mobile/tablet control
const touchButtons = document.querySelectorAll(".touchBtn");

touchButtons.forEach(button => {
  const key = button.dataset.key;

  function press(e){
    e.preventDefault();
    keys[key] = true;
    button.classList.add("pressed");
    button.setPointerCapture?.(e.pointerId);
  }

  function release(e){
    e.preventDefault();
    keys[key] = false;
    button.classList.remove("pressed");
  }

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});


// Intro screen button: move from welcome screen to the current game interface
if (enterBtn && introScreen && gameApp) {
  enterBtn.addEventListener("click", () => {
    introScreen.classList.add("hide");
    gameApp.classList.add("show");
    setTimeout(() => {
      introScreen.style.display = "none";
      draw();
    }, 450);
  });
}



// ==============================
// PLAYSTATION CONTROLLER SUPPORT
// ==============================

let gamepadButtons = {
  up: false,
  down: false,
  left: false,
  right: false
};

function updateGamepad(){
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gamepads[0];

  gamepadButtons.up = false;
  gamepadButtons.down = false;
  gamepadButtons.left = false;
  gamepadButtons.right = false;

  if(gp){

    // Left analog stick
    const axisX = gp.axes[0];
    const axisY = gp.axes[1];

    if(axisY < -0.4) gamepadButtons.up = true;
    if(axisY > 0.4) gamepadButtons.down = true;
    if(axisX < -0.4) gamepadButtons.left = true;
    if(axisX > 0.4) gamepadButtons.right = true;

    // D-pad support
    if(gp.buttons[12]?.pressed) gamepadButtons.up = true;
    if(gp.buttons[13]?.pressed) gamepadButtons.down = true;
    if(gp.buttons[14]?.pressed) gamepadButtons.left = true;
    if(gp.buttons[15]?.pressed) gamepadButtons.right = true;
  }

  requestAnimationFrame(updateGamepad);
}

window.addEventListener("gamepadconnected", () => {
  console.log("PlayStation controller connected 🎮");
});

updateGamepad();
