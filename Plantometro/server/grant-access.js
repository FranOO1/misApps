// Operator tool: run manually in Cloud Shell with Application Default Credentials.
// This changes only the AI access claim, preserving claims belonging to other apps.
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
const project=process.env.GOOGLE_CLOUD_PROJECT,uid=process.argv[2],action=process.argv[3];
if(project!=='mishoras-bb0cc'||!uid||!['grant','revoke'].includes(action)){
  process.stderr.write('Uso: GOOGLE_CLOUD_PROJECT=mishoras-bb0cc node server/grant-access.js UID grant|revoke\n');process.exit(1);
}
try{
  initializeApp({projectId:project,credential:applicationDefault()});
  const auth=getAuth(),user=await auth.getUser(uid),claims={...(user.customClaims||{})};
  if(action==='grant')claims.plantometroAI=true;else delete claims.plantometroAI;
  await auth.setCustomUserClaims(uid,claims);
  process.stdout.write('Acceso de IA actualizado; vuelve a iniciar sesión en la app.\n');
}catch{
  process.stderr.write('No se pudo actualizar el acceso. Revisa el proyecto y tu permiso de Firebase Authentication.\n');process.exitCode=1;
}
