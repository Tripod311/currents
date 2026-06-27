import Context from "../context.js"
import TextBody from "./textBody.js"
import { DEFAULT_OPTIONS } from "./binaryBody.js"
import type { BodyOptions } from "./binaryBody.js"

function urlParamsToObject(params: URLSearchParams): Record<string, string | string[]> {
    const obj: Record<string, string | string[]> = {};

    for (const key of params.keys()) {
        const values = params.getAll(key);
        obj[key] = values.length === 1 ? values[0] : values;
    }

    return obj;
}

export default function FormBody (options: BodyOptions = DEFAULT_OPTIONS) {
    const textCall = TextBody(options);

    return async (ctx: Context) => {
        await textCall(ctx);

        ctx.body = urlParamsToObject(new URLSearchParams(ctx.body));
    }
}