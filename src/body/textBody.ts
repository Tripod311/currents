import Context from "../context.js"
import BinaryBody, { DEFAULT_OPTIONS } from "./binaryBody.js"
import type { BodyOptions } from "./binaryBody.js"

const decoder = new TextDecoder('utf-8');

export default function TextBody (options: BodyOptions = DEFAULT_OPTIONS) {
	const binaryCall = BinaryBody(options);

	return async (ctx: Context) => {
		await binaryCall(ctx);

		ctx.body = decoder.decode(ctx.body);
	}
}