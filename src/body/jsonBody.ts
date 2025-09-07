import { Context } from "../context.js"
import TextBody from "./textBody.js"

export default async function JsonBody (ctx: Context) {
	await TextBody(ctx);

	ctx.body = JSON.parse(ctx.body);
}