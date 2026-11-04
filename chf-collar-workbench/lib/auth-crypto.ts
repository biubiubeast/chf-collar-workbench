const encoder=new TextEncoder();
export function base64url(bytes:Uint8Array):string{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function unbase64url(text:string):Uint8Array{if(!/^[A-Za-z0-9_-]+$/.test(text))throw Error('编码无效');const value=atob(text.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(value,c=>c.charCodeAt(0));}
export async function digest(text:string){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))));}
export async function verifyPassword(password:string,representation:string):Promise<boolean>{
 try{const [scheme,n,salt,expected,...extra]=representation.split('$'),iterations=Number(n),saltBytes=unbase64url(salt),expectedBytes=unbase64url(expected);
  if(scheme!=='pbkdf2-sha256'||extra.length||!Number.isInteger(iterations)||iterations<100000||iterations>100000||saltBytes.length<16||saltBytes.length>64||expectedBytes.length!==32)return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const value=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:saltBytes as BufferSource,iterations},key,256));let diff=0;for(let i=0;i<32;i++)diff|=value[i]^expectedBytes[i];return diff===0;
 }catch{return false;}
}
async function hmacKey(secret:string,usage:KeyUsage[]){if(secret.length<32)throw Error('站点登录尚未配置');return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,usage);}
export async function signedValue(payload:Record<string,unknown>,secret:string){const data=base64url(encoder.encode(JSON.stringify(payload))),signature=await crypto.subtle.sign('HMAC',await hmacKey(secret,['sign']),encoder.encode(data));return data+'.'+base64url(new Uint8Array(signature));}
export async function verifiedValue(token:string,secret:string):Promise<Record<string,unknown>|null>{try{if(token.length>1500)return null;const [data,signature,...extra]=token.split('.');if(extra.length||!data||!signature)return null;const okay=await crypto.subtle.verify('HMAC',await hmacKey(secret,['verify']),unbase64url(signature) as BufferSource,encoder.encode(data));return okay?JSON.parse(new TextDecoder().decode(unbase64url(data))):null;}catch{return null;}}
