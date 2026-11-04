declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ADMIN_PASSWORD_HASH?: string;
    CLIENT_PASSWORD_HASH?: string;
    SESSION_SECRET?: string;
    ASSETS?: Fetcher;
  }
}
