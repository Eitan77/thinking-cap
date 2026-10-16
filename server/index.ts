import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,extname,join,sep} from 'node:path';
import {homedir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {createChatGPT,ChatGPTError} from '../vendor/siwc-local/src/index.js';
import {encryption} from './dpapi.js';
import {validateAnswer} from '../src/core.js';

const port=4317, origin=`http://127.0.0.1:${port}`;
const allowed=new Set([origin,`http://localhost:${port}`,'http://localhost:8081','http://127.0.0.1:8081']);
const speechKey=randomBytes(32).toString('hex');
const storageDir=join(process.env.LOCALAPPDATA??homedir(),'ThinkingCap','chatgpt');
await mkdir(storageDir,{recursive:true});
const chatgpt=createChatGPT({appName:'Thinking Cap',appId:'thinking-cap',redirectPort:0,storageDir,sendHostId:true,credentialEncryption:encryption,
  openBrowser(url){
    if(new URL(url).origin!=='https://auth.openai.com')throw new Error('Unexpected authorization destination.');
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','Start-Process -FilePath $input'],{windowsHide:true,stdio:['pipe','ignore','ignore']});
    child.stdin.end(url);child.on('error',()=>{authError='Could not open the sign-in browser.';});
  }
});
let authBusy=false, authError='';
function safeError(e:unknown){return e instanceof ChatGPTError?`${e.code}: ${e.message}`:e instanceof Error&&e.message.startsWith('Windows ')?e.message:'Operation failed. Check the local services and try again.';}
function json(res:ServerResponse,status:number,body:unknown){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
async function body(req:IncomingMessage){let text='';for await(const chunk of req){text+=chunk;if(text.length>64000)throw new Error('Request too large');}return JSON.parse(text||'{}');}
async function speech(path:string,init:RequestInit={}){return fetch(`http://127.0.0.1:4318${path}`,{...init,headers:{...init.headers,'X-Speech-Key':speechKey},signal:init.signal??AbortSignal.timeout(60000)});}

const server=createServer(async(req,res)=>{
  if(!['127.0.0.1:4317','localhost:4317'].includes(req.headers.host??'')){json(res,403,{error:'Invalid host'});return;}
  const requestOrigin=req.headers.origin;
  if(requestOrigin&&!allowed.has(requestOrigin)){json(res,403,{error:'Invalid origin'});return;}
  if(requestOrigin){res.setHeader('Access-Control-Allow-Origin',requestOrigin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST');res.writeHead(204);res.end();return;}
  const path=new URL(req.url??'/',origin).pathname;
  try {
    if(path.startsWith('/api/')){
      if(!['GET','POST'].includes(req.method??'')){json(res,405,{error:'Method not allowed'});return;}
      if(req.method==='POST'&&(!requestOrigin||!req.headers['content-type']?.startsWith('application/json'))){json(res,403,{error:'Use the app to perform this action.'});return;}
      if(path==='/api/session'&&req.method==='GET'){json(res,200,{session:await chatgpt.getSession(),profiles:await chatgpt.listProfiles(),authBusy,authError});return;}
      if(path==='/api/signin'&&req.method==='POST'){
        const data=await body(req);if(authBusy){json(res,409,{error:'Sign-in already running.'});return;}
        authBusy=true;authError='';
        void chatgpt.signIn({newProfile:data.newProfile===true,reconsent:data.reconsent===true}).catch(e=>{authError=e instanceof ChatGPTError&&e.code==='cancelled'?'':safeError(e);}).finally(()=>{authBusy=false;});
        json(res,202,{started:true});return;
      }
      if(path==='/api/cancel-signin'&&req.method==='POST'){chatgpt.cancelSignIn();json(res,200,{ok:true});return;}
      if(path==='/api/profile'&&req.method==='POST'){const data=await body(req);json(res,200,await chatgpt.selectProfile(String(data.id)));return;}
      if(path==='/api/signout'&&req.method==='POST'){await chatgpt.disconnect();json(res,200,{ok:true});return;}
      if(path==='/api/models'&&req.method==='GET'){json(res,200,await chatgpt.listModels());return;}
      if(path==='/api/health'&&req.method==='GET'){
        try{const response=await speech('/health',{signal:AbortSignal.timeout(1500)});json(res,200,await response.json());}
        catch{json(res,200,{ready:false,error:'Local speech service is starting or unavailable.'});}return;
      }
      if(path==='/api/ask'&&req.method==='POST'){
        const data=await body(req);
        if(typeof data.question!=='string'||!data.question.trim()||data.question.length>4000||typeof data.script!=='string'||data.script.length>12000||typeof data.model!=='string') {json(res,400,{error:'Invalid question, model, or script.'});return;}
        const history=Array.isArray(data.history)?data.history.slice(-8):[];
        if(history.some((m:any)=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>4000)){json(res,400,{error:'Invalid history'});return;}
        const ac=new AbortController();res.on('close',()=>ac.abort());
        const started=performance.now();let firstTokenMs:number|null=null;
        const result=await chatgpt.streamResponse({model:data.model,instructions:data.script,input:[...history,{role:'user',content:data.question}],signal:ac.signal,onDelta:()=>{firstTokenMs??=Math.round(performance.now()-started);}});
        const checked=validateAnswer(result.text);if(checked.kind==='error'){json(res,422,{error:checked.reason});return;}
        json(res,200,{text:result.text,firstTokenMs,totalMs:Math.round(performance.now()-started)});return;
      }
      if(path==='/api/tts'&&req.method==='POST'){
        const data=await body(req);if(typeof data.text!=='string'||data.text.length>1200||validateAnswer(data.text).kind!=='answer'){json(res,400,{error:'Invalid speech text'});return;}
        const ac=new AbortController();res.on('close',()=>ac.abort());
        const response=await speech('/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:data.text}),signal:ac.signal});
        if(!response.ok){json(res,503,{error:'Local voice synthesis failed.'});return;}
        res.writeHead(200,{'Content-Type':'audio/wav','Cache-Control':'no-store'});res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      json(res,404,{error:'Unknown endpoint'});return;
    }
    if(req.method!=='GET'){json(res,405,{error:'Method not allowed'});return;}
    const root=resolve('dist');let target=resolve(root,'.'+decodeURIComponent(path));
    if(!target.startsWith(root+sep)&&target!==root){json(res,403,{error:'Invalid path'});return;}
    try{if((await stat(target)).isDirectory())target=join(target,'index.html');await stat(target);}catch{target=join(root,'index.html');}
    const data=await readFile(target);
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'} as Record<string,string>)[extname(target)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(data);
  }catch(e){if(!res.headersSent&&!res.destroyed)json(res,500,{error:safeError(e)});}
});
const wsServer=new WebSocketServer({noServer:true,maxPayload:128000});
server.on('upgrade',(req,socket,head)=>{
  if(!allowed.has(req.headers.origin??'')||!['127.0.0.1:4317','localhost:4317'].includes(req.headers.host??'')||req.url!=='/speech'){socket.destroy();return;}
  wsServer.handleUpgrade(req,socket,head,client=>{
    const upstream=new WebSocket('ws://127.0.0.1:4318/listen',{headers:{'X-Speech-Key':speechKey},maxPayload:128000});
    client.on('message',(data,binary)=>{if(upstream.readyState===WebSocket.OPEN&&upstream.bufferedAmount<256000)upstream.send(data,{binary});});
    upstream.on('message',(data,binary)=>{if(client.readyState===WebSocket.OPEN)client.send(data,{binary});});
    upstream.on('error',()=>{if(client.readyState===WebSocket.OPEN){client.send(JSON.stringify({type:'error',message:'Local speech service is unavailable.'}));client.close();}});
    client.on('error',()=>upstream.close());client.on('close',()=>upstream.close());upstream.on('close',()=>client.close());
  });
});
const python=process.env.THINKING_CAP_PYTHON??resolve('.venv/Scripts/python.exe');
const speechProcess=spawn(python,['speech/service.py'],{windowsHide:true,stdio:['ignore','inherit','inherit'],env:{...process.env,THINKING_CAP_SPEECH_KEY:speechKey}});
speechProcess.on('error',()=>console.error('Speech service could not start. Run scripts/setup.ps1 first.'));
server.listen(port,'127.0.0.1',()=>console.log(`Thinking Cap: ${origin} (microphone is OFF until enabled)`));
function stop(){chatgpt.cancelSignIn();if(process.platform==='win32'&&speechProcess.pid){spawnSync('taskkill',['/PID',String(speechProcess.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:5000});}else speechProcess.kill();wsServer.close();server.close();}
process.on('SIGINT',()=>{stop();process.exit();});process.on('SIGTERM',()=>{stop();process.exit();});
