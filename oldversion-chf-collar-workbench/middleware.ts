import {NextResponse} from 'next/server';
import {guardSiteRequest} from './lib/site-auth';
// Runs for local Vinext navigation as well as production requests. The Worker
// entry enforces the same policy before every route and RSC dispatch.
export async function middleware(request:Request){const blocked=await guardSiteRequest(request);if(blocked)return blocked;const response=NextResponse.next();response.headers.set('Cache-Control','private, no-store');return response;}
export const config={matcher:['/((?!_next/static|assets|favicon).*)']};
