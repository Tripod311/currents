import { Readable } from "stream"
import { IncomingMessage, ServerResponse } from "http"
import type { ServerHttp2Stream, IncomingHttpHeaders } from "http2"

export interface RawHttp1 {
	httpVersion: 1;
	req: IncomingMessage;
	res: ServerResponse;
}

export interface RawHttp2 {
	httpVersion: 2;
	stream: ServerHttp2Stream;
	headers: IncomingHttpHeaders;
}

export type RawHttp = RawHttp1 | RawHttp2;

export class Context {
	public raw: RawHttp;
	private _finished: boolean = false;
	private _notFound: boolean = false;
	/* request part */
	public method: string;
	public path: string;
	public headers: Record<string, string>;
	public cookies: Record<string, string> = {};
	public params: Record<string, string> = {};
	public query!: URLSearchParams;
	public body: any;
	/* for custom data */
	public locals: Record<string, any> = {};
	/* response part */
	private _status: number = 200;
	private _responseHeaders: Record<string, string | string[]> = {};

	constructor (raw: RawHttp) {
		this.raw = raw;

		if (raw.httpVersion === 1) {
			this.headers = raw.req.headers as Record<string,string>;
			this.method = raw.req.method as string;
			this.path = raw.req.url as string;
		} else {
			this.headers = raw.headers as Record<string,string>;
			this.method = this.headers[":method"] as string;
			this.path = this.headers[":path"] as string;
		}
	}

	parsePath () {
		const [pathEnc, search = ""] = this.path.split("?");
		this.query = new URLSearchParams(search);
		this.path = decodeURIComponent(pathEnc);
	}

	responseHeader (header: string, value: string): Context {
		const key = header.toLowerCase();

		if (this._responseHeaders[key] !== undefined) {
			if (Array.isArray(this._responseHeaders[key])) {
				this._responseHeaders[key].push(value);
			} else {
				this._responseHeaders[key] = [this._responseHeaders[key], value];
			}
		} else {
			this._responseHeaders[key] = value;
		}
		return this;
	}

	status (code: number): Context {
		this._status = code;
		return this;
	}

	json (data: any) {
		this.responseHeader("Content-Type", "application/json");
		this.send(Buffer.from(JSON.stringify(data), "utf-8"));
	}

	text (data: string) {
		this.responseHeader("Content-Type", "text/plain");
		this.send(Buffer.from(data, "utf-8"));
	}

	binary (data: Buffer | Readable) {
		this.responseHeader("Content-Type", "application/octet-stream");
		this.send(data);
	}

	send (data: Buffer | Readable, contentLength?: number) {
		if (Buffer.isBuffer(data)) {
			this._responseHeaders["Content-Length"] = data.length.toString();
		} else {
			if (contentLength === undefined) {
				throw new Error("Context.send must be provided with contentLength when sending Readable");
			}

			this._responseHeaders["Content-Length"] = contentLength!.toString();
		}

		if (this.raw.httpVersion === 1) {
			this.raw.res.writeHead(this._status, this._responseHeaders);

			if (data instanceof Readable) {
				data.pipe(this.raw.res);
			} else {
				this.raw.res.end(data);
			}
		} else {
			this.raw.stream.respond({
				":status": this._status,
				...this._responseHeaders
			});

			if (data instanceof Readable) {
				data.pipe(this.raw.stream);
			} else {
				this.raw.stream.end(data);
			}
		}

		this._finished = true;
	}

	end () {
		if (this.raw.httpVersion === 1) {
			this.raw.res.writeHead(this._status, this._responseHeaders);

			this.raw.res.end();
		} else {
			this.raw.stream.respond({
				":status": this._status,
				...this._responseHeaders
			});

			this.raw.stream.end();
		}

		this._finished = true;
	}

	redirect (to: string) {
		this.responseHeader("Location", to).status(307).end();
	}

	callNotFound () {
		this._notFound = true;
	}

	get finished (): boolean {
		return this._finished;
	}

	get notFound (): boolean {
		return this._notFound;
	}
}