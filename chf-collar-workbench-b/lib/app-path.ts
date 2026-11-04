// The public prefix is fixed at build time; never derive it from request input.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export function appPath(value:string|undefined):string {
  if(!value)return '';
  if(!value.startsWith('/')||value.startsWith('//'))return value;
  if(basePath&&(value===basePath||value.startsWith(basePath+'/')||value.startsWith(basePath+'?')))return value;
  return basePath+value;
}
export function localPath(value:string):string {
  if(!basePath)return value;
  if(value===basePath||value===basePath+'/')return '/';
  return value.startsWith(basePath+'/')?value.slice(basePath.length):value;
}
