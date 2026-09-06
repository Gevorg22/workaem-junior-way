import { World } from "../src/game/world";
import type { InputState } from "../src/game/world";
const IN=(o:Partial<InputState>={}):InputState=>({left:false,right:false,jump:false,jumpPressed:false,...o});

function tryPass(levelIdx:number, wallX:number, grade:0|1|2){
  const w=new World(); w.loadLevel(levelIdx);
  const p=w.player;
  p.grade=grade; p.h=grade===0?11:22;
  p.x=wallX-40; p.y=w.level.groundY-p.h;
  let held=0, maxX=p.x;
  for(let f=0;f<6000;f++){
    if(w.phase!=="play") return {passed:false,phase:w.phase,maxX,f};
    const inp:Partial<InputState>={right:true};
    // бот прыгает постоянно, пытаясь перелезть
    if(w.player.onGround&&held===0){inp.jumpPressed=true;inp.jump=true;held=16;}
    if(held>0){inp.jump=true;held--;}
    w.update(IN(inp));
    maxX=Math.max(maxX,w.player.x);
    if(w.player.x>wallX+30) return {passed:true,f,maxX};
  }
  return {passed:false,maxX,grade,reason:"timeout", y:w.player.y, x:w.player.x, lives:w.lives};
}
console.log("L8 x=262 grade1:", JSON.stringify(tryPass(7,262,1)));
console.log("L8 x=262 grade0:", JSON.stringify(tryPass(7,262,0)));
console.log("L8 x=262 grade2:", JSON.stringify(tryPass(7,262,2)));
console.log("L7 x=900 grade1:", JSON.stringify(tryPass(6,900,1)));
console.log("L7 x=900 grade0:", JSON.stringify(tryPass(6,900,0)));
console.log("L11 x=484 grade1:", JSON.stringify(tryPass(10,484,1)));
