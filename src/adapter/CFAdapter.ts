import { Adapter, AdapterStream } from "./adapter.js"
import type { AdapterRequest } from "./adapter.js"
import Context from "../context.js"

export class CFRequestWrapper extends AdapterStream {
	private request: Request;
	private callbacks: { data?: any; end?: any; close?: any; finish?: any } = {};

	constructor (request: Request) {
		super();
		this.request = request;
	}

	ondata (callback: any) {
		this.callbacks.data = callback;

		setTimeout(this.readAll.bind(this), 0);
	}

	onend (callback: any) {
		this.callbacks.end = callback;
	}

	onclose (callback: any) {
		this.callbacks.close = callback;
	}

	onfinish (callback: any) {
		this.callbacks.finish = callback;
	}

	private async readAll () {
		const data = new Uint8Array(await this.request.arrayBuffer());

		this.callbacks.data && this.callbacks.data(data);
		this.callbacks.end && this.callbacks.end();
		this.callbacks.close && this.callbacks.close();
	}
}

function recordToHeaders(input: Record<string, string | string[]>): Headers {
	const headers = new Headers()

	for (const [key, value] of Object.entries(input)) {
		if (Array.isArray(value)) {
			for (const v of value) {
				headers.append(key, v)
			}
		} else {
			headers.set(key, value)
		}
	}

	return headers;
}

export class CFAdapter extends Adapter {
	processRequest (request: Request): Promise<Response> {
		return new Promise((resolve, reject) => {
			const aReq: AdapterRequest = {
				rawHTTP: request,
				headers:  Object.fromEntries(request.headers),
				method: request.method as string,
				path: request.url as string,
				bodyStream: new CFRequestWrapper(request),
				end: (status: number, headers: Record<string, string | string[]>, data: any, contentLength?: number) => {
					resolve(new Response(data, {
						status: status,
						headers: recordToHeaders(headers)
					}));
				}
			}

			const ctx = new Context(aReq);

			this.handler(ctx);
		});
	}
}