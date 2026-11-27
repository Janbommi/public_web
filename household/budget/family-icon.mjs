// The public HTML always points to the standard icon. Member images live only
// in the current document until the user chooses to install a home-screen icon.
export function familyIconController(endpoint, getToken) {
  const touch = document.querySelector('link[rel="apple-touch-icon"]');
  const favicon = document.querySelector('link[rel="icon"]');
  const manifest = document.querySelector('link[rel="manifest"]');
  const defaults = [touch, favicon, manifest].map(link => link.getAttribute('href'));
  const manifestUrl = manifest.href;
  const android = /Android/i.test(navigator.userAgent);
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let session = new AbortController();
  let urls = [];
  let androidState = 'idle';
  let preferenceKey = null;
  let refreshControl = null;

  function reset() {
    session.abort();
    session = new AbortController();
    [touch, favicon, manifest].forEach((link,index) => link.setAttribute('href',defaults[index]));
    urls.forEach(url => URL.revokeObjectURL(url));
    urls = [];
    androidState = 'idle';
    preferenceKey = null;
    refreshControl = null;
  }

  function signedIn(context) {
    if (apple) void loadApple();
    if (!android || !context.householdId || !['me','partner'].includes(context.memberSlot)) return;
    preferenceKey = 'household.webIcon.'+context.householdId+'.'+context.memberSlot;
    try {
      if (localStorage.getItem(preferenceKey) === 'yes') void enableAndroid();
    } catch { /* The icon can still be enabled for this visit. */ }
  }

  async function png(size, token, signal) {
    const response = await fetch(endpoint,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal,
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({action:'photo',name:'web-icon-'+size+'.png'})});
    if (!response.ok || response.headers.get('Content-Type')?.split(';')[0] !== 'image/png') throw Error('icon');
    return response.blob();
  }

  async function loadApple() {
    if (!apple) return;
    const {signal} = session;
    try {
      const token = await getToken();
      if (!token || signal.aborted) return;
      const bytes = await png(180,token,signal);
      const dataUrl = await new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(Error('icon'));
        reader.readAsDataURL(bytes);
      });
      if (!signal.aborted) touch.href = dataUrl;
    } catch { /* A missing private icon leaves the public fallback in place. */ }
  }

  function localUrl(blob) {
    const url = URL.createObjectURL(blob);
    urls.push(url);
    return url;
  }

  async function enableAndroid(remember = false) {
    if (!android || androidState === 'loading' || androidState === 'ready') return;
    const {signal} = session;
    androidState = 'loading';
    try {
      const token = await getToken();
      if (!token || signal.aborted) throw Error('session');
      const [template, small, large] = await Promise.all([
        fetch(manifestUrl,{signal,credentials:'omit',redirect:'error'}).then(r => {
          if (!r.ok) throw Error('manifest');
          return r.json();
        }), png(192,token,signal), png(512,token,signal)
      ]);
      if (signal.aborted) return;
      const start = new URL(template.start_url,manifestUrl).href;
      const icons = [small,large].map((blob,i) => ({src:localUrl(blob),type:'image/png',sizes:i?'512x512':'192x192'}));
      const custom = {...template,id:new URL(template.id || start,manifestUrl).href,start_url:start,
        scope:new URL(template.scope,manifestUrl).href,icons};
      favicon.href = icons[0].src;
      manifest.href = localUrl(new Blob([JSON.stringify(custom)],{type:'application/manifest+json'}));
      androidState = 'ready';
      if (remember && preferenceKey) {
        try { localStorage.setItem(preferenceKey,'yes'); } catch { /* Session still works. */ }
      }
    } catch { if (!signal.aborted) androidState = 'error'; }
    finally { if (!signal.aborted) refreshControl?.(); }
  }

  function settings() {
    const section = document.createElement('section');
    section.className = 'j-funding';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'j-setting';
    button.dataset.familyIconEnable = '';
    const note = document.createElement('p');
    note.className = 'j-budget-note';
    note.setAttribute('role','status');
    function update() {
      button.textContent = androidState === 'ready' ? '사진 아이콘 준비됨' : androidState === 'loading' ? '아이콘 준비 중…' : '사진 아이콘 사용';
      button.disabled = androidState === 'loading' || androidState === 'ready';
      note.textContent = androidState === 'ready' ? 'Chrome 메뉴에서 홈 화면에 추가를 선택하세요.' :
        androidState === 'error' ? '사진을 불러오지 못했어요. 다시 시도해 주세요.' :
        'Chrome으로 설치하면 Google이 웹앱 설치 파일을 만들 때 사진 아이콘을 처리해요.';
    }
    button.addEventListener('click',async () => { const pending=enableAndroid(true); update(); await pending; update(); });
    section.append(button,note);
    refreshControl = update;
    update();
    return section;
  }
  return {reset,signedIn,android,settings};
}
