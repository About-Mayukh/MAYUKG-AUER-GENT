/**
 * Universal API Adapter for Local, Cloud, and GitHub Pages Static Hosting
 */

import { handleGitHubPagesRequest, subscribeToLocalEvents } from './githubPagesBackend.ts';

const CUSTOM_API_STORAGE_KEY = 'vault_custom_backend_url';

export function getCustomBackendUrl(): string {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem(CUSTOM_API_STORAGE_KEY) ||
    ((import.meta as any).env?.VITE_API_URL as string) ||
    ''
  ).trim();
}

export function setCustomBackendUrl(url: string) {
  if (typeof window === 'undefined') return;
  const clean = url.trim().replace(/\/$/, '');
  if (!clean) {
    localStorage.removeItem(CUSTOM_API_STORAGE_KEY);
  } else {
    localStorage.setItem(CUSTOM_API_STORAGE_KEY, clean);
  }
}

export function isStaticHosting(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host.includes('github.io') ||
    host.includes('pages.dev') ||
    host.includes('netlify.app') ||
    Boolean(localStorage.getItem('vault_force_static_mode'))
  );
}

/**
 * Universal Fetch wrapper that supports:
 * 1. Default relative API routes in container/Cloud Run (/api/*)
 * 2. Remote backend proxying when VITE_API_URL or custom URL is configured
 * 3. Transparent client-side offline storage engine fallback on GitHub Pages
 */
export async function apiFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const customBackend = getCustomBackendUrl();
  const isStatic = isStaticHosting();

  // If custom backend URL is configured, route to that backend server
  if (customBackend && input.startsWith('/api')) {
    const fullUrl = `${customBackend}${input}`;
    try {
      return await fetch(fullUrl, init);
    } catch (err) {
      console.warn(`[Vault API] Failed to reach remote backend at ${fullUrl}, checking fallback:`, err);
    }
  }

  // If on static hosting like GitHub Pages and no custom backend, or default relative fetch
  if (!customBackend && isStatic) {
    try {
      const result = await handleGitHubPagesRequest(input, init);

      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('[Vault API] GitHub Pages local backend error:', error);
    }
  }

  // Standard environment: try direct server fetch
  try {
    const response = await fetch(input, init);

    // If server returned 404 (e.g. static server on GitHub Pages without custom backend)
    if (response.status === 404 && isStatic) {
      const result = await handleGitHubPagesRequest(input, init);

      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return response;
  } catch (networkError) {
    // If network fails (e.g. offline or static GitHub Pages host)
    if (isStatic || !navigator.onLine) {
      const result = await handleGitHubPagesRequest(input, init);

      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw networkError;
  }
}

/**
 * Universal EventSource for real-time synchronization
 */
export function connectRealtimeStream(onEvent: (eventData: any) => void): () => void {
  const customBackend = getCustomBackendUrl();
  const isStatic = isStaticHosting();

  if (isStatic && !customBackend) {
    // On GitHub Pages standalone mode, listen to local browser event bus
    return subscribeToLocalEvents(onEvent);
  }

  try {
    const streamUrl = customBackend
      ? `${customBackend}/api/realtime/stream`
      : '/api/realtime/stream';
    const es = new EventSource(streamUrl);

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        onEvent(parsed);
      } catch {
        // ignore keep-alive
      }
    };

    return () => {
      es.close();
    };
  } catch (err) {
    // Fallback to local subscription
    return subscribeToLocalEvents(onEvent);
  }
}
