import {AuthError,database,errorResponse,json,readJson,requireUser,sameOrigin} from '@/lib/site-auth';
import {readDisplayConfig,writeDisplayConfig} from '@/lib/display-store';
import {validateDisplayConfig,type Role} from '@/lib/display-config';
export const dynamic='force-dynamic';
function displayAudience(request:Request,role:Role):Role{const values=new URL(request.url).searchParams.getAll('audience');if(values.length>1||values.some(v=>v!=='client'&&v!=='admin'))throw new AuthError('展示对象无效',400);const audience=(values[0]??role) as Role;if(role==='client'&&audience!=='client')throw new AuthError('此功能仅限管理员',403);return audience;}
export async function GET(request:Request){try{const session=await requireUser(request),audience=displayAudience(request,session.user.role);return json(await readDisplayConfig(database(),audience));}catch(error){return errorResponse(error);}}
export async function PUT(request:Request){try{sameOrigin(request);const session=await requireUser(request,'admin'),audience=displayAudience(request,session.user.role),raw=await readJson(request);let config;try{config=validateDisplayConfig(raw,audience);}catch(error){throw new AuthError(error instanceof Error?error.message:'展示配置无效',400);}return json(await writeDisplayConfig(database(),config,audience));}catch(error){return errorResponse(error);}}
