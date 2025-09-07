import { Context } from "../context.js"
import BinaryBody from "./binaryBody.js"

export default async function TextBody (ctx: Context) {
	await BinaryBody(ctx);

	ctx.body = ctx.body.toString('utf-8');
}