import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { guardSiteRequest } from '../lib/site-auth';
import { staticAssetPath } from '../lib/site-asset-paths';

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const blocked = await guardSiteRequest(request, env);
    if (blocked) {
      const response = new Response(blocked.body, blocked);
      response.headers.set('Cache-Control', 'private, no-store');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      return response;
    }
    const path = new URL(request.url).pathname;
    // With run_worker_first, ASSETS is the only static-file delivery path.
    // Never dispatch asset-prefixed requests to an application API/RSC route.
    if (staticAssetPath(path) && env.ASSETS) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      const assetResponse = await env.ASSETS.fetch(request);
      if (!path.startsWith('/_next/static/') && !path.startsWith('/assets/')) {
        const secured = new Response(assetResponse.body, assetResponse);
        secured.headers.set('Cache-Control', 'private, no-store');
        secured.headers.set('X-Content-Type-Options', 'nosniff');
        return secured;
      }
      return assetResponse;
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response = await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
    // Authenticated HTML/RSC/API responses must never enter a shared cache.
    if (!new URL(request.url).pathname.startsWith('/assets/') && !new URL(request.url).pathname.startsWith('/_next/static/')) {
      const secured = new Response(response.body, response);
      secured.headers.set('Cache-Control', 'private, no-store');
      secured.headers.set('X-Content-Type-Options', 'nosniff');
      secured.headers.set('Referrer-Policy', 'same-origin');
      secured.headers.set('X-Frame-Options', 'DENY');
      return secured;
    }
    return response;
  },
};
