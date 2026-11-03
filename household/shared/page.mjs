// Shared page behavior. No financial values or credentials pass through here.
const TIP_KEY='jjaemiz-home-tip-seen';
export function showOwnerNav(slot,current=false){
 const nav=document.querySelector('#home-nav');
 // Another account may sign in on the same tab, so a non-owner view removes the link.
 if(slot!=='me'){nav?.querySelector('[data-owner-link]')?.remove();return;}
 if(!nav||nav.querySelector('[data-owner-link]'))return;
 const link=document.createElement('a');link.href='../connect/';link.textContent='카드 연결';link.dataset.ownerLink='';
 if(current)link.setAttribute('aria-current','page');
 nav.append(link);
}
export function browserContext(agent=navigator.userAgent,standalone=navigator.standalone===true||matchMedia?.('(display-mode: standalone)').matches===true){
 const inApp=/KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|; wv\)/i.test(agent);
 const ios=/iPhone|iPad|iPod/.test(agent);
 return {inApp,standalone,safari:ios&&/Safari\//.test(agent)&&!/CriOS|FxiOS|EdgiOS/.test(agent)&&!inApp};
}
export function seenHomeTip(){try{return localStorage.getItem(TIP_KEY)==='1';}catch{return true;}}
export function markHomeTip(){try{localStorage.setItem(TIP_KEY,'1');}catch{/* A repeat tip is harmless. */}}
