import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkRequest} from '../src/access-policy.ts';
test('fixed-version routes and prompt overrides are enforced',()=>{
 assert.throws(()=>checkRequest('PATCH',new URL('http://local/config'),{}),/route/i);
 assert.throws(()=>checkRequest('POST',new URL('http://local/mcp'),{}),/route/i);
 assert.throws(()=>checkRequest('POST',new URL('http://local/session/ses_x/prompt_async'),{model:{providerID:'other',modelID:'other'},parts:[]}),/model/i);
 assert.throws(()=>checkRequest('POST',new URL('http://local/session/ses_x/prompt_async'),{system:'override',parts:[]}),/override/i);
 assert.throws(()=>checkRequest('GET',new URL('http://local/file/content?path=/etc/passwd')),/path/i);
 assert.throws(()=>checkRequest('GET',new URL('http://local/session?directory=/state')),/directory/i);
 const url=new URL('http://local/session/ses_x/prompt_async');
 checkRequest('POST',url,{model:{providerID:'approved',modelID:'gpt-5.6-luna'},agent:'build',parts:[{type:'text',text:'ordinary request'}]});
 checkRequest('POST',new URL('http://local/session/ses_x/prompt_async'),{model:{providerID:'approved',modelID:'Qwen3.6-35B-A3B'},parts:[]});
 assert.throws(()=>checkRequest('POST',new URL('http://local/session/ses_x/prompt_async'),{model:{providerID:'approved',modelID:['Qwen3.6-35B-A3B']},parts:[]}),/model/i);
 assert.equal(url.searchParams.get('directory'),'/workspace/project');
 assert.doesNotThrow(()=>checkRequest('POST',new URL('http://local/question/que_x/reply'),{answers:[['yes']]}));
});
