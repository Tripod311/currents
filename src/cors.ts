import { Context } from "./context.js"

export interface CorsOptions {
	allowedOrigin: string | string[];
	allowedMethods?: string[];
	allowedHeaders?: '*' | string[];
	credentials?: boolean;
}

export function Cors (options: CorsOptions) {
	return async (ctx: Context) => {
		const origin = ctx.headers["origin"];
		if (!origin) return;

		let allowed = false;

		if (options.allowedOrigin === "*") {
			allowed = true;
		} else if (typeof options.allowedOrigin === "string") {
			allowed = options.allowedOrigin === origin;
		} else if (Array.isArray(options.allowedOrigin)) {
			allowed = options.allowedOrigin.includes(origin);
		}

		if (!allowed) return;

		ctx.responseHeader("Access-Control-Allow-Origin", origin);

		if (options.credentials) {
			ctx.responseHeader("Access-Control-Allow-Credentials", "true");
		}

		if (ctx.method === "OPTIONS") {
			if (options.allowedMethods) {
				ctx.responseHeader("Access-Control-Allow-Methods", options.allowedMethods.join(", "));
			}
			if (options.allowedHeaders) {
				if (options.allowedHeaders === '*') {
					ctx.responseHeader("Access-Control-Allow-Headers", ctx.headers['access-control-request-headers'] || "Content-Type");
				} else {
					ctx.responseHeader("Access-Control-Allow-Headers", options.allowedHeaders.join(", "));
				}
			}
			ctx.status(204).end();
		}
	}
}