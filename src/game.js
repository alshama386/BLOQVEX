// Original BLOQVEX puzzle engine. No external dependencies; supports deterministic seeds.
export const SIZE=8;
export const COLORS=['#37c9f3','#a36bed','#ffb545','#ff70ad','#5edab7','#5a93fa','#fa8979'];
export const THEMES={
  candy:{name:'Candy Pop',ar:'حلاوة',price:0,colors:COLORS},
  ocean:{name:'Ocean Wave',ar:'موج البحر',price:150,colors:['#23bce8','#4596fa','#6fdfdf','#57d2a7','#9a90ff','#37cacc','#79e6f5']},
  sunset:{name:'Sunset Glow',ar:'غروب',price:200,colors:['#ffbc58','#fb788f','#fd9d6c','#d870c2','#f6d167','#ed6585','#fa9f9f']},
  galaxy:{name:'Galaxy Neon',ar:'مجرة',price:300,colors:['#8c67eb','#5b75ed','#dd77fa','#4acfe5','#b07efa','#f484d3','#9bb1ff']},
  mint:{name:'Mint Fresh',ar:'نعناع',price:150,colors:['#5ddbb1','#82e6be','#34c7b1','#b3df76','#40bf9e','#8dcff1','#4be1cd']},
  lava:{name:'Lava Rush',ar:'حمم',price:250,colors:['#fe735e','#fdb347','#ef496c','#ffc76e','#fd8868','#ee4f5b','#ffaf71']}
};
// Coordinates in every shape start at (0,0). All rotations are explicitly enumerated.
const SHAPES=[
 [[0,0]],[[0,0],[1,0]],[[0,0],[0,1]],[[0,0],[1,0],[2,0]],[[0,0],[0,1],[0,2]],
 [[0,0],[1,0],[0,1]],[[0,0],[1,0],[1,1]],[[1,0],[0,1],[1,1]],[[0,0],[0,1],[1,1]],
 [[0,0],[1,0],[0,1],[1,1]],[[0,0],[1,0],[2,0],[3,0]],[[0,0],[0,1],[0,2],[0,3]],
 [[0,0],[1,0],[2,0],[2,1]],[[0,0],[0,1],[0,2],[1,2]],[[0,0],[1,0],[2,0],[0,1]],
 [[1,0],[1,1],[1,2],[0,2]],[[0,0],[1,0],[1,1],[2,1]],[[1,0],[0,1],[1,1],[0,2]],
 [[1,0],[0,1],[1,1],[2,1]],[[0,0],[0,1],[1,1],[0,2]],[[0,0],[1,0],[2,0],[1,1]],
 [[0,0],[1,0],[2,0],[3,0],[4,0]],[[0,0],[0,1],[0,2],[0,3],[0,4]],
 [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],[[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]],
 [[0,0],[1,0],[2,0],[1,1],[1,2]],[[0,0],[0,1],[1,1],[2,1],[2,2]]
];
function randGen(seed){let a=(seed>>>0)||1;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function dailySeed(){const d=new Date();const key=`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;return [...key].reduce((a,c)=>Math.imul(a,31)+c.charCodeAt(0)|0,73453)>>>0;}
export class PuzzleGame{
  constructor({mode='classic',seed,theme='candy',onChange=()=>{},onEnd=()=>{},onClear=()=>{}}={}){
    this.mode=mode;this.seed=seed??(mode==='daily'?dailySeed():Math.floor(Math.random()*2**32));this.rng=randGen(this.seed);this.theme=THEMES[theme]||THEMES.candy;this.board=Array.from({length:SIZE},()=>Array(SIZE).fill(null));this.score=0;this.lines=0;this.combo=0;this.bestCombo=0;this.turn=1;this.ended=false;this.startedAt=Date.now();this.duration=(mode==='sprint'||mode==='battle')?120:Infinity;this.onChange=onChange;this.onEnd=onEnd;this.onClear=onClear;this.pieces=this.newPieces();this.onChange(this);
  }
  newPieces(){return Array.from({length:3},()=>{
    let idx=Math.floor(this.rng()*SHAPES.length);
    if(this.turn<3 && SHAPES[idx].length>4)idx=Math.floor(this.rng()*11);
    return {cells:SHAPES[idx].map(([x,y])=>[x,y]),color:this.theme.colors[Math.floor(this.rng()*this.theme.colors.length)]};
  });}
  canPlace(piece,x,y){return piece&&piece.cells.every(([dx,dy])=>x+dx>=0&&y+dy>=0&&x+dx<SIZE&&y+dy<SIZE&&!this.board[y+dy][x+dx]);}
  anyMove(){return this.pieces.some(piece=>piece&&this.board.some((_,y)=>this.board[y].some((_,x)=>this.canPlace(piece,x,y))));}
  place(index,x,y){if(this.ended||!Number.isInteger(index)||!this.canPlace(this.pieces[index],x,y))return null;
    const p=this.pieces[index];for(const [dx,dy] of p.cells)this.board[y+dy][x+dx]=p.color;
    this.pieces[index]=null;
    const rows=[],cols=[];
    for(let iy=0;iy<SIZE;iy++){if(this.board[iy].every(Boolean))rows.push(iy);if(this.board.every(r=>r[iy]))cols.push(iy);}
    const cleared=rows.length+cols.length;
    if(cleared){
      // Snapshot every affected square (including intersections once) for the fade animation.
      const cells=new Map();
      for(const iy of rows)for(let ix=0;ix<SIZE;ix++)cells.set(`${ix},${iy}`,{x:ix,y:iy,color:this.board[iy][ix]});
      for(const ix of cols)for(let iy=0;iy<SIZE;iy++)cells.set(`${ix},${iy}`,{x:ix,y:iy,color:this.board[iy][ix]});
      const clearedCells=[...cells.values()];
      this.combo++;this.bestCombo=Math.max(this.bestCombo,this.combo);this.lines+=cleared;
      for(const iy of rows)this.board[iy].fill(null);
      for(const ix of cols)for(let iy=0;iy<SIZE;iy++)this.board[iy][ix]=null;
      this.onClear({rows,cols,cleared,combo:this.combo,cells:clearedCells});
    }else this.combo=0;
    this.score+=p.cells.length*10+(cleared?cleared*110+Math.max(0,cleared-1)*90+Math.max(0,this.combo-1)*50:0);
    if(this.pieces.every(p=>!p)){this.turn++;this.pieces=this.newPieces();}
    if(!this.anyMove())this.end('blocked');
    this.onChange(this);return {cleared,points:this.score};
  }
  remaining(){return this.duration===Infinity?Infinity:Math.max(0,this.duration-Math.floor((Date.now()-this.startedAt)/1000));}
  tick(){if(!this.ended&&this.duration!==Infinity&&this.remaining()===0)this.end('timer');}
  end(reason='finished'){if(this.ended)return;this.ended=true;this.reason=reason;this.onEnd(this);this.onChange(this);}
}
export function pieceDimensions(piece){return {w:Math.max(...piece.cells.map(c=>c[0]))+1,h:Math.max(...piece.cells.map(c=>c[1]))+1};}
