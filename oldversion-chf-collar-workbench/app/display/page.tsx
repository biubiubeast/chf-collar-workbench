'use client';
import ClientDisplayManager from '@/components/client-display-manager';
import {useSiteSession} from '@/components/site-session';
export default function Page(){return useSiteSession().user?.role==='admin'?<ClientDisplayManager/>:null;}
