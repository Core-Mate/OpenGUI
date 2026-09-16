import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const temp = await mkdtemp(join(tmpdir(), 'opengui-publish-test-'))
try {
 const output = join(temp, 'args.json')
 await writeFile(join(temp, 'gh'), `#!${process.execPath}
const fs=require('fs');const a=process.argv.slice(2);if(a[1]==='view'){console.error('release not found');process.exit(1)}fs.writeFileSync(process.env.PUBLISH_TEST_OUTPUT,JSON.stringify(a));
`, {mode:0o755})
 const env={...process.env,PATH:temp+':'+process.env.PATH,PUBLISH_TEST_OUTPUT:output,GITHUB_REF_NAME:'opengui-workbuddy-v0.3.0'}
 const script=fileURLToPath(new URL('./publish.mjs', import.meta.url))
 let result=spawnSync(process.execPath,[script],{env:{...env,OPENGUI_PRERELEASE:'false'},encoding:'utf8'})
 assert.notEqual(result.status,0);assert.match(result.stderr,/Unverified release gate/)
 result=spawnSync(process.execPath,[script],{env:{...env,OPENGUI_PRERELEASE:'true'},encoding:'utf8'})
 assert.equal(result.status,0,result.stderr)
 const args=JSON.parse(await readFile(output,'utf8'))
 assert(args.includes('--prerelease'));assert(args.includes('--latest=false'))
 assert(args.some(a=>a.endsWith('opengui-workbuddy-0.3.0-install.command.sha256')))
 console.log('PASS: stable publication remains blocked by missing acceptance; public testing uses prerelease and installer assets.')
} finally { await rm(temp,{recursive:true,force:true}) }
