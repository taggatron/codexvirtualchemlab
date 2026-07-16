import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join} from 'node:path';
const port=Number(process.argv[2]||process.env.PORT)||4173;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
http.createServer(async(req,res)=>{try{const cleanUrl=req.url.split('?')[0],path=cleanUrl==='/'?'index.html':cleanUrl.slice(1),file=await readFile(join(process.cwd(),path));res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store, max-age=0'});res.end(file)}catch{res.writeHead(404,{'Cache-Control':'no-store'});res.end('Not found')}}).listen(port,()=>console.log(`Practical Lab: http://localhost:${port}`));
