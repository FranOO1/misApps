/* Public fixed fictitious records. No storage, Firestore, accounts or user documents. */
(function(root){
 const C=root.HorasCore||(typeof require==='function'?require('../controlHoras/core.js'):null);
 function create(){
  const config={userName:'',rateNormal:10,plusFestivo:5,rateExtra:20,profile:'ett',sintaxUnlocked:false,hideMoney:false,deductions:[{id:'fictitious-irpf',name:'IRPF',pct:10}]};
  const month=days=>({days,rateConfig:C.financial(config),historicalStatus:'confirmed'});
  const data={'2025-08':month({1:{type:'normal',hours:4},2:{type:'festivo',hours:1}}),'2026-08':month({1:{type:'normal',hours:8},2:{type:'festivo',hours:2},3:{type:'descanso',hours:0}}),'2026-09':month({1:{type:'normal',hours:12},2:{type:'festivo',hours:3},3:{type:'descanso',hours:0}}),'2026-10':month({1:{type:'normal',hours:5}})};
  data['2026-08'].payroll={...C.emptyPayroll(),gross:120,deductionsTotal:12,net:108,deductions:{irpf:{name:'IRPF',kind:'irpf',base:120,pct:10,amount:12}}};
  data['2026-09'].payroll={...C.emptyPayroll(),gross:180,deductionsTotal:24,net:156,deductions:{irpf:{name:'IRPF',kind:'irpf',base:180,pct:10,amount:18},ss:{name:'Cotización',kind:'socialSecurity',base:180,pct:null,amount:6}}};
  return {config,data};
 }
 root.HorasHistoryFixture={create};if(typeof module!=='undefined')module.exports={create};
})(typeof globalThis!=='undefined'?globalThis:this);
