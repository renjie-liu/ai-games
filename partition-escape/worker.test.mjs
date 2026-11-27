// The Worker in front of a server on a private machine (deploy/cloudflare/worker.mjs): everything
// goes on as it came, under the Worker's own name. Offline: the tunnel is a stand-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './deploy/cloudflare/worker.mjs';

function tunnel(answer=new Response('ok')){
  const seen=[];
  return {seen,GAME:{fetch:async request=>{seen.push(request);return answer;}}};
}
test('a request goes on under the Worker\'s own name, with its path, query, method, headers and body',async()=>{
  const env=tunnel();
  await worker.fetch(new Request('https://geqiang.someone.workers.dev/api/rooms/0123456789abcdef/live-input?x=1',{method:'POST',
    headers:{Authorization:'Bearer key',Origin:'https://someone.github.io','Content-Type':'application/json','X-Partition-Invite':'code','X-Live-Generation':'2'},
    body:'{"type":"heartbeat"}'}),env);
  const [sent]=env.seen;
  assert.equal(sent.url,'http://geqiang.someone.workers.dev/api/rooms/0123456789abcdef/live-input?x=1');
  assert.equal(sent.method,'POST');
  for(const [name,value] of [['authorization','Bearer key'],['origin','https://someone.github.io'],['content-type','application/json'],['x-partition-invite','code'],['x-live-generation','2']])
    assert.equal(sent.headers.get(name),value,name);
  assert.equal(await sent.text(),'{"type":"heartbeat"}');
});
test('what comes back is handed on as it is: status, headers and a body that is still arriving',async()=>{
  let push;const body=new ReadableStream({start(controller){push=controller;}});
  const answer=new Response(body,{status:200,headers:{'Content-Type':'application/x-ndjson','Access-Control-Allow-Origin':'https://someone.github.io'}});
  const env=tunnel(answer);
  const response=await worker.fetch(new Request('https://geqiang.someone.workers.dev/api/rooms/0123456789abcdef/live-stream'),env);
  assert.equal(response,answer,'the same response, not a copy read to its end');
  assert.equal(response.headers.get('access-control-allow-origin'),'https://someone.github.io');
  const reader=response.body.getReader();
  push.enqueue(new TextEncoder().encode('{"type":"ready"}\n'));
  assert.equal(new TextDecoder().decode((await reader.read()).value),'{"type":"ready"}\n','a line can be read before the stream ends');
  push.close();
});
test('a browser\'s question before a request (OPTIONS) and a refusal go through like anything else',async()=>{
  const refusal=new Response('{"error":"x"}',{status:403});
  const env=tunnel(refusal);
  const response=await worker.fetch(new Request('https://geqiang.someone.workers.dev/api/rooms',{method:'OPTIONS',headers:{Origin:'https://evil.example'}}),env);
  assert.equal(env.seen[0].method,'OPTIONS');assert.equal(response.status,403);
});
