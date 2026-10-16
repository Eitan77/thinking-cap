import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {CredentialEncryption} from '../vendor/siwc-local/src/types.js';
export type Memory={notes:string;enabled:boolean};
export class MemoryStore {
  constructor(private directory:string,private encryption:CredentialEncryption){}
  private path(profile:string){if(!/^[a-zA-Z0-9-]{1,100}$/.test(profile))throw new Error('Invalid memory profile');return join(this.directory,profile+'.json');}
  async read(profile:string):Promise<Memory>{
    try{const record=JSON.parse(await readFile(this.path(profile),'utf8'));const value=JSON.parse(await this.encryption.decrypt(Buffer.from(record.ciphertext,'base64')));if(typeof value.notes!=='string'||value.notes.length>6000||typeof value.enabled!=='boolean')throw new Error('Invalid saved memory');return value;}
    catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return{notes:'',enabled:false};throw e;}
  }
  async save(profile:string,value:Memory){
    if(typeof value.notes!=='string'||value.notes.length>6000||typeof value.enabled!=='boolean')throw new Error('Invalid memory');
    await mkdir(this.directory,{recursive:true});const target=this.path(profile),temporary=target+'.'+randomUUID()+'.tmp';
    const ciphertext=Buffer.from(await this.encryption.encrypt(JSON.stringify(value))).toString('base64');
    await writeFile(temporary,JSON.stringify({version:1,ciphertext}),{flag:'wx'});await rename(temporary,target);
  }
}
