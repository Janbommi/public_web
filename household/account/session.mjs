export const SESSION_KEY='household-own-session-v1';

const tabStorage=()=>{try{return globalThis.sessionStorage??null;}catch{return null;}};
// Only Auth session data reaches this adapter; balances remain in memory.
// An unremembered login stays in this tab's storage so menu navigation keeps it.
export function createSessionStorage(getStorage,onUnavailable=()=>{},getTab=tabStorage) {
  const memory=new Map();
  let remember=true,blocked=false,detached=false;
  function unavailable(){remember=false;onUnavailable();}
  const tab={
    get(key){try{return getTab()?.getItem(key)??null;}catch{return null;}},
    set(key,value){try{getTab()?.setItem(key,value);}catch{/* Memory still holds it. */}},
    remove(key){try{getTab()?.removeItem(key);return true;}catch{return false;}}
  };
  if(tab.get(SESSION_KEY)!==null)remember=false;
  return {
    getItem(key){
      if(blocked)return null;
      if(remember){try{return getStorage().getItem(key);}catch{unavailable();}}
      return memory.get(key)??tab.get(key);
    },
    setItem(key,value){
      if(blocked)return;
      memory.set(key,value);
      if(detached)return;
      if(remember){try{getStorage().setItem(key,value);return;}catch{unavailable();}}
      tab.set(key,value);
    },
    removeItem(key){
      memory.delete(key);tab.remove(key);
      // Remove only this application's Auth keys, never other apps' data.
      try{getStorage().removeItem(key);}catch{unavailable();}
    },
    choose(value){
      blocked=false;detached=false;remember=value;
      if(!value)try{getStorage().removeItem(SESSION_KEY);}catch{unavailable();}
      else tab.remove(SESSION_KEY);
    },
    detach(){
      // Preserve the session only in memory for server revocation, while
      // removing disk credentials before the first network await.
      const current=this.getItem(SESSION_KEY);
      if(current!==null)memory.set(SESSION_KEY,current);
      remember=false;detached=true;
      let cleared=true;
      for(const key of [SESSION_KEY,SESSION_KEY+'-user',SESSION_KEY+'-code-verifier']){
        if(!tab.remove(key))cleared=false;
        try{getStorage().removeItem(key);}catch{cleared=false;unavailable();}
      }
      return cleared;
    },
    forget(){
      blocked=true;memory.clear();
      let cleared=true;
      for(const key of [SESSION_KEY,SESSION_KEY+'-user',SESSION_KEY+'-code-verifier']){
        if(!tab.remove(key))cleared=false;
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
export function logoutMessage({cleared,revoked}){
 if(!cleared)return '이 기기의 로그인 정보를 완전히 지우지 못했어요. 브라우저에서 이 사이트 데이터를 삭제해 주세요.'+(revoked?'':' 서버 로그아웃도 확인하지 못했어요.');
 return revoked?'이 기기에서 로그아웃했어요.':'이 기기의 로그인 정보는 지웠지만 서버에서 로그아웃됐는지는 확인하지 못했어요.';
}
