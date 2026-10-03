import {AIError} from './core.js';
function createStore(db,{quotaDb=db}={}){
  return {
    async reserve({uid,day,lease,now,dailyUserLimit,dailyGlobalLimit}){
      const global=quotaDb.doc('_plantometro_ai_limits/'+day),user=global.collection('users').doc(uid);
      await quotaDb.runTransaction(async tx=>{
        const [g,u]=await Promise.all([tx.get(global),tx.get(user)]),gd=g.data()||{},ud=u.data()||{};
        if((ud.calls||0)>=dailyUserLimit || (gd.calls||0)>=dailyGlobalLimit || (ud.busyUntil||0)>now)throw new AIError('resource-exhausted');
        const expireAt=new Date(now+8*864e5);
        tx.set(global,{calls:(gd.calls||0)+1,expireAt});
        tx.set(user,{calls:(ud.calls||0)+1,lease,busyUntil:now+65000,expireAt});
      });
    },
    async release({uid,day,lease}){
      const ref=quotaDb.doc('_plantometro_ai_limits/'+day+'/users/'+uid);
      await quotaDb.runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.data()?.lease===lease)tx.update(ref,{lease:'',busyUntil:0});});
    },
    async readPlant(uid,id){const snap=await db.doc('users/'+uid+'/plants/'+id).get();return snap.exists?snap.data():null;}
  };
}
export {createStore};
