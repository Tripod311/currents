import type { Adapter } from "./adapter/adapter.js"
import { Router } from "./router.js"
import type { RouteMatch, RouteHandler } from "./router.js"
import Context from "./context.js"

type Method = "ANY" | "GET" | "POST" | "PUT" | "DELETE";
export type ErrorHandler = (err: any, ctx: Context) => Promise<void>;

export class Currents {
	public adapter: Adapter;
	private routesTable: Record<Method, Router> = {
		"ANY": new Router(),
		"GET": new Router(),
		"POST": new Router(),
		"PUT": new Router(),
		"DELETE": new Router()
	};
	private _notFoundHandler: RouteHandler[];
	private _errorHandler: ErrorHandler;

	constructor (adapter: Adapter) {
		this.adapter = adapter;
		this.adapter.handler = this.processRequest.bind(this);

		this._errorHandler = Currents.defaultErrorHandler;
		this._notFoundHandler = [Currents.defaultNotFoundHandler];
	}

	private async processRequest (ctx: Context) {
		try {
			ctx.parsePath();

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

				await this.runHandlers(ctx, match.handlers);
			} else {
				await this.runHandlers(ctx, this._notFoundHandler, true);
			}
		} catch (err: any) {
			await this._errorHandler(`Bad request: ${err.toString()}`, ctx);
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

	static async defaultErrorHandler (err: any, ctx: Context) {
		const message = err instanceof Error ? err.message : String(err);
		const stack = err instanceof Error ? err.stack : undefined;

		ctx.status(500).text(`An error occurred: ${message}\n${stack}`);
	}

	static async defaultNotFoundHandler (ctx: Context) {
		ctx.status(404).text(`Cannot find ${ctx.path}`);
	}
}