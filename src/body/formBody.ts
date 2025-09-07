import { Context } from "../context.js"
import TextBody from "./textBody.js"

function urlParamsToObject(params: URLSearchParams): Record<string, string | string[]> {
  const obj: Record<string, string | string[]> = {};

  for (const key of params.keys()) {
    const values = params.getAll(key);
    obj[key] = values.length === 1 ? values[0] : values;
  }

  return obj;
}

export default async function FormBody (ctx: Context) {
	await TextBody(ctx);

	ctx.body = urlParamsToObject(new URLSearchParams(ctx.body));
}