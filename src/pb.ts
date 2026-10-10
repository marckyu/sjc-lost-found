/// <reference types="vite/client" />

import PocketBase from 'pocketbase';

const PB_URL =
    (import.meta.env.VITE_PB_URL as string | undefined) ||
    `http://${window.location.hostname}:8090`;

export const pb = new PocketBase(PB_URL);

pb.autoCancellation(false);

pb.beforeSend = function (url, options) {
    if (url.includes('loca.lt')) {
        options.headers = {
            ...options.headers,
            'Bypass-Tunnel-Reminder': 'true'
        };
    }
    return { url, options };
};