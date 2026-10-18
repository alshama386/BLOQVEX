import assert from 'node:assert/strict';
import {PuzzleGame,pieceDimensions,THEMES,SIZE,dailySeed} from '../src/game.js';
let runs=0;
function test(name,fn){fn();runs++;console.log('✓',name);}
test('Board is 8x8 and tray has three pieces',()=>{const g=new PuzzleGame({seed:123});assert.equal(g.board.length,SIZE);assert.equal(g.board[0].length,SIZE);assert.equal(g.pieces.length,3);});
test('Identical seeds produce identical piece trays',()=>{const a=new PuzzleGame({seed:12345}),b=new PuzzleGame({seed:12345});assert.deepEqual(a.pieces,b.pieces);});
test('A piece can be placed, earns points, and cannot overlap',()=>{const g=new PuzzleGame({seed:4});const p=g.pieces[0];assert.equal(g.canPlace(p,0,0),true);assert.ok(g.place(0,0,0));assert.ok(g.score>0);assert.equal(g.canPlace(p,0,0),false);});
test('Full row clears after placement',()=>{const g=new PuzzleGame({seed:1});g.board[0]=Array(8).fill('#abc');g.board[0][3]=null;g.pieces[0]={cells:[[0,0]],color:'#aaa'};const result=g.place(0,3,0);assert.equal(result.cleared,1);assert.equal(g.lines,1);assert.ok(g.board[0].every(x=>x===null));});
test('Completing both row and column grants multi-line points',()=>{const g=new PuzzleGame({seed:1});for(let i=0;i<8;i++){g.board[i][0]='#abc';g.board[0][i]='#abc';}g.board[0][0]=null;g.pieces[0]={cells:[[0,0]],color:'#aaa'};const result=g.place(0,0,0);assert.equal(result.cleared,2);assert.equal(g.lines,2);assert.equal(g.score,10+2*110+90);});
test('Game ends if none of the remaining pieces can fit',()=>{const g=new PuzzleGame({seed:1});g.board=Array.from({length:8},(_,y)=>Array.from({length:8},(_,x)=>(x+y)%2===0?null:'#333'));g.pieces=[{cells:[[0,0]],color:'#aaa'},{cells:[[0,0],[1,0]],color:'#aaa'},null];g.place(0,0,0);assert.equal(g.ended,true);});
test('Theme palette and dimensions valid',()=>{for(const th of Object.values(THEMES))assert.equal(th.colors.length,7);const g=new PuzzleGame({seed:12,theme:'galaxy'});for(const p of g.pieces){const {w,h}=pieceDimensions(p);assert.ok(w>=1&&w<=5);assert.ok(h>=1&&h<=5);}});
test('Daily seed is deterministic on the same day',()=>assert.equal(dailySeed(),dailySeed()));
console.log(`\n${runs} tests passed.`);
