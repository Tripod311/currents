import { Context } from "./context.js"

export interface SecurityHeadersOptions {
	contentTypeOptions?: boolean;
	xFrameOptions?: 'DENY' | 'SAMEORIGIN';
	referrerPolicy?: "no-referrer" | "no-referrer-when-downgrade" | "origin" | "origin-when-cross-origin" | "same-origin" | "strict-origin" | "strict-origin-when-cross-origin" | "unsafe-url";
	transportSecurity?: {
		maxAge: number;
		includeSubDomains?: boolean;
		preload?: boolean;
	};
	contentSecurityPolicy?: string;
	crossOriginResourcePolicy?: 'same-origin' | 'same-site' | 'cross-origin';
	permissionsPolicy?: string;
}

export function SecurityHeaders (options: SecurityHeadersOptions) {
	return async (ctx: Context) => {
		if (options.contentTypeOptions) {
			ctx.responseHeader("X-Content-Type-Options", "nosniff");
		}

		if (options.xFrameOptions) {
			ctx.responseHeader("X-Frame-Options", options.xFrameOptions);
		}

		if (options.referrerPolicy) {
			ctx.responseHeader("Referrer-Policy", options.referrerPolicy);
		}

		if (options.transportSecurity) {
			let value = `max-age=${options.transportSecurity.maxAge}`;
			if (options.transportSecurity.includeSubDomains) {
				value += "; includeSubDomains";
			}
			if (options.transportSecurity.preload) {
				value += "; preload";
			}
			ctx.responseHeader("Strict-Transport-Security", value);
		}

		if (options.contentSecurityPolicy) {
			ctx.responseHeader("Content-Security-Policy", options.contentSecurityPolicy);
		}

		if (options.crossOriginResourcePolicy) {
			ctx.responseHeader("Cross-Origin-Resource-Policy", options.crossOriginResourcePolicy);
		}

		if (options.permissionsPolicy) {
			ctx.responseHeader("Permissions-Policy", options.permissionsPolicy);
		}
	}
}