export const validMonth=value=>typeof value==='string'&&/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(value);
export const currentKstMonth=(now=Date.now())=>new Date(now+9*3600000).toISOString().slice(0,7);
export function shiftMonth(value,delta){
 if(!validMonth(value)||!Number.isInteger(delta))return null;
 const [year,month]=value.split('-').map(Number);
 const next=new Date(Date.UTC(year,month-1+delta,1)).toISOString().slice(0,7);
 return validMonth(next)?next:null;
}
