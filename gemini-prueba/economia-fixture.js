/* Public controlled records only: April–October 2026; no reads from storage or Firestore. */
(function(root){
 const C=root.HorasCore||(typeof require==='function'?require('../controlHoras/core.js'):null);
 function create(){
  const config={userName:'',rateNormal:10,plusFestivo:5,rateExtra:20,profile:'ett',sintaxUnlocked:false,hideMoney:false,deductions:[{id:'fictitious-irpf',name:'IRPF',pct:10}]},data={};
  for(let m=4;m<=10;m++)data['2026-'+String(m).padStart(2,'0')]={days:{1:{type:'normal',hours:m}},rateConfig:C.financial(config),historicalStatus:'confirmed'};
  data['2026-07'].payroll={...C.emptyPayroll(),gross:110,deductionsTotal:10,net:100,deductions:{irpf:{name:'IRPF',kind:'irpf',base:110,pct:null,amount:10}}};
  return {config,data};
 }
 root.HorasEconomiaFixture={create};if(typeof module!=='undefined')module.exports={create};
})(typeof globalThis!=='undefined'?globalThis:this);
