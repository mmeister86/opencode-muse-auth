export declare const CLIENT_ID = "1031625952748946";
export declare const DEVICE_URL = "https://auth.meta.com/oidc/device/authorization/";
export declare const TOKEN_URL = "https://auth.meta.com/oidc/device/token/";
export declare const KEY_URL = "https://api.meta.ai/muse-code/key";
export declare const CACHE_PATH: string;
export interface DeviceAuthorization {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    interval: number;
    expires_in: number;
}
export interface MintedCredential {
    oauthAccessToken: string;
    apiKey: string;
    accountId: string;
    email?: string;
}
/** The only fields ever written to the credential cache. */
export interface CachedCredential {
    apiKey: string;
    accountId: string;
    email?: string;
}
export declare function readCache(path?: string): Promise<string>;
export declare function writeCache(credentials: MintedCredential, path?: string): Promise<void>;
export declare function deviceAuthorize(): Promise<DeviceAuthorization>;
export declare function pollToken(deviceCode: string, intervalS: number, expiresInS: number): Promise<string>;
export declare function mintKey(accessToken: string): Promise<MintedCredential>;
