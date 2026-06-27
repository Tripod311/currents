import type { Adapter } from "./adapter/adapter.js"
import { Router } from "./router.js"
import type { RouteMatch, RouteHandler } from "./router.js"
import Context from "./context.js"

export type ErrorHandler = (err: any, ctx: Context) => Promise<void>;

export class Currents {
	public adapter: Adapter;
	private routesTable: Record<string, Router> = {
		"ANY": new Router()
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

			let router: Router = this.routesTable[ctx.method] || this.routesTable["ANY"];

			const match = router.match(ctx.path);

			if (match !== null) {
				ctx.params = match.params;

				await this.runHandlers(ctx, match.handlers);
			} else {
				await this.runHandlers(ctx, this._notFoundHandler, true);
			}
		} catch (err: any) {
			await this._errorHandler(`Bad request: ${err}`, ctx);
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
		if (this.routesTable["ANY"] === undefined) this.routesTable["ANY"] = new Router();

		this.routesTable["ANY"].add(path, handlers);
	}

	get (path: string, handlers: RouteHandler[]) {
		if (this.routesTable["GET"] === undefined) this.routesTable["GET"] = new Router();

		this.routesTable["GET"].add(path, handlers);
	}

	post (path: string, handlers: RouteHandler[]) {
		if (this.routesTable["POST"] === undefined) this.routesTable["POST"] = new Router();

		this.routesTable["POST"].add(path, handlers);
	}

	put (path: string, handlers: RouteHandler[]) {
		if (this.routesTable["PUT"] === undefined) this.routesTable["PUT"] = new Router();

		this.routesTable["PUT"].add(path, handlers);
	}

	delete (path: string, handlers: RouteHandler[]) {
		if (this.routesTable["DELETE"] === undefined) this.routesTable["DELETE"] = new Router();

		this.routesTable["DELETE"].add(path, handlers);
	}

	head (path: string, handlers: RouteHandler[]) {
		if (this.routesTable["HEAD"] === undefined) this.routesTable["HEAD"] = new Router();

		this.routesTable["HEAD"].add(path, handlers);
	}

	options (path: string, handlers: RouteHandler[]) {
		if (this.routesTable["OPTIONS"] === undefined) this.routesTable["OPTIONS"] = new Router();

		this.routesTable["OPTIONS"].add(path, handlers);
	}

	patch (path: string, handlers: RouteHandler[]) {
		if (this.routesTable["PATCH"] === undefined) this.routesTable["PATCH"] = new Router();

		this.routesTable["PATCH"].add(path, handlers);
	}

	route (method: string, path: string, handlers: RouteHandler[]) {
		if (this.routesTable[method] === undefined) this.routesTable[method] = new Router();

		this.routesTable[method].add(path, handlers);
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

		if (ctx.raw.bodyStream.aborted) {
			ctx.raw.bodyStream.abort();
		} else {
			ctx.raw.bodyStream.discard();
		}
	}

	static async defaultNotFoundHandler (ctx: Context) {
		ctx.status(404).text(`Cannot find ${ctx.path}`);

		ctx.raw.bodyStream.discard();
	}
}