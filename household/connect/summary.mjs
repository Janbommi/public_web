export function hanaSummaryText(summary){
 if(!summary||!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(summary.month??''))return '집계 상태를 새로고침해 주세요.';
 if(summary.net===null)return summary.month+' · 아직 서버에 반영된 금액이 없습니다. 미수집을 0원 지출로 계산하지 않습니다.';
 if(!Number.isSafeInteger(summary.net))return '합계를 확인하지 못했습니다. 다시 새로고침해 주세요.';
 return summary.month+' · 수집된 일시불 승인 합계 '+new Intl.NumberFormat('ko-KR').format(summary.net)+'원 · 미분류 / 일부 수집';
}

export function hanaSummaryDisplay(summary){
 const valid=summary&&/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(summary.month??'');
 if(!valid)return {amount:'—',caption:'집계를 불러오는 중이거나 확인이 필요합니다.'};
 if(summary.net===null)return {amount:'아직 수집 전',caption:'미수집은 0원 지출을 뜻하지 않습니다.'};
 if(!Number.isSafeInteger(summary.net))return {amount:'확인 필요',caption:'합계를 다시 불러와 주세요.'};
 return {amount:new Intl.NumberFormat('ko-KR').format(summary.net)+'원',caption:'서버에 반영된 승인 금액'};
}
