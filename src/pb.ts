/// <reference types="vite/client" />

import PocketBase from 'pocketbase';

const PB_URL =
    (import.meta.env.VITE_PB_URL as string | undefined) ||
    `http://${window.location.hostname}:8090`;

const originalFetch = window.fetch.bind(window);

window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url = '';
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.toString();
    else if (input instanceof Request) url = input.url;

    if (url.includes('loca.lt')) {
        init = init || {};
        const existingHeaders = init.headers;
        if (existingHeaders instanceof Headers) {
            existingHeaders.set('Bypass-Tunnel-Reminder', 'true');
        } else if (Array.isArray(existingHeaders)) {
            existingHeaders.push(['Bypass-Tunnel-Reminder', 'true']);
        } else {
            init.headers = {
                ...(existingHeaders || {}),
                'Bypass-Tunnel-Reminder': 'true'
            };
        }
    }

    return originalFetch(input, init);
};

export const pb = new PocketBase(PB_URL);

pb.autoCancellation(false);