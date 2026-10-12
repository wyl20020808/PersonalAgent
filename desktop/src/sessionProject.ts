import type {Conversation} from './types.js';
export function sessionProject(session:Pick<Conversation,'projectPath'|'projectName'|'projectGroupPath'|'projectGroupName'>){
 return {path:session.projectGroupPath??session.projectPath,name:session.projectGroupName??session.projectName};
}
