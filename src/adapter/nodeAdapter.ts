import fs from "fs"
import { Readable } from "stream"
import http, { Server as HttpServer, IncomingMessage, ServerResponse } from "http"
import https, { Server as HttpsServer } from "https"
import http2 from "http2"
import type { Http2Server, Http2SecureServer, ServerHttp2Stream, IncomingHttpHeaders } from "http2"

export interface CurrentsOptions {
	forceHTTPVersion?: 1 | 2;
	certificates?: { cert: string, key: string, ca?: string };
}

import { Adapter, AdapterStream } from "./adapter.js"
import type { AdapterRequest } from "./adapter.js"
import Context from "../context.js"

type Server = HttpServer | HttpsServer | Http2Server | Http2SecureServer;

export class ReadableWrapper extends AdapterStream {
	private stream: Readable;

	constructor (stream: Readable) {
		super();

		this.stream = stream;
	}

	ondata (callback: any) {
		this.stream.on("data", callback);
	}

	onend (callback: any) {
		this.stream.on("end", callback);
	}

	onclose (callback: any) {
		this.stream.on("close", callback);
	}
}

export class NodeAdapter extends Adapter {
	public httpVersion: 1 | 2;
	public server: Server;

	constructor (version: 1 | 2, server: Server) {
		super();

		this.httpVersion = version;
		this.server = server;

		if (NodeAdapter.isHttp2Server(this.server)) {
			this.server.on("stream", this.handleRequestV2.bind(this));
		} else {
			this.server.on("request", this.handleRequestV1.bind(this));
		}
	}

	handleRequestV1 (req: IncomingMessage, res: ServerResponse) {
		const aReq: AdapterRequest = {
			rawHTTP: {
				version: 1,
				req: req,
				res: res
			},
			headers: req.headers as Record<string,string>,
			method: req.method as string,
			path: req.url as string,
			bodyStream: this.wrapStream(req),
			end: (status: number, headers: Record<string, string | string[]>, data: Uint8Array | Buffer | Readable, contentLength?: number) => {
				if (data instanceof Uint8Array) {
					headers["Content-Length"] = data.length.toString();
				} else {
					if (contentLength === undefined) {
						throw new Error("Context.send must be provided with contentLength when sending Readable");
					}

					headers["Content-Length"] = contentLength!.toString();
				}

				res.writeHead(status, headers);

				if (data instanceof Readable) {
					data.pipe(res);
				} else {
					res.end(data);
				}
			}
		}

		const ctx = new Context(aReq);

		this.handler(ctx);
	}

	handleRequestV2 (stream: ServerHttp2Stream, headers: IncomingHttpHeaders) {
		const req: AdapterRequest = {
			rawHTTP: {
				version: 2,
				stream: stream
			},
			headers: headers as Record<string,string>,
			method: headers[":method"] as string,
			path: headers["path"] as string,
			bodyStream: this.wrapStream(stream),
			end: (status: number, headers: Record<string, string | string[]>, data: Uint8Array | Buffer | Readable, contentLength?: number) => {
				if (data instanceof Uint8Array) {
					headers["Content-Length"] = data.length.toString();
				} else {
					if (contentLength === undefined) {
						throw new Error("Context.send must be provided with contentLength when sending Readable");
					}

					headers["Content-Length"] = contentLength!.toString();
				}

				stream.respond({
					":status": status,
					...headers
				});

				if (data instanceof Readable) {
					data.pipe(stream);
				} else {
					stream.end(data);
				}
			}
		}

		const ctx = new Context(req);

		this.handler(ctx);
	}

	wrapStream (stream: Readable): AdapterStream {
		return new ReadableWrapper(stream);
	}

	static fromOptions (options: CurrentsOptions): NodeAdapter {
		let result: NodeAdapter;

		if (options.certificates !== undefined) {
			const loadedCerts: Record<string, Buffer> = {
				cert: fs.readFileSync(options.certificates!.cert),
				key: fs.readFileSync(options.certificates!.key)
			};
			if (options.certificates.ca !== undefined) loadedCerts.ca = fs.readFileSync(options.certificates.ca);

			if (options.forceHTTPVersion === 1) {
				result = new NodeAdapter(1, https.createServer(loadedCerts));
			} else {
				result = new NodeAdapter(2, http2.createSecureServer(loadedCerts));
			}
		} else {
			if (options.forceHTTPVersion === 2) {
				console.warn(
					"[Currents] HTTP/2 started without TLS-certificate. " +
					"Watch out: browsers won't connect in this mode. " +
					"Use this variant only for local tests or cli/curl APIs."
				);
				result = new NodeAdapter(2, http2.createServer());
			} else {
				result = new NodeAdapter(1, http.createServer());
			}
		}

		return result;
	}

	static fromServer (server: Server): NodeAdapter {
		return new NodeAdapter(NodeAdapter.isHttp2Server(server) ? 2 : 1, server); 
	}

	static isHttp2Server(server: HttpServer | HttpsServer | Http2Server | Http2SecureServer): boolean {
		return typeof (server as any).on === "function" && "sessionTimeout" in server;
	}
}