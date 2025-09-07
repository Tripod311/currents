import { Context } from "../context.js"

export default function BinaryBody (ctx: Context): Promise<void> {
	return new Promise((resolve, reject) => {
		ctx.body = Buffer.alloc(0);

		const stream = ctx.raw.httpVersion === 1 ? ctx.raw.req : ctx.raw.stream;

		stream.on('data', (chunk) => {
			ctx.body = Buffer.concat([ctx.body, chunk]);
		});

		stream.on('end', () => {
			resolve();
		});
	});
}