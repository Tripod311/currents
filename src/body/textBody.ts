import Context from "../context.js"
import BinaryBody from "./binaryBody.js"

const decoder = new TextDecoder('utf-8');

export default async function TextBody (ctx: Context) {
	await BinaryBody(ctx);

	ctx.body = decoder.decode(ctx.body);
}