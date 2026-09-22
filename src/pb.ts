/// <reference types="vite/client" />

import PocketBase from 'pocketbase';

// Saan naka-run ang PocketBase.
// Para i-override, ilagay sa .env.local:  VITE_PB_URL=https://pb.iyong-domain.com
const PB_URL =
    (import.meta.env.VITE_PB_URL as string | undefined) ||
    `http://${window.location.hostname}:8090`;

export const pb = new PocketBase(PB_URL);

// Para hindi mag-cancel ang magkakasabay na request (mahalaga sa realtime refresh)
pb.autoCancellation(false);