import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const directory of ['site','scripts','tests'])for(const name of readdirSync(directory)){
  if(!/\.(?:m?js)$/.test(name))continue;
  const result=spawnSync(process.execPath,['--check',`${directory}/${name}`],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
console.log('JavaScript syntax checks passed.');
