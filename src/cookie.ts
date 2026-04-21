import Context from "./context.js"

export interface CookieOptions {
	maxAge?: number;
	expires?: Date;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "Strict" | "Lax" | "None";
	path?: string;
	domain?: string;
}

let CookieSecret: string | undefined = undefined;

const encoder = new TextEncoder()

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return result === 0
}

function base64url(bytes: Uint8Array): string {
  let str = btoa(String.fromCharCode(...bytes))
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value)
  )

  return base64url(new Uint8Array(signature))
}

async function verify(value: string, signature: string, secret: string): Promise<boolean> {
  const expected = await sign(value, secret)
  return timingSafeEqual(expected, signature)
}

export function ParseCookies (secret?: string) {
	CookieSecret = secret;

	return async (ctx: Context) => {
		const header = ctx.headers["cookie"];

		if (!header) return;

		const parts = header.split(";");

		for (const part of parts) {
			const [rawKey, rawVal = ""] = part.trim().split("=");
			const key = decodeURIComponent(rawKey);
			const val = decodeURIComponent(rawVal);

			if (CookieSecret) {
				const sigIndex = val.lastIndexOf(".sig-");

				if (sigIndex !== -1) {
					const rawValue = val.slice(0, sigIndex);
					const sig = val.slice(sigIndex + 5);

					if (await verify(rawValue, sig, CookieSecret)) {
						ctx.cookies[key] = rawValue;
					}
				}
			} else {
				ctx.cookies[key] = val;
			}
		}
	}
}

export async function SetCookie (ctx: Context, name: string, value: string, options: CookieOptions) {
	let cookieValue = encodeURIComponent(value);

	if (CookieSecret !== undefined) {
		const sig = await sign(value, CookieSecret);
		cookieValue = encodeURIComponent(`${value}.sig-${sig}`);
	}

	const parts = [`${name}=${cookieValue}`];

	if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
	if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
	if (options.path) parts.push(`Path=${options.path}`);
	if (options.domain) parts.push(`Domain=${options.domain}`);
	if (options.httpOnly) parts.push("HttpOnly");
	if (options.secure) parts.push("Secure");
	if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);

	ctx.responseHeader("Set-Cookie", parts.join('; '));
}