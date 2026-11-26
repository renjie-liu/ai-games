// Walks every state the rules can reach, with the proposal layer on top, and reports where a
// player can get stuck. Offline, no model: the real engine (engine.mjs) and the real Room (world.mjs).
//
//   node flow_audit.mjs [rules] [seed]   prints the findings as JSON; rules is a rule set of
//                                        room-rules.json (default: the room without one)
//
// It answers three questions:
//  1. From every reachable position, can the game still be won? (no dead ends)
//  2. While a shared action waits for the other seat, which of that seat's own moves are refused,
//     and in which positions would such a move change what accepting does?
//  3. In which positions does accepting a waiting proposal undo progress?
import {initialState,transition,won,gateOpen,actionsFor} from './engine.mjs';
import {Room} from './world.mjs';

const [rules='classic',seed='1']=process.argv.slice(2);
const newRoom=()=>new Room({west:'human',east:'human'},{rules,seed:Number(seed)});
const {puzzle,joint}=newRoom(),{player,partner}=actionsFor(puzzle);
// Counters do not make a position different.
const COUNTERS=['moves','packs','powerOns'];
const keyOf=s=>JSON.stringify(Object.entries(s).filter(([k])=>!COUNTERS.includes(k)));
const actor=a=>player.has(a)?'player':'partner',seatOf=a=>player.has(a)?'west':'east';
const all=[...player,...partner];

// --- 1. the bare rules -------------------------------------------------------
const states=new Map(),edges=new Map(),queue=[initialState(puzzle)];
states.set(keyOf(queue[0]),queue[0]);
while(queue.length){
  const s=queue.shift(),k=keyOf(s);edges.set(k,[]);
  for(const a of all){
    const r=transition(s,a,actor(a),puzzle);if(!r.ok)continue;
    const nk=keyOf(r.state);edges.get(k).push([a,nk]);
    if(!states.has(nk)){states.set(nk,r.state);queue.push(r.state);}
  }
}
const canWin=new Set([...states].filter(([,s])=>won(s)).map(([k])=>k));
for(let grew=true;grew;){grew=false;for(const [k,out] of edges)if(!canWin.has(k)&&out.some(([,n])=>canWin.has(n))){canWin.add(k);grew=true;}}
const deadEnds=[...states].filter(([k])=>!canWin.has(k)).map(([,s])=>s);

// --- 2 and 3. with a proposal waiting ------------------------------------------
function roomAt(state,pending){
  const room=newRoom();
  room.state={...state};room.pending=pending?{id:'p',from:seatOf(pending),action:pending,label:pending}:null;
  return room;
}
const brief=s=>Object.entries(s).filter(([k,v])=>v===true||(typeof v==='number'&&!COUNTERS.includes(k))).map(([k,v])=>v===true?k:`${k}=${v}`).join('+')||'start';
const refusedWhileWaiting=[],acceptingUndoes=[];
for(const [,s] of states){
  if(won(s))continue;
  for(const proposal of joint){
    if(!transition(s,proposal,actor(proposal),puzzle).ok)continue;   // could not have been proposed here
    const responder=seatOf(proposal)==='west'?'east':'west';
    const accepted=transition(s,proposal,actor(proposal),puzzle).state;
    // What accepting costs: the gate was up and comes down.
    if(gateOpen(s)&&!gateOpen(accepted))acceptingUndoes.push({position:brief(s),proposal});
    for(const move of (responder==='west'?player:partner)){
      if(joint.has(move))continue;
      const free=transition(s,move,actor(move),puzzle);if(!free.ok)continue;   // the rules allow this move here
      const result=roomAt(s,proposal).command(responder,{type:'action',id:move});
      if(result.ok)continue;
      // Would the move have changed what accepting does?
      const after=transition(free.state,proposal,actor(proposal),puzzle);
      const matters=after.ok&&gateOpen(after.state)!==gateOpen(accepted);
      refusedWhileWaiting.push({position:brief(s),proposal,responder,move,code:result.code,changes_what_accepting_does:matters});
    }
  }
}
const report={rules,seed:puzzle?Number(seed):null,reachable_positions:states.size,winning_positions:[...states.values()].filter(won).length,
  dead_ends:deadEnds.map(brief),
  accepting_drops_the_gate:acceptingUndoes,
  own_moves_refused_while_a_proposal_waits:{count:refusedWhileWaiting.length,
    that_change_what_accepting_does:refusedWhileWaiting.filter(x=>x.changes_what_accepting_does)}};
console.log(JSON.stringify(report,null,1));
