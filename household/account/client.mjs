// Narrow client for the household's email-free server session API.
// Every request validates the opaque session on the server. No finance data is persisted.
export function createClient(base,_publishable,{auth:options={},global:globalOptions={}}={}){
 const endpoint=base+'/functions/v1/household-login',storage=options.storage,key=options.storageKey;
 const fetcher=globalOptions.fetch??fetch,listeners=new Set();let epoch=0,session=null;
 const emit=(event)=>{for(const callback of listeners)callback(event,session);};
 const valid=s=>s&&/^[0-9a-f]{64}$/.test(s.access_token)&&typeof s.user?.id==='string'&&Number.isFinite(s.expires_at);
 function read(){
  if(session)return session;
  try{const saved=JSON.parse(storage.getItem(key));if(valid(saved))session=saved;else storage.removeItem(key);}catch{storage.removeItem(key);}
  return session;
 }
 function clear(){epoch++;session=null;storage.removeItem(key);emit('SIGNED_OUT');}
 function save(value){session=value;storage.setItem(key,JSON.stringify(value));}
 // Retire this app's previous SDK session without touching other origin data.
 for(const old of ['household-auth-v1','household-auth-v1-user','household-auth-v1-code-verifier'])storage.removeItem(old);
 globalThis.addEventListener?.('storage',event=>{if(event.key===null||(event.key===key&&event.newValue===null)){epoch++;session=null;emit('SIGNED_OUT');}});
 async function request(body,token,signal){
  try{
   const response=await fetcher(endpoint,{method:'POST',cache:'no-store',credentials:'omit',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),
    headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
   const value=await response.json();
   return response.ok?{data:Object.hasOwn(value,'data')?value.data:value,status:response.status,error:null}:{data:null,status:response.status,error:{status:response.status,code:value.error?.code??value.error??'request'}};
  }catch{return {data:null,status:0,error:{status:0,code:'network'}};}
 }
 const auth={
  onAuthStateChange(callback){listeners.add(callback);return {data:{subscription:{unsubscribe(){listeners.delete(callback);}}}};},
  async signInWithUsername({username,password}){
   const e=++epoch;const result=await request({action:'login',username,password});
   if(e!==epoch){
    if(valid(result.data?.session))await request({action:'logout'},result.data.session.access_token);
    return {data:null,error:{status:401}};
   }
   const value=result.data?.session;
   if(result.error)return result;
   if(!valid(value))return {data:null,error:{status:0}};
   save(value);emit('SIGNED_IN');return {data:{session:value},error:null};
  },
  async getSession(){
   const current=read();if(!current)return {data:{session:null},error:null};
   const e=epoch;const result=await request({action:'session'},current.access_token);
   if(e!==epoch)return {data:{session:null},error:null};
   if(result.status===401){clear();return {data:{session:null},error:result.error};}
   if(result.error)return {data:{session:null},error:result.error};
   const value={...result.data,access_token:current.access_token};
   if(!valid(value))return {data:{session:null},error:{status:0}};
   save(value);return {data:{session:value},error:null};
  },
  async signOut(){const token=read()?.access_token;clear();if(!token)return {error:null};const result=await request({action:'logout'},token);return {error:result.status===401?null:result.error};},
  // Sliding expiry is refreshed by every server operation, without background refresh tokens.
  async startAutoRefresh(){},async stopAutoRefresh(){}
 };
 function rpc(name,args={}){
  let signal,promise;
  const execute=async()=>{
   const current=read();if(!current)return {data:null,status:401,error:{code:'session_expired'}};
   const e=epoch;const result=await request({action:'rpc',name,args},current.access_token,signal);
   if(e!==epoch)return {data:null,status:401,error:{code:'session_expired'}};
   if(result.status===401)clear();return result;
  };
  return {abortSignal(value){signal=value;return this;},then(resolve,reject){promise??=execute();return promise.then(resolve,reject);}};
 }
 return {auth,rpc};
}
