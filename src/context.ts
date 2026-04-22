import type { AdapterRequest } from "./adapter/adapter.js"

const encoder = new TextEncoder();

export default class Context {
	public raw: AdapterRequest;
	private _finished: boolean = false;
	private _notFound: boolean = false;
	/* adapter fills these */
	public method: string;
	public path: string;
	public headers: Record<string, string>;
	public query!: URLSearchParams;
	/* request part */
	public cookies: Record<string, string> = {};
	public params: Record<string, string> = {};
	public body: any;
	/* for custom data */
	public locals: Record<string, any> = {};
	/* response part */
	private _status: number = 200;
	private _responseHeaders: Record<string, string | string[]> = {};

	constructor (raw: AdapterRequest) {
		this.raw = raw;

		this.headers = raw.headers;
		this.method = raw.method;
		this.path = raw.path;
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
		this.send(encoder.encode(JSON.stringify(data)));
	}

	text (data: string) {
		this.responseHeader("Content-Type", "text/plain");
		this.send(encoder.encode(data));
	}

	binary (data: any) {
		this.responseHeader("Content-Type", "application/octet-stream");
		this.send(data);
	}

	send (data: any, contentLength?: number) {
		this.raw.end(this._status, this._responseHeaders, data, contentLength);
		this._finished = true;
	}

	end () {
		this.raw.end(this._status, this._responseHeaders, new Uint8Array(0), 0);
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