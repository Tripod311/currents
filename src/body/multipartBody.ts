import { Context } from "../context.js"
import BinaryBody from "./binaryBody.js"

const RN_MARK_2 = Buffer.from("\r\n\r\n", "utf8");
const RN_MARK = '\r\n'

interface MultipartFile {
	fileName: string;
	mimeType: string;
	content: Buffer;
}

type MultipartValue = string | MultipartFile;

export default async function MultipartBody (ctx: Context) {
	await BinaryBody(ctx);

	let ct = ctx.headers["content-type"].split(';');
	let boundary = "";
	for (let i=0; i<ct.length; i++) {
		let str = ct[i].trim();
		if (str.match(/^boundary\=.*$/)) {
			boundary = str.slice(str.indexOf('=')+1);
			break;
		}
	}
	if (!boundary) throw new Error("MultipartBody error: No boundary");

	ctx.body = parseMultipart(ctx.body, Buffer.from(boundary, "utf8"));
}

function deQuote (str: string): string {
	if (str[0] === '"' && str[str.length-1] === '"') {
		return str.slice(1, str.length-1);
	} else {
		return str;
	}
}

function parseMultipart (body: Buffer, boundary: Buffer) {
	const result: Record<string, MultipartValue | MultipartValue[]> = {};
	let index = body.indexOf(boundary);

	while (index != -1) {
		// extracting the part. If there is next boundary, read until it, else read to end of buffer.
		let part;
		let nIndex = body.indexOf(boundary, index + boundary.length);
		if (nIndex == -1) {
			part = body.subarray(index + boundary.length + RN_MARK.length);
		} else {
			part = body.subarray(index + boundary.length + RN_MARK.length, nIndex);
		}
		// extract headers from part
		const headersIndex = part.indexOf(RN_MARK_2);

		if (headersIndex === -1) {
			if (nIndex === -1) {
				break;
			} else {
				index = nIndex;
				continue;
			}
		}

		const headers = part.subarray(0, headersIndex).toString("utf8").split(RN_MARK);

		let isFile, fileName, partName, mimeType;
		for (let i=0; i<headers.length; i++) {
			const header = headers[i];
			if (header.startsWith("Content-Disposition")) {
				const arr = header.split("; ").slice(1);
				for (let j=0; j<arr.length; j++) {
					const pair = arr[j].split("=");
					switch (pair[0]) {
						case "name":
							partName = pair[1];
							break;
						case "filename":
							isFile = true;
							fileName = pair[1];
							break;
					}
				}
			} else if (header.startsWith("Content-Type")) {
				mimeType = header.split(": ")[1];
			}
		}

		if (!partName) {
			if (nIndex === -1) {
				break;
			} else {
				index = nIndex;
				continue;
			}
		}
		// extract value
		const fieldName = deQuote(partName);

		let content: MultipartValue;
		if (isFile) {
			content = {
				fileName: deQuote(fileName || ""),
				mimeType: mimeType || "application/octet-stream",
				content: part.subarray(headersIndex + RN_MARK_2.length, part.length - RN_MARK.length)
			};
		} else {
			content = part.subarray(headersIndex + RN_MARK_2.length, part.length - RN_MARK.length).toString("utf8");
		}

		if (result[fieldName] === undefined) {
			result[fieldName] = content;
		} else if (Array.isArray(result[fieldName])) {
			result[fieldName].push(content);
		} else {
			result[fieldName] = [result[fieldName], content];
		}

		if (nIndex === -1) {
			break;
		} else {
			index = nIndex;
		}
	}

	return result;
}