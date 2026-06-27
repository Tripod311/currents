import Context from "../context.js"

export interface BodyOptions {
	maxRequestSize: number;
	requestTimeout: number;
}

export const DEFAULT_OPTIONS = {
	maxRequestSize: 1024 * 1024 * 100, 		// 100 MB
	requestTimeout: 1000 * 60 * 5  			// 5 minutes
}

export default function BinaryBody (options: BodyOptions = DEFAULT_OPTIONS) {
	return (ctx: Context) => {
		return new Promise<void>((resolve, reject) => {
			const chunks: Uint8Array[] = [];
			let size = 0;
			const timeout = setTimeout(() => {
				reject("Request timed out");
			}, options.requestTimeout);

			ctx.raw.bodyStream.ondata((chunk: Uint8Array) => {
				chunks.push(chunk);
				size += chunk.length;

				if (size >= options.maxRequestSize) {
					ctx.raw.bodyStream.aborted = true;
					reject("Request body too large");
				}
			});

			ctx.raw.bodyStream.onend(() => {
				clearTimeout(timeout);
				const length = chunks.reduce((acc, chunk) => { return acc + chunk.length }, 0);
				ctx.body = new Uint8Array(length);

				let offset = 0;
				for (const chunk of chunks) {
					ctx.body.set(chunk, offset);
					offset += chunk.length;
				}

				resolve();
			});
		});
	}
}