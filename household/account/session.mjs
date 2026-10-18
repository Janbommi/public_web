export const SESSION_KEY='household-auth-v1';

// Only Auth session data reaches this adapter; balances remain in memory.
export function createSessionStorage(getStorage,onUnavailable=()=>{}) {
  const memory=new Map();
  let remember=true,blocked=false;
  function unavailable(){remember=false;onUnavailable();}
  return {
    getItem(key){
      if(blocked)return null;
      if(remember){try{return getStorage().getItem(key);}catch{unavailable();}}
      return memory.get(key)??null;
    },
    setItem(key,value){
      if(blocked)return;
      memory.set(key,value);
      if(remember){try{getStorage().setItem(key,value);}catch{unavailable();}}
    },
    removeItem(key){
      memory.delete(key);
      // Remove only this application's Auth keys, never other apps' data.
      try{getStorage().removeItem(key);}catch{unavailable();}
    },
    choose(value){
      blocked=false;remember=value;
      if(!value)this.removeItem(SESSION_KEY);
    },
    detach(){
      // Preserve the session only in memory for server revocation, while
      // removing disk credentials before the first network await.
      const current=this.getItem(SESSION_KEY);
      if(current!==null)memory.set(SESSION_KEY,current);
      remember=false;
      let cleared=true;
      for(const key of [SESSION_KEY,SESSION_KEY+'-user',SESSION_KEY+'-code-verifier']){
        try{getStorage().removeItem(key);}catch{cleared=false;unavailable();}
      }
      return cleared;
    },
    forget(){
      blocked=true;memory.clear();
      let cleared=true;
      for(const key of [SESSION_KEY,SESSION_KEY+'-user',SESSION_KEY+'-code-verifier']){
        try{getStorage().removeItem(key);}catch{cleared=false;unavailable();}
      }
      return cleared;
    },
    get remembered(){return remember;}
  };
}

export async function endDeviceSession(auth,storage){
  storage.detach();
  let revoked=false;
  try{const {error}=await auth.signOut({scope:'local'});revoked=!error;}
  catch{/* Local removal must still happen if the network is unavailable. */}
  finally{try{await auth.stopAutoRefresh();}catch{/* Storage cleanup still runs. */}}
  return {revoked,cleared:storage.forget()};
}
