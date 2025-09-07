import fs from "fs"
import path from "path"
import mime from "mime-types"
import { Context } from "./context.js"

export interface ServeStaticOptions {
	basePath: string;
	rootDir: string;
	cacheControl?: string[];
}

export async function ServeStatic (options: ServeStaticOptions) {
	return async (ctx: Context) => {
		const tail = ctx.path.slice(options.basePath.length);
		const fullPath = path.resolve(options.rootDir, tail);

		// serve files only from root directory
		if (!fullPath.startsWith(options.rootDir)) {
			ctx.status(403).text(`${ctx.path}: Access forbidden`);
			return;
		}

		try {
			const stats = await fs.promises.stat(fullPath);

			if (!stats.isFile()) {
				ctx.callNotFound();
				return;
			}

			const range = ctx.headers["range"];
			if (range === undefined) {
				ctx
				.status(200)
				.responseHeader("Content-Type", mime.lookup(fullPath) || "application/octet-stream")
				.send(fs.createReadStream(fullPath), stats.size);
			} else {
				const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
				const start = parseInt(startStr, 10);
				let end = endStr ? parseInt(endStr, 10) : stats.size - 1;

				if (isNaN(end) || end >= stats.size) {
					end = stats.size - 1;
				}

				if (isNaN(start) || start < 0 || end < start || start >= stats.size) {
					ctx
					.status(416)
					.responseHeader("Content-Range", `bytes */${stats.size}`)
					.end();
					return;
				}

				ctx
				.status(206)
				.responseHeader("Content-Range", `bytes ${start}-${end}/${stats.size}`)
				.responseHeader("Accept-Ranges", "bytes")
				.responseHeader("Content-Type", mime.lookup(fullPath) || "application/octet-stream")
				.send(fs.createReadStream(fullPath, { start, end }), end - start + 1);
			}
		} catch (err: any) {
			ctx.callNotFound();
		}
	}
}