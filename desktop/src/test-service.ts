// Test-only Controller launch injection. Production does not import this module.
import {spawn,type SpawnOptions,type ChildProcess} from 'node:child_process';
import {DesktopService as ProductionService} from './service.js';
export * from './service.js';
export class DesktopService extends ProductionService {
  protected override spawnController(executable:string,args:string[],options:SpawnOptions):ChildProcess {
    return spawn(executable,['--import',new URL('../../scripts/regression-policy.mjs',import.meta.url).href,...args],options);
  }
}
