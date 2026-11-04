import {errorResponse,json,login,logout,session} from '@/lib/site-auth';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return json({user:(await session(request))?.user??null});}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{return await login(request);}catch(error){return errorResponse(error);}}
export async function DELETE(request:Request){try{return await logout(request);}catch(error){return errorResponse(error);}}
