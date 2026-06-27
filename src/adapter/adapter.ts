import type { Readable } from "stream"
import Context from "../context.js"

export abstract class AdapterStream {
	public aborted = false;

	abstract ondata (callback: any): void;
	abstract onend (callback: any): void;
	abstract onclose (callback: any): void;
	abstract discard (): void;
	abstract abort (): void;
}

export interface AdapterRequest {
	rawHTTP: any;
	headers: Record<string, string>;
	method: string;
	path: string;
	bodyStream: AdapterStream;
	end: (status: number, headers: Record<string, string | string[]>, data: any, contentLength?: number) => void;
}

export abstract class Adapter {
	public handler!: (ctx: Context) => Promise<void>;
}