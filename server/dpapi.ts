import {spawn} from 'node:child_process';
import type {CredentialEncryption} from '../vendor/siwc-local/src/types.js';

function dpapi(input:string, decrypt:boolean):Promise<string> {
  if(process.platform!=='win32')throw new Error('This demo requires Windows DPAPI.');
  // Secrets travel on private stdin/stdout pipes, never arguments, files, or logs.
  const script = `Add-Type -AssemblyName System.Security; $data=[Console]::In.ReadToEnd(); $bytes=[Convert]::FromBase64String($data); $out=[Security.Cryptography.ProtectedData]::${decrypt?'Unprotect':'Protect'}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($out))`;
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('Windows credential protection timed out.'));},15000);
    child.stdout.on('data',b=>output+=b.toString());child.stderr.resume();
    child.on('error',()=>{clearTimeout(timer);reject(new Error('Windows credential protection could not start.'));});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(output.trim()):reject(new Error('Windows credential protection failed.'));});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
export const encryption:CredentialEncryption={
  id:'thinking-cap-windows-dpapi-v1',isAvailable:()=>process.platform==='win32',
  async encrypt(text){return Buffer.from(await dpapi(Buffer.from(text).toString('base64'),false),'base64');},
  async decrypt(bytes){return Buffer.from(await dpapi(Buffer.from(bytes).toString('base64'),true),'base64').toString('utf8');}
};
