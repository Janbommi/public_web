import {escape,won} from './dashboard-domain.mjs?v=web22';
import {mountStatementPage,statementFileError,monthlyAmount} from './statement-page.mjs?v=web22';
import {confirmStatementAmount,getStatementStatus} from './statement-api.mjs?v=web22';
import {getStatementInbox,uploadStatementInbox} from './statement-auto-api.mjs?v=web22';
import {mountAmountEntry} from './statement-amount-entry.mjs?v=web23';

const reasons={
  protected_pdf:'암호가 걸린 PDF예요. 잠금을 해제한 파일로 다시 올려 주세요.',
  unsupported_layout:'이 파일에서 필요한 내용을 읽지 못했어요. 선명한 PDF나 사진으로 다시 올려 주세요.',
  amount_unclear:'이번 달 할부 원금과 수수료 합계를 명확히 확인하지 못했어요.',
  ocr_review:'사진에서 읽은 금액은 후보예요. 원본의 카드·납부월·할부금을 확인해 주세요.',
  invalid_document:'파일을 읽을 수 없어요. PDF나 이미지가 정상적으로 열리는지 확인해 주세요.',
  owner_mismatch:'로그인한 사람의 카드와 맞지 않아요. 명세서 소유자 계정으로 올려 주세요.',
  card_unavailable:'현재 이 계정에서 사용할 수 없는 카드예요. 내 카드 연결을 확인해 주세요.',
  manual_review_required:'기존 명세서나 보정한 금액이 있어요. 이번에 추가로 반영할 할부금을 원본에서 확인해 주세요.',
  image_review:'사진은 원본에서 카드·납부월·할부금을 확인해 주세요.',
  encrypted_pdf:'암호가 걸린 PDF예요. 잠금을 해제한 파일로 다시 올려 주세요.',
  locked_pdf:'암호가 걸린 PDF예요. 잠금을 해제한 파일로 다시 올려 주세요.',
  unreadable:'문서에서 필요한 내용을 읽지 못했어요. 선명한 PDF나 사진으로 다시 올려 주세요.',
  unsupported_format:'이 문서 형식은 자동으로 읽을 수 없어요. 다른 형식으로 다시 올려 주세요.',
  unsupported_card:'어떤 카드의 명세서인지 확인하지 못했어요. 카드와 납부월을 직접 지정할 수 있어요.',
  card_unknown:'어떤 카드의 명세서인지 확인하지 못했어요. 카드와 납부월을 직접 지정할 수 있어요.',
  card_ambiguous:'카드가 여러 장이거나 상품명이 불명확해요. 카드별 명세서로 나눠 올려 주세요.',
  month_unknown:'납부월을 확인하지 못했어요. 명세서에 적힌 납부월을 직접 지정할 수 있어요.',
  month_ambiguous:'납부월이 하나로 확인되지 않아요. 해당 달의 명세서만 다시 올려 주세요.',
  amount_unknown:'이번 달 할부 원금과 수수료 합계를 확인하지 못했어요.',
  amount_ambiguous:'할부 합계가 불명확해요. 원본의 이번 회차 원금과 수수료를 확인해 주세요.',
  own_share_required:'가계에서 부담하는 할부금인지 원본을 보고 확인해 주세요.',
  voucher_review:'바우처를 제외한 할부 본인부담액을 확인해 주세요.',
  partial_statement:'일부 내역만 담긴 명세서일 수 있어요. 해당 카드·납부월의 전체 자료를 확인해 주세요.',
  adjusted_statement:'취소·정정 금액이 함께 있어요. 중복으로 반영되지 않도록 원본을 확인해 주세요.',
  duplicate_scope:'같은 카드·납부월에 다른 명세서가 있어요. 최신 자료와 할부 합계를 확인해 주세요.',
  ocr_candidate:'사진에서 읽은 금액은 후보예요. 원본을 보고 확인해 주세요.',
};

export function inboxReason(reason) {
  return reasons[reason] ?? '자동으로 확인하지 못한 항목이 있어요. 원본을 확인하거나 카드와 납부월을 직접 지정해 주세요.';
}

export function inboxStatus(item) {
  if (item.budgetApplied===true&&item.testOnly===false) return '확정한 할부금을 예산에 반영했어요';
  if (item.status==='pending') return '접수 완료 · 카드와 납부월 확인 중';
  if (item.status==='confirmed') return item.testOnly===true ? '운영 테스트 판독 완료 · 예산 미반영' : '판독 완료 · 현재 예산 미반영';
  if (item.status==='needs_review') return item.testOnly===true ? '확인 필요 · 예산 미반영' : '확인 필요 · 예산 반영 전';
  if (item.status==='superseded') return '새 명세서로 대체됐어요';
  return '처리 상태 확인 필요';
}

export function canConfirmInbox(item) {
  return item.testOnly===false&&!item.budgetApplied&&item.status==='needs_review'&&Boolean(item.card&&item.month>='2026-12'&&item.uploadId)&&Number.isSafeInteger(item.revision)&&item.revision>=0;
}

function receivedText(item) {
  const date=new Date(item.createdAt??'');
  const at=Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date):'';
  return [item.source==='gmail'?'메일에서 접수':'웹에서 접수',at,item.attempt>1?'재판독 '+item.attempt+'회차':''].filter(Boolean).join(' · ');
}

function uploadError(error) {
  if (error.status===413) return '5MiB 이하의 파일을 다시 선택해 주세요.';
  if (error.status===415) return 'PDF, PNG 또는 JPEG 파일인지 확인해 주세요.';
  if (error.status===403) return '이 계정으로 접수할 수 있는 명세서인지 확인해 주세요.';
  if (error.status===409) return '접수 결과가 바뀌었어요. 상태를 새로고침한 뒤 다시 시도해 주세요.';
  if (error.status===429) return '잠시 요청이 많아요. 조금 뒤 이 파일만 다시 시도해 주세요.';
  if (error.status===400||error.status===422) return '선택한 파일을 확인해 주세요. 재시험은 같은 원본 파일을 다시 선택해야 해요.';
  if (error.status===503) return '업로드를 준비 중이거나 일시적으로 연결되지 않아요. 잠시 뒤 다시 시도해 주세요.';
  return '접수 여부를 확인하지 못했어요. 이 파일만 다시 시도하면 같은 접수를 확인해요.';
}

export function mountAutoStatementPage(host,options) {
  host.innerHTML=`<button class="j-back" data-go="home" type="button">← 내 카드</button>
    <h1 class="j-title">명세서 올리기</h1>
    <p class="j-subtitle">파일을 먼저 올려 주세요.<br>카드와 납부월은 명세서에서 확인해요.</p>
    <div class="j-statement-inbox">
      <section class="j-inbox-upload" aria-labelledby="inbox-upload-title">
        <h2 id="inbox-upload-title">여러 장도 한 번에</h2>
        <label for="statement-auto-files" class="j-file-picker"><span>PDF·사진 선택해 올리기</span>
          <input id="statement-auto-files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" aria-label="명세서 파일 여러 개 선택" disabled></label>
        <p>파일을 고르면 바로 접수해요. PDF, PNG, JPEG · 파일당 최대 5MiB</p>
        <p data-inbox-ready role="status">접수 준비를 확인하고 있어요.</p>
      </section>
      <details class="j-inbox-manual j-amount-disclosure" data-amount-entry><summary>파일 없이 할부금 직접 입력</summary><div data-amount-host></div></details>
      <p class="j-inbox-note">2026년 12월부터 확인된 할부금을 예산에 반영해요. 11월까지의 과거 명세서는 운영 테스트로 처리하며 예산에 반영하지 않아요.</p>
      <div class="j-inbox-heading"><h2>파일별 접수 결과</h2><button type="button" data-inbox-refresh>상태 새로고침</button></div>
      <p class="j-error" data-inbox-error role="alert" hidden></p>
      <p class="j-inbox-summary" data-inbox-summary role="status"></p>
      <ol class="j-inbox-list" data-inbox-list></ol>
      <p class="j-inbox-empty" data-inbox-empty>아직 접수한 명세서가 없어요.<br>명세서 파일을 고르면 여기에서 진행 상황을 볼 수 있어요.</p>
      <input type="file" data-inbox-retry-file accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" aria-label="같은 명세서 파일을 다시 선택" hidden>
      <details class="j-inbox-manual" data-statement-manual-entry><summary>카드·납부월을 지정해 파일 올리기</summary><div data-inbox-manual></div></details>
    </div>`;
  const chooser=host.querySelector('#statement-auto-files'),list=host.querySelector('[data-inbox-list]');
  const ready=host.querySelector('[data-inbox-ready]'),refresh=host.querySelector('[data-inbox-refresh]');
  const error=host.querySelector('[data-inbox-error]'),summary=host.querySelector('[data-inbox-summary]');
  const retryChooser=host.querySelector('[data-inbox-retry-file]'),details=host.querySelector('[data-statement-manual-entry]');
  const entries=new Map(),local=[],names=new Map(),active=new Set();
  let closed=false,available=false,refreshing=false,request=0,mutation=0,sequence=0,retryTarget=null,manualPage=null;
  let confirmTarget=null,confirmItem=null,confirmDraft='',confirmChecked=false,confirmError='',confirmBusy=false;
  let comparison=null;
  const amountDetails=host.querySelector('[data-amount-entry]');
  let amountPage=null;
  amountDetails.addEventListener('toggle',()=>{
    if(closed)return;
    if(amountDetails.open&&!amountPage)amountPage=mountAmountEntry(host.querySelector('[data-amount-host]'),{...options,onSaved:()=>void load()});
    if(!amountDetails.open&&amountPage){amountPage.dispose();amountPage=null;}
  });
  let listController;
  const safe=()=>!closed&&host.isConnected;
  const expired=()=>{if(safe())options.onExpired();};
  const lookupCard=key=>options.cards.find(card=>card.id===key)?.name??'';
  function warn(text=''){error.textContent=text;error.hidden=!text;}
  function remember(item){
    if(item.budgetApplied)for(const [id,previous] of entries){
      if(id!==item.id&&previous.card===item.card&&previous.month===item.month)entries.set(id,{...previous,budgetApplied:false,confirmedAmount:null});
    }
    entries.set(item.id,item);
  }
  function render(){
    if(!safe())return;
    const jobs=local.filter(job=>!job.receipt),stored=[...entries.values()];
    chooser.disabled=!available;
    refresh.disabled=refreshing||Boolean(confirmTarget);
    ready.textContent=refreshing&&!available?'접수 준비를 확인하고 있어요.':available?'파일별로 접수하고 처리 결과를 알려드려요.':'업로드 준비 중이에요. 잠시 뒤 상태를 새로고침해 주세요.';
    summary.textContent=confirmBusy?'원본에서 확인한 할부금을 저장하고 있어요.':active.size?`파일 ${active.size}개를 보내고 있어요. 다른 파일도 이어서 접수해요.`:jobs.some(job=>job.status==='queued')?(available?'선택한 파일을 차례로 접수하고 있어요.':'상태를 새로고침하면 대기 중인 파일을 이어서 접수해요.'):stored.length?`접수된 파일 ${stored.length}개 · 새로고침으로 최신 결과를 확인할 수 있어요.`:'';
    host.querySelector('[data-inbox-empty]').hidden=Boolean(jobs.length||stored.length);
    list.innerHTML=jobs.map(job=>`<li class="j-inbox-item" data-state="${job.status}" data-local-id="${job.key}">
      <h3>${escape(job.name)}</h3><p class="j-inbox-status">${job.status==='queued'?'전송 대기':job.status==='sending'?'암호화해 보내는 중':job.file?'접수 확인 필요':'접수하지 못했어요'}</p>
      ${job.error?'<p class="j-inbox-reason">'+escape(job.error)+'</p>':''}
      ${job.status==='error'&&job.file?'<button class="j-edit" type="button" data-inbox-send-again="'+job.key+'">이 파일 다시 시도</button>':''}</li>`).join('')+
      stored.map(item=>{
        const card=lookupCard(item.card),month=/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(item.month??'')?item.month.replace('-','년 ')+'월':'';
        const name=names.get(item.id)||[card,month].filter(Boolean).join(' · ')||'접수한 명세서';
        const known=Number.isSafeInteger(item.readAmount)&&item.readAmount>=0;
        const money=known?(item.status==='confirmed'?'읽은 할부금 ':'읽은 후보 금액 ')+won(item.readAmount):'';
        return `<li class="j-inbox-item" data-state="${item.status}" data-receipt-id="${escape(item.id)}"><h3>${escape(name)}</h3>
          <p class="j-inbox-status">${escape(inboxStatus(item))}</p>
          <p class="j-inbox-meta">${escape(receivedText(item))}</p>
          <p class="j-inbox-meta">${card?'<span>'+escape(card)+'</span>':''}${month?'<span>납부월 '+escape(month)+'</span>':''}${money?'<span>'+escape(money)+'</span>':''}${item.budgetApplied&&Number.isSafeInteger(item.confirmedAmount)?'<span>예산 반영액 '+won(item.confirmedAmount)+'</span>':''}</p>
          ${item.status==='needs_review'?'<p class="j-inbox-reason">'+escape(inboxReason(item.reason))+'</p>':''}
          ${canConfirmInbox(item)?'<button class="j-edit" type="button" data-inbox-confirm-open="'+escape(item.id)+'">원본 보고 할부금 확인</button>':item.status==='needs_review'&&item.testOnly!==true?'<button class="j-edit" type="button" data-inbox-manual-open>파일 없이 할부금 직접 입력</button>':''}
          ${item.status!=='pending'&&item.status!=='superseded'?'<button class="j-edit" type="button" data-inbox-retry="'+escape(item.id)+'">같은 파일로 다시 판독하기</button>':''}
          ${item.duplicate?'<p class="j-budget-note">이미 접수한 파일이에요. 기존 결과를 보여드려요.</p>':''}
          ${confirmTarget===item.id?`<form class="j-form j-statement j-inbox-confirm" data-inbox-confirm-form>
            <label for="inbox-confirm-amount">이번 달 할부 본인부담 합계(원)<input id="inbox-confirm-amount" type="text" inputmode="numeric" autocomplete="off" maxlength="17" value="${escape(confirmDraft)}"${confirmBusy?' disabled':''}></label>
            <p class="j-budget-note" data-inbox-comparison aria-live="polite"></p>
            <p class="j-budget-note">${escape(card)} · ${escape(month)}. 원본에서 이번 회차의 할부 원금과 수수료를 확인하고, 이 카드의 전체 할부 합계를 입력해 주세요.</p>
            <label class="j-statement-replace"><input id="inbox-confirm-check" type="checkbox"${confirmChecked?' checked':''}${confirmBusy?' disabled':''}>일시불·바우처·취소분과 다른 소비 항목에 이미 반영된 금액을 제외했어요.</label>
            <p class="j-error" data-inbox-confirm-error role="alert">${escape(confirmError)}</p>
            <button class="j-primary" type="submit"${confirmBusy||!comparison?.ready?' disabled':''}>${confirmBusy?'확인한 금액을 저장하고 있어요':'이 금액으로 예산 반영'}</button>
            <button class="j-edit" type="button" data-inbox-confirm-close${confirmBusy?' disabled':''}>닫기</button>
          </form>`:''}</li>`;
      }).join('');
    updateComparison();
  }
  function updateComparison(){
    const note=host.querySelector('[data-inbox-comparison]');
    if(!note||!comparison)return;
    const next=monthlyAmount(confirmDraft.trim());
    note.textContent=comparison.error||(!comparison.ready?'현재 반영액을 확인하고 있어요.':
      (comparison.amount===null?'아직 반영된 할부금이 없어요.':'현재 반영액 '+won(comparison.amount)+' ·')+
      (next===null?' 이번 달 합계를 입력해 주세요.':' 확인 후 반영액 '+won(next)));
    note.closest('form').querySelector('[type=submit]').disabled=confirmBusy||!comparison.ready;
  }
  async function compareAmount(item,request){
    const controller=new AbortController();
    active.add(controller);
    try{
      const token=await options.getToken();
      if(!safe()||comparison!==request)return;
      const state=await getStatementStatus({token,card:item.card,month:item.month,signal:controller.signal});
      if(!safe()||comparison!==request)return;
      if(state.version!==item.uploadId||state.revision!==item.revision)
        throw Object.assign(Error('changed'),{status:409});
      if(state.amount!==null&&(!Number.isSafeInteger(state.amount)||state.amount<0||state.amount>1e12))throw Error('amount');
      request.amount=state.suspended?null:state.amount;
      request.ready=true;
    }catch(err){
      if(!safe()||comparison!==request)return;
      if(err.status===401){expired();return;}
      request.error=err.status===409?'명세서가 바뀌었어요. 닫고 상태를 새로고침해 주세요.':'현재 반영액을 확인하지 못했어요. 닫고 다시 열어 주세요.';
    }finally{
      active.delete(controller);
      if(safe()&&comparison===request){updateComparison();pump();}
    }
  }
  async function load(){
    if(!safe()||refreshing||confirmTarget)return;
    refreshing=true;const thisRequest=++request,startedMutation=mutation;
    listController?.abort();listController=new AbortController();render();warn();
    try{
      const token=await options.getToken();if(!safe()||thisRequest!==request)return;
      const data=await getStatementInbox({token,signal:listController.signal});
      if(!safe()||thisRequest!==request||startedMutation!==mutation||confirmTarget)return;
      available=data.available;
      entries.clear();
      for(const item of data.items)remember(item);
    }catch(err){
      if(!safe()||thisRequest!==request||confirmTarget)return;
      if(err.status===401){expired();return;}
      available=false;warn('접수 상태를 확인하지 못했어요. 상태를 새로고침해 주세요. 이미 보이는 결과는 마지막으로 확인한 내용이에요.');
    }finally{if(safe()&&thisRequest===request){refreshing=false;render();pump();}}
  }
  function addFile(file,retryOf=null){
    const reason=statementFileError(file);
    local.push({key:String(++sequence),name:file.name||'선택한 명세서',file:reason?null:file,retryOf,status:reason?'error':'queued',error:reason});
  }
  function pump(){
    if(!safe()||!available)return;
    while(active.size<2){
      const job=local.find(item=>item.status==='queued');if(!job)break;
      const controller=new AbortController();job.status='sending';active.add(controller);render();
      void (async()=>{
        try{
          const token=await options.getToken();if(!safe())return;
          const receipt=await uploadStatementInbox({token,file:job.file,retryOf:job.retryOf,signal:controller.signal});
          if(!safe())return;
          mutation++;
          if(job.retryOf&&job.retryOf!==receipt.id){entries.delete(job.retryOf);names.delete(job.retryOf);}
          remember(receipt);names.set(receipt.id,job.name);job.receipt=receipt.id;job.file=null;
        }catch(err){
          if(!safe())return;
          if(err.status===401){expired();return;}
          job.status='error';job.error=uploadError(err);
          if([400,403,413,415,422].includes(err.status))job.file=null;
        }finally{
          active.delete(controller);
          if(safe()){render();pump();}
        }
      })();
    }
  }
  chooser.addEventListener('change',()=>{
    if(!available||closed)return;
    for(const file of Array.from(chooser.files??[]))addFile(file);
    chooser.value='';warn();render();pump();
  });
  retryChooser.addEventListener('change',()=>{
    const file=retryChooser.files?.[0];
    if(file&&retryTarget&&available){addFile(file,retryTarget);render();pump();}
    retryChooser.value='';retryTarget=null;
  });
  list.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||closed)return;
    if(button.hasAttribute('data-inbox-send-again')){
      const job=local.find(item=>item.key===button.dataset.inboxSendAgain);
      if(job?.file&&job.status==='error'){job.status='queued';job.error='';render();pump();}
    }else if(button.hasAttribute('data-inbox-retry')){
      if(!available){warn('먼저 상태를 새로고침한 뒤 다시 시도해 주세요.');return;}
      retryTarget=button.dataset.inboxRetry;retryChooser.click();
    }else if(button.hasAttribute('data-inbox-manual-open')){
      amountDetails.open=true;amountDetails.querySelector('summary').focus();amountDetails.scrollIntoView({block:'start',behavior:'smooth'});
    }else if(button.hasAttribute('data-inbox-confirm-open')){
      const item=entries.get(button.dataset.inboxConfirmOpen);
      if(!item||!canConfirmInbox(item)||!lookupCard(item.card))return;
      comparison={ready:false,amount:null};
      confirmTarget=item.id;confirmItem={...item};confirmDraft=item.readAmount===null?'':String(item.readAmount);confirmChecked=false;confirmError='';render();
      void compareAmount(item,comparison);
      host.querySelector('#inbox-confirm-amount')?.focus();
    }else if(button.hasAttribute('data-inbox-confirm-close')){
      if(confirmBusy)return;comparison=null;confirmTarget=null;confirmItem=null;confirmDraft='';confirmChecked=false;confirmError='';render();
    }
  });
  list.addEventListener('input',event=>{if(event.target.id==='inbox-confirm-amount'){confirmDraft=event.target.value;updateComparison();}});
  list.addEventListener('change',event=>{if(event.target.id==='inbox-confirm-check')confirmChecked=event.target.checked;});
  list.addEventListener('submit',event=>{
    if(!event.target.matches('[data-inbox-confirm-form]'))return;
    event.preventDefault();
    const item=confirmItem,value=monthlyAmount(confirmDraft.trim());
    if(!item||!canConfirmInbox(item)||confirmBusy||!comparison?.ready)return;
    if(value===null||!confirmChecked){confirmError=value===null?'0원 이상의 할부 합계를 입력해 주세요.':'원본과 제외할 금액을 확인하고 체크해 주세요.';render();host.querySelector(value===null?'#inbox-confirm-amount':'#inbox-confirm-check')?.focus();return;}
    confirmBusy=true;confirmError='';render();
    const controller=new AbortController();active.add(controller);
    void (async()=>{
      try{
        const token=await options.getToken();if(!safe())return;
        const result=await confirmStatementAmount({token,card:item.card,month:item.month,expectedVersion:item.uploadId,revision:item.revision,amount:value,signal:controller.signal});
        if(!safe())return;
        if(result.status!=='confirmed'||result.amount!==value||result.version!==item.uploadId)throw Object.assign(Error('changed'),{status:409});
        mutation++;remember({...item,status:'confirmed',budgetApplied:true,confirmedAmount:value,revision:result.revision});
        confirmTarget=null;confirmItem=null;confirmDraft='';confirmChecked=false;
      }catch(err){
        if(!safe())return;
        if(err.status===401){expired();return;}
        confirmError=err.status===409?'명세서가 바뀌었어요. 닫고 상태를 새로고침한 뒤 확인해 주세요.':'반영 여부를 확인하지 못했어요. 같은 금액으로 다시 시도할 수 있어요.';
      }finally{active.delete(controller);confirmBusy=false;if(safe()){render();pump();}}
    })();
  });
  details.addEventListener('toggle',()=>{
    if(closed)return;
    if(details.open&&!manualPage)manualPage=mountStatementPage(host.querySelector('[data-inbox-manual]'),{...options,embedded:true});
    else if(!details.open&&manualPage){manualPage.dispose();manualPage=null;host.querySelector('[data-inbox-manual]').replaceChildren();}
  });
  refresh.addEventListener('click',()=>void load());
  void load();
  return {
    refreshPending(){if(!closed){manualPage?.refreshPending();if(!active.size&&!confirmTarget)void load();}},
    dispose(){closed=true;request++;listController?.abort();for(const controller of active)controller.abort();for(const job of local)job.file=null;local.length=0;entries.clear();names.clear();retryTarget=null;chooser.value='';retryChooser.value='';manualPage?.dispose();manualPage=null;amountPage?.dispose();amountPage=null;}
  };
}
