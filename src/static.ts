import fs from "fs"
import path from "path"
import mime from "mime-types"
import { Context } from "./context.js"

export interface ServeStaticOptions {
	basePath: string;
	rootDir: string;
	cacheControl?: string[];
	fallback?: string;
}

export function ServeStatic (options: ServeStaticOptions) {
	let fallbackFull: string | undefined;
	let cacheControl: string = "max-age=0, must-revalidate";

	if (options.fallback !== undefined) {
		fallbackFull = path.resolve(options.rootDir, options.fallback);
	}

	if (options.cacheControl) {
		cacheControl = options.cacheControl.join(",");
	}

	return async (ctx: Context) => {
		const tail = ctx.path.slice(options.basePath.length);
		let fullPath = path.resolve(options.rootDir, tail);

		// serve files only from root directory
		if (!fullPath.startsWith(options.rootDir)) {
			ctx.status(403).text(`${ctx.path}: Access forbidden`);
			return;
		}

		const toServe = await checkFile(fullPath, fallbackFull);

		if (toServe === null) {
			ctx.callNotFound();
			return;
		}

		const stats = toServe.stats;
		fullPath = toServe.candidate;

		const range = ctx.headers["range"];
		if (range === undefined) {
			ctx
			.status(200)
			.responseHeader("Content-Type", mime.lookup(fullPath) || "application/octet-stream")
			.responseHeader("Cache-Control", cacheControl)
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
			.responseHeader("Cache-Control", cacheControl)
			.send(fs.createReadStream(fullPath, { start, end }), end - start + 1);
		}
	}
}

async function checkFile (filePath: string, fallback?: string): Promise<{candidate: string, stats: fs.Stats} | null> {
	for (const candidate of [filePath, fallback]) {
		if (!candidate) continue;

		try {
			const stats = await fs.promises.stat(candidate);

			if (stats.isFile()) {
				return { candidate, stats };
			}
		} catch (err: any) {
			// ignore
		}
	}

	return null;
}