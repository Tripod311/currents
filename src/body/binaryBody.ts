import Context from "../context.js"

export default function BinaryBody (ctx: Context): Promise<void> {
	return new Promise((resolve, reject) => {
		const chunks: Uint8Array[] = [];

		ctx.raw.bodyStream.ondata((chunk: Uint8Array) => {
			chunks.push(chunk);
		});

		ctx.raw.bodyStream.onend(() => {
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