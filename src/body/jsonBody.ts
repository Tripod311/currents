import Context from "../context.js"
import TextBody from "./textBody.js"
import { DEFAULT_OPTIONS } from "./binaryBody.js"
import type { BodyOptions } from "./binaryBody.js"

export default function JsonBody (options: BodyOptions = DEFAULT_OPTIONS) {
    const textCall = TextBody(options);

    return async (ctx: Context) => {
        await textCall(ctx);

        ctx.body = JSON.parse(ctx.body);
    }
}