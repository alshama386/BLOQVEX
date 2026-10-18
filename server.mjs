// Simple dependency-free local preview server (not required by Netlify / GitHub Pages).
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json','.txt':'text/plain'};
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');let filepath=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!filepath.startsWith(root+path.sep)&&filepath!==root)throw new Error('Invalid path');if((await stat(filepath)).isDirectory())filepath=path.join(filepath,'index.html');if(!['.html','.js','.css','.png','.webmanifest','.json','.txt'].includes(path.extname(filepath)))throw new Error('Forbidden file type');const contents=await readFile(filepath);res.writeHead(200,{'Content-Type':mime[path.extname(filepath)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(contents);}catch{res.writeHead(404);res.end('Not found');}}).listen(8000,()=>console.log('BLOQVEX local preview: http://localhost:8000'));
