// Shared by Markdown rendering and IPC event membership validation.
export function localFilePath(value:string):string|undefined{
 let file=value.trim();
 try{file=decodeURIComponent(file);}catch{return;}
 if(/^file:\/\//i.test(file))file=file.replace(/^file:\/\/(?:localhost)?\/?/i,'');
 if(/^[a-z][a-z\d+.-]*:/i.test(file)&&!/^\w:[\\/]/.test(file))return;
 if(file.startsWith('//')||file.startsWith('\\\\')||/[\x00-\x1f]/.test(file))return;
 file=file.replace(/(?:#L?\d+(?:[-:]\d+)?|:\d+(?::\d+)?)$/i,'').replaceAll('\\','/');
 return /(?:^|\/)[^/]+\.[a-z\d][a-z\d._-]*$/i.test(file)&&!/[?#]/.test(file)?file:undefined;
}
export function markdownFilePaths(text:string):string[]{
 const paths:string[]=[];
 for(const match of text.matchAll(/\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)|`([^`\n]+)`/g)){
  const file=localFilePath(match[1]??match[2]??match[3]??'');if(file)paths.push(file);
 }
 return [...new Set(paths)];
}
