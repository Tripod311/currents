import fs from "fs"
import http, { Server as HttpServer, IncomingMessage, ServerResponse } from "http"
import https, { Server as HttpsServer } from "https"
import http2 from "http2"
import type { Http2Server, Http2SecureServer, ServerHttp2Stream, IncomingHttpHeaders } from "http2"

import { Router } from "./router.js"
import type { RouteMatch, RouteHandler } from "./router.js"
import { Context } from "./context.js"

export interface CurrentsOptions {
	forceHTTPVersion?: 1 | 2;
	certificates?: { cert: string, key: string, ca?: string };
}

type Server = HttpServer | HttpsServer | Http2Server | Http2SecureServer;
type Method = "ANY" | "GET" | "POST" | "PUT" | "DELETE";
export type ErrorHandler = (err: any, ctx: Context) => Promise<void>;

export class Currents {
	public httpVersion: number;
	public server: Server;

	private routesTable: Record<Method, Router> = {
		"ANY": new Router(),
		"GET": new Router(),
		"POST": new Router(),
		"PUT": new Router(),
		"DELETE": new Router()
	};
	private _notFoundHandler: RouteHandler[];
	private _errorHandler: ErrorHandler;

	constructor (version: number, server: Server) {
		this.httpVersion = version;
		this.server = server;

		if (Currents.isHttp2Server(this.server)) {
			this.server.on("stream", this.handleRequestV2.bind(this));
		} else {
			this.server.on("request", this.handleRequestV1.bind(this));
		}

		this._errorHandler = Currents.defaultErrorHandler;
		this._notFoundHandler = [Currents.defaultNotFoundHandler];
	}

	handleRequestV1 (req: IncomingMessage, res: ServerResponse) {
		const ctx = new Context({
			httpVersion: 1,
			req: req,
			res: res
		});

		try {
			ctx.parsePath();

			this.processRequest(ctx);
		} catch (err: any) {
			// only if path is incorrect
			this._errorHandler(`Bad request: ${err.toString()}`, ctx);
		}
	}

	handleRequestV2 (stream: ServerHttp2Stream, headers: IncomingHttpHeaders) {
		const ctx = new Context({
			httpVersion: 2,
			stream: stream,
			headers: headers
		});

		try {
			ctx.parsePath();

			this.processRequest(ctx);
		} catch (err: any) {
			// only if path is incorrect
			this._errorHandler(`Bad request: ${err.toString()}`, ctx);
		}
	}

	private processRequest (ctx: Context) {
		let router: Router;

		switch (ctx.method) {
			case "GET":
				router = this.routesTable["GET"];
				break;
			case "POST":
				router = this.routesTable["POST"];
				break;
			case "PUT":
				router = this.routesTable["PUT"];
				break;
			case "DELETE":
				router = this.routesTable["DELETE"];
				break;
			default:
				router = this.routesTable["ANY"];
				break;
		}

		const match = router.match(ctx.path);

		if (match !== null) {
			ctx.params = match.params;

			this.runHandlers(ctx, match.handlers);
		} else {
			this.runHandlers(ctx, this._notFoundHandler, true);
		}
	}

	private async runHandlers (ctx: Context, handlers: RouteHandler[], ignoreNotFound: boolean = false) {
		try {
			let index = 0;

			while (index < handlers.length && !ctx.finished) {
				await handlers[index](ctx);
				index++;

				if (ctx.finished) return;
				if (ctx.notFound && !ignoreNotFound) this.runHandlers(ctx, this._notFoundHandler, true);
			}

			if (!ctx.finished) console.warn(`[Currents] Request to ${ctx.path} received no response`);
		} catch (err: any) {
			await this._errorHandler(err, ctx);
		}
	}

	any (path: string, handlers: RouteHandler[]) {
		this.routesTable["ANY"].add(path, handlers);
	}

	get (path: string, handlers: RouteHandler[]) {
		this.routesTable["GET"].add(path, handlers);
	}

	post (path: string, handlers: RouteHandler[]) {
		this.routesTable["POST"].add(path, handlers);
	}

	put (path: string, handlers: RouteHandler[]) {
		this.routesTable["PUT"].add(path, handlers);
	}

	delete (path: string, handlers: RouteHandler[]) {
		this.routesTable["DELETE"].add(path, handlers);
	}

	set notFoundHandler (val: RouteHandler[]) {
		this._notFoundHandler = val;
	}

	set errorHandler (val: ErrorHandler) {
		this._errorHandler = val;
	}

	static fromOptions (options: CurrentsOptions): Currents {
		let result: Currents;

		if (options.certificates !== undefined) {
			const loadedCerts: Record<string, Buffer> = {
				cert: fs.readFileSync(options.certificates!.cert),
				key: fs.readFileSync(options.certificates!.key)
			};
			if (options.certificates.ca !== undefined) loadedCerts.ca = fs.readFileSync(options.certificates.ca);

			if (options.forceHTTPVersion === 1) {
				result = new Currents(1, https.createServer(loadedCerts));
			} else {
				result = new Currents(2, http2.createSecureServer(loadedCerts));
			}
		} else {
			if (options.forceHTTPVersion === 2) {
				console.warn(
					"[Currents] HTTP/2 started without TLS-certificate. " +
					"Watch out: browsers won't connect in this mode. " +
					"Use this variant only for local tests or cli/curl APIs."
				);
				result = new Currents(2, http2.createServer());
			} else {
				result = new Currents(1, http.createServer());
			}
		}

		return result;
	}

	static fromServer (server: Server): Currents {
		return new Currents(Currents.isHttp2Server(server) ? 2 : 1, server); 
	}

	static isHttp2Server(server: HttpServer | HttpsServer | Http2Server | Http2SecureServer): server is Http2Server | Http2SecureServer {
		return typeof (server as any).on === "function" && "sessionTimeout" in server;
	}

	static async defaultErrorHandler (err: any, ctx: Context) {
		const message = err instanceof Error ? err.message : String(err);
		const stack = err instanceof Error ? err.stack : undefined;

		ctx.status(500).text(`An error occurred: ${message}\n${stack}`);
	}

	static async defaultNotFoundHandler (ctx: Context) {
		ctx.status(404).text(`Cannot get ${ctx.path}`);
	}
}