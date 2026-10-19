const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {providers,capabilities}=require('./server');

test('isolated package contains only approved deployable files',()=>{
  const allowed=new Set(['.gitignore','README.md','index.html','package.json','render.yaml','search-owl-barn-owl-license.txt','search-owl-barn-owl.jpg','server.js','test.js']);
  assert.deepEqual(fs.readdirSync(__dirname).sort(),[...allowed].sort());
});
test('public page preserves approved identity, attribution and perched owl',()=>{
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  assert.match(html,/Intensity is our priority/);
  assert.match(html,/perched barn owl photograph/);
  assert.match(html,/Created by Master Heath, with design and implementation assistance from ChatGPT \(OpenAI\)/);
  assert.match(html,/We use Google Translate/);
  assert.doesNotMatch(html,/localhost page|C:\\Users|AppData|heathcore-manager/);
});
test('public providers are bounded and credential-gated providers remain honest',()=>{
  assert.equal(typeof providers.wikipedia,'function');
  assert.equal(typeof providers.duckduckgoInstantAnswers,'function');
  assert.equal(typeof providers.projectGutenberg,'function');
  assert.equal(typeof providers.internetArchive,'function');
  assert.equal(capabilities.europeana.mode,'credentials-required');
  assert.equal(capabilities.dpla.mode,'credentials-required');
  assert.equal(capabilities.troveAustralia.mode,'credentials-required');
  assert.equal(capabilities.googleTranslate.mode,'credential-ready-plus-handoff');
});
