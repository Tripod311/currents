import crypto from "crypto"
import { Context } from "./context.js"

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

function sign(value: string): string {
	return crypto.createHmac("sha256", CookieSecret as string).update(value).digest("base64url");
}

function verify(value: string, signature: string): boolean {
	const expected = sign(value);
	return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
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

					if (verify(rawValue, sig)) {
						ctx.cookies[key] = rawValue;
					}
				}
			} else {
				ctx.cookies[key] = val;
			}
		}
	}
}

export function SetCookie (ctx: Context, name: string, value: string, options: CookieOptions) {
	let cookieValue = encodeURIComponent(value);

	if (CookieSecret !== undefined) {
		const sig = sign(value);
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