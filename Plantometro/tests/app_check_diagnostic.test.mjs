import test from 'node:test';
import assert from 'node:assert/strict';
import {observeAppCheck,describeRejection} from '../js/app-check-diagnostic.js';
const opts={projectId:'demo-plantometro',appId:'test-web'};
const target='https://content-firebaseappcheck.googleapis.com/v1/projects/demo-plantometro/apps/test-web:exchangeRecaptchaEnterpriseToken';
test('Recognized rejection uses an allowlist, never raw identifiers/tokens',()=>{
 const original=describeRejection(400,{error:{status:'INVALID_ARGUMENT',message:'site key mismatch PRIVATE_TOKEN and user email'}});
 assert.equal(original.cause,'site-key-mismatch');assert(!JSON.stringify(original).includes('PRIVATE_TOKEN'));assert(!JSON.stringify(original).includes('user email'));
});
test('Unknown service detail is omitted',()=>{
 const detail=describeRejection(403,{error:{status:'arbitrary',message:'SECRET_DATA'}});assert.equal(detail.cause,'exchange-rejected');assert(!JSON.stringify(detail).includes('SECRET_DATA'));assert(!('backendStatus' in detail));
});
test('Observer ignores other apps and successful attestation bodies',async()=>{
 let clones=0;
 const transport={fetch:async()=>({status:200,clone(){clones++;throw Error('must not inspect');}})};
 const read=observeAppCheck(opts,transport);await transport.fetch(target);assert.equal(clones,0);assert.equal(read(),null);
 transport.fetch('https://firestore.googleapis.com/v1/projects/demo-plantometro/apps/test-web');assert.equal(read(),null);
});
test('Observer captures only the first failure for the exact app',async()=>{
 const bodies=[{error:{status:'INVALID_ARGUMENT',message:'App not registered SECRET'}},{error:{status:'PERMISSION_DENIED',message:'domain invalid'}}];
 const transport={fetch:async()=>new Response(JSON.stringify(bodies.shift()||{}),{status:400})};const read=observeAppCheck(opts,transport);
 await transport.fetch(target.replace('/test-web:', '/another-web:'));assert.equal(read(),null);
 bodies.unshift({error:{status:'INVALID_ARGUMENT',message:'App not registered SECRET'}});
 await transport.fetch(target);const first=read();assert.equal(first.cause,'app-not-registered');await transport.fetch(target);assert.deepEqual(read(),first);assert(!JSON.stringify(read()).includes('SECRET'));
});
