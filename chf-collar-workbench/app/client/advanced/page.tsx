'use client';
import AdvancedClientPage from '@/components/advanced-client-page';
import {useSiteSession} from '@/components/site-session';
export default function Page(){return useSiteSession().user?.role==='admin'?<AdvancedClientPage/>:null;}
