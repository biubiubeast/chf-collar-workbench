// Static files are served only through the authenticated Worker. Public build
// scripts/styles are required by the login page; documents/templates are not.
export function publicAssetPath(path:string){
 // Bundled filenames are ASCII and do not require escaped separators. Reject
 // encoded/traversal forms so asset normalization cannot escape the whitelist.
 if(path.includes('%')||path.includes('\\')||path.split('/').some(x=>x==='.'||x==='..'))return false;
 return path.startsWith('/_next/static/')||path.startsWith('/assets/')||['/favicon.svg','/favicon.ico','/robots.txt'].includes(path);
}
export function staticAssetPath(path:string){return publicAssetPath(path)||path.startsWith('/templates/')||/\.[A-Za-z0-9]{1,12}$/.test(path);}
