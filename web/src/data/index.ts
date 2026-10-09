// Base URL of the BridgeWitness server (Render). Without it the site uses the replay files shipped in /data.
// Render passes a bare host name between services; accept that as well as a full URL.
const rawApi = (import.meta.env.VITE_BW_API as string | undefined)?.trim().replace(/\/$/, '');
export const API = rawApi ? (/^https?:\/\//.test(rawApi) ? rawApi : `https://${rawApi}`) : undefined;
