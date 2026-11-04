import ts from 'typescript';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
// CLI tools reuse the product's existing validator, including its schema migrations.
export async function withValidator(run){
 const root=mkdtempSync(resolve(tmpdir(),'chf-validator-')),cache=new Map();
 function emit(file){file=resolve(file);if(cache.has(file))return cache.get(file);const target=resolve(root,`${cache.size}.mjs`);cache.set(file,target);
  if(file.endsWith('.json')){writeFileSync(target,'export default '+readFileSync(file,'utf8')+';');return target;}
  let code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  code=code.replace(/(from\s+)(['"])(\.[^'"]+)\2/g,(_all,prefix,quote,spec)=>{const dependency=resolve(dirname(file),spec.endsWith('.json')?spec:spec+'.ts');return prefix+quote+pathToFileURL(emit(dependency)).href+quote;});
  writeFileSync(target,code);return target;
 }
 try{return await run(await import(pathToFileURL(emit(new URL('../lib/display-config.ts',import.meta.url).pathname)).href));}finally{rmSync(root,{recursive:true,force:true});}
}
