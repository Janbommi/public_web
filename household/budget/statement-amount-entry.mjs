import {escape,won} from './dashboard-domain.mjs?v=web22';
import {monthlyAmount} from './statement-page.mjs?v=web22';
import {statementRequest} from './statement-api.mjs?v=web22';

const firstMonth='2026-12';
const formalMonth=value=>/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(value)&&value>=firstMonth;
const validAmount=value=>Number.isSafeInteger(value)&&value>=0&&value<=1e12;
const uuid=value=>typeof value==='string'&&/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value);

export function mountAmountEntry(host,{cards,month,getToken,onExpired,onSaved}){
  host.innerHTML=`<form class="j-form j-statement j-amount-entry" novalidate>
    <div class="j-amount-scope"><label>내 카드<select name="card" required><option value="">카드 선택</option>${cards.map(card=>'<option value="'+escape(card.id)+'">'+escape(card.name)+'</option>').join('')}</select></label>
    <label>납부월<input name="month" type="month" min="${firstMonth}" max="2099-12" required></label></div>
    <p class="j-budget-note" data-current role="status"></p>
    <label>이번 달 할부 본인부담 합계(원)<input name="amount" type="text" inputmode="numeric" autocomplete="off" maxlength="17" placeholder="금액 입력" disabled></label>
    <p class="j-budget-note" data-help></p><p class="j-budget-note" data-preview hidden></p>
    <label class="j-statement-replace"><input name="checked" type="checkbox" disabled>이 카드의 이번 달 할부 합계를 확인했어요.</label>
    <p class="j-error" data-feedback role="status" hidden></p>
    <button type="submit" class="j-primary" disabled>할부금 저장</button>
    <button type="button" class="j-edit" data-reload hidden>다시 불러오기</button>
  </form>`;
  const form=host.querySelector('form');
  const {card,month:monthInput,amount,checked}=form.elements;
  const current=form.querySelector('[data-current]'),help=form.querySelector('[data-help]');
  const preview=form.querySelector('[data-preview]'),feedback=form.querySelector('[data-feedback]');
  const save=form.querySelector('[type=submit]'),reload=form.querySelector('[data-reload]');
  monthInput.value=formalMonth(month)?month:firstMonth;
  let state=null,requestId=null,controller=null,disposed=false,saving=false;
  function message(text='',success=false){
    feedback.className=success?'j-feedback':'j-error';
    feedback.textContent=text;feedback.hidden=!text;
  }
  function render(){
    const enabled=Boolean(state)&&!saving;
    amount.disabled=checked.disabled=!enabled;
    card.disabled=monthInput.disabled=saving;
    save.disabled=!enabled;
    save.textContent=saving?'저장하고 있어요':'할부금 저장';
    const value=monthlyAmount(amount.value.trim());
    preview.hidden=!state||value===null;
    if(state&&value!==null){
      const delta=value-state.appliedAmount;
      preview.textContent='저장 후 반영액 '+won(value)+' · '+(delta===0?'변동 없음':won(Math.abs(delta))+(delta>0?' 증가':' 감소'));
    }
    help.textContent=card.value==='samsung_happiness'?'바우처를 제외하고 직접 부담하는 할부 원금과 수수료만 입력해 주세요.':
      card.value==='samsung'?'회사 부담분을 제외하고 가계가 부담하는 할부 원금과 수수료만 입력해 주세요.':
      '납부월에 청구되는 할부 원금과 수수료의 전체 합계를 입력해 주세요. 일시불은 제외해 주세요.';
    if(state?.needsReview)help.textContent+=' 다른 소비 항목에 이미 반영된 할부금이 있으면 그 금액은 제외해 주세요.';
  }
  function showCurrent(){
    current.textContent=(state.amount===null?'아직 확정한 할부금이 없어요.':
      state.needsReview?'이전 금액을 다시 확인해야 해요. 현재 예산 반영액 '+won(state.appliedAmount):'현재 반영액 '+won(state.appliedAmount))+
      (state.pending?' 저장하면 이 카드·납부월의 판독 대기 건을 취소하고 입력한 합계를 반영해요.':'');
  }
  async function load(notice=''){
    controller?.abort();
    const local=new AbortController();controller=local;
    state=null;requestId=null;amount.value='';checked.checked=false;
    reload.hidden=true;message(notice);render();
    if(!formalMonth(monthInput.value)){current.textContent='2026년 12월 납부분부터 직접 입력할 수 있어요.';return;}
    if(!card.value){current.textContent='카드를 선택하면 현재 반영액을 확인할 수 있어요.';return;}
    current.textContent='현재 반영액을 확인하고 있어요.';
    const scope={p_card:card.value,p_month:monthInput.value};
    try{
      const token=await getToken();
      if(local.signal.aborted)return;
      const row=await statementRequest(token,'household_statement_manual_state',scope,local.signal);
      if(local.signal.aborted||disposed)return;
      if(row.card!==scope.p_card||row.month!==scope.p_month||row.testOnly!==false||
         !(row.latestId===null||uuid(row.latestId))||!(row.amount===null||validAmount(row.amount))||
         !validAmount(row.appliedAmount)||!Number.isSafeInteger(row.revision)||row.revision<0||
         typeof row.pending!=='boolean'||typeof row.needsReview!=='boolean')throw Error('scope');
      state=row;showCurrent();
    }catch(err){
      if(local.signal.aborted||disposed)return;
      if(err.status===401){onExpired();return;}
      current.textContent='현재 금액을 불러오지 못했어요.';reload.hidden=false;
    }finally{if(!local.signal.aborted&&!disposed)render();}
  }
  card.addEventListener('change',()=>void load());monthInput.addEventListener('change',()=>void load());
  reload.addEventListener('click',()=>void load());
  amount.addEventListener('input',()=>{requestId=null;checked.checked=false;message();render();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(saving||!state||disposed)return;
    const value=monthlyAmount(amount.value.trim());
    if(value===null||!checked.checked){
      message(value===null?'0원 이상의 할부 합계를 입력해 주세요.':'확인한 합계에 체크해 주세요.');
      (value===null?amount:checked).focus();return;
    }
    requestId??=crypto.randomUUID();
    const args={p_card:state.card,p_month:state.month,p_amount:value,p_expected_id:state.latestId,
      p_expected_revision:state.revision,p_request_id:requestId};
    const signal=controller.signal;
    saving=true;message();render();
    try{
      const token=await getToken();
      if(disposed)return;
      const result=await statementRequest(token,'household_statement_manual_save',args,signal);
      if(disposed)return;
      if(result.id!==requestId||result.card!==state.card||result.month!==state.month||
         result.amount!==value||result.status!=='confirmed'||result.budgetApplied!==true||
         result.revision!==state.revision+1)throw Error('receipt');
      state={...state,amount:value,appliedAmount:value,revision:result.revision,latestId:result.id,needsReview:false,pending:false};
      requestId=null;checked.checked=false;amount.value='';showCurrent();
      message('이 카드의 '+Number(state.month.slice(5))+'월 할부금 '+won(value)+'을 저장했어요.',true);onSaved?.();
    }catch(err){
      if(disposed)return;
      if(err.status===401){onExpired();return;}
      if(err.status===409){await load('다른 곳에서 금액이 바뀌었어요. 최신 반영액을 확인하고 다시 입력해 주세요.');}
      else message('저장 여부를 확인하지 못했어요. 같은 금액으로 다시 저장해 주세요.');
    }finally{if(!disposed){saving=false;render();}}
  });
  void load();
  return {dispose(){disposed=true;controller?.abort();host.replaceChildren();}};
}
