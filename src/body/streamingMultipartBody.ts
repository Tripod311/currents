import crypto from "crypto"
import { Readable, Writable } from "stream"
import fs from "fs"
import { Context } from "../context.js"

export interface StreamingMultipartOptions {
	tmpDir: string;
	maxRequestSize: number;
	maxFileSize: number;
	maxFieldSize: number;
	maxPartHeaderSize: number;
	maxParts: number;
	maxFiles: number;
	requestTimeout: number;
	chunkTimeout: number;
}

export class StreamingMultipartFile {
	public tmpLink: string;
	public originalFileName: string;
	public mime: string;

	constructor (tmpLink: string, originalFileName: string, mime: string) {
		this.tmpLink = tmpLink;
		this.originalFileName = originalFileName;
		this.mime = mime;
	}

	async move (newPath: string) {
		await fs.promises.rename(this.tmpLink, newPath);
		await this.clear();
	}

	async clear () {
		await fs.promises.rm(this.tmpLink);
	}
}

export type StreamingMultipartResult = Record<string, string | StreamingMultipartFile>;

class Parser {
	static HEADER_END = Buffer.from('\r\n\r\n');

	private options: StreamingMultipartOptions;
	private firstBoundary: Buffer;
	private centerBoundary: Buffer;
	private stream: Readable;
	private state: 'boundary' | 'header' | 'body' | 'file' | 'end' = 'boundary';
	public readyPromise: Promise<void>;
	private resolve!: () => void;
	private reject!: (err: any) => void;

	private processingBuffer: Buffer = Buffer.alloc(0);
	private passedFirstBoundary: boolean = false;
	private fileStream: Writable | null = null;
	private partName: string = "";
	private tmpFileName: string = "";
	private originalFileName: string = "";
	private mime: string = "";
	public result: StreamingMultipartResult = {};

	private partCounter: number = 0;
	private fileCounter: number = 0;
	private fileByteCounter: number = 0;

	private chunkTimeout: ReturnType<typeof setTimeout>;
	private requestTimeout: ReturnType<typeof setTimeout>;

	constructor (options: StreamingMultipartOptions, boundary: string, stream: Readable) {
		this.options = options;
		this.firstBoundary = Buffer.from('--' + boundary);
		this.centerBoundary = Buffer.from('\r\n--' + boundary);
		this.stream = stream;

		this.stream.on("data", this.processChunk.bind(this));
		this.stream.on("end", this.finalize.bind(this));
		this.stream.on("close", this.handleClose.bind(this));

		this.readyPromise = new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});

		this.chunkTimeout = setTimeout(this.rejectChunk.bind(this), this.options.chunkTimeout);
		this.requestTimeout = setTimeout(this.rejectRequest.bind(this), this.options.requestTimeout);
	}

	processChunk (chunk: Buffer) {
		this.resetChunk();

		try {
			switch (this.state) {
				case "boundary":
					this.processBoundary(chunk);
					break;
				case "header":
					this.processHeader(chunk);
					break;
				case "body":
					this.processBody(chunk);
					break;
				case "file":
					this.processFile(chunk);
					break;
				case "end":
					return;
			}
		} catch (err: any) {
			this.reject(err.toString());
		}
	}

	processBoundary (chunk: Buffer) {
		const b = Buffer.concat([this.processingBuffer, chunk]);

		const searchBoundary = this.passedFirstBoundary ? this.centerBoundary : this.firstBoundary;
		const index = b.indexOf(searchBoundary);

		if (index !== -1) {
			this.state = 'header';
			this.passedFirstBoundary = true;
			this.processingBuffer = b.subarray(index + searchBoundary.length);

			this.processHeader(Buffer.alloc(0));
		} else {
			const tail = searchBoundary.length + 4;

			if (b.length > tail) {
				this.processingBuffer = b.subarray(b.length - tail);
			} else {
				this.processingBuffer = b;
			}
		}
	}

	processHeader (chunk: Buffer) {
		const b = Buffer.concat([this.processingBuffer, chunk]);

		const index = b.indexOf(Parser.HEADER_END);

		if (b.subarray(0,2).toString("utf-8").startsWith('--')) {
			this.state = 'end';
			return;
		}

		if (index === -1) {
			if (b.length >= this.options.maxPartHeaderSize) {
				throw new Error("Part header exceeding maxPartHeaderSize");
			}

			this.processingBuffer = b;
			return;
		}

		const headerPart = b.subarray(0, index);
		this.processingBuffer = b.subarray(index + Parser.HEADER_END.length);

		const headerStr = headerPart.toString('utf-8');
		const lines = headerStr.split('\r\n');

		let contentDisposition: string | null = null;
		let contentType: string | null = null;

		for (const line of lines) {
			const idx = line.indexOf(':');

			if (idx === -1) continue;

			const key = line.slice(0, idx).trim().toLowerCase();
		    const value = line.slice(idx + 1).trim();

		    if (key === "content-disposition") {
		    	contentDisposition = value;
		    } else if (key === "content-type") {
		    	contentType = value;
		    }
		}

		if (!contentDisposition) {
			throw new Error("Missing Content-Disposition");
		}

		const dParts = contentDisposition.split(';');

		if (dParts[0].toLowerCase() !== 'form-data') {
			throw new Error('Invalid Content-Disposition type');
		}

		let name: string | undefined = undefined;
		let filename: string | undefined = undefined;

		for (const part of dParts) {
			const eIndex = part.indexOf('=');
			if (eIndex === -1) continue;

			const key = part.slice(0, eIndex).trim().toLowerCase();
			let value = part.slice(eIndex + 1).trim();

			if (value.startsWith('"') && value.endsWith('"')) {
				value = value.slice(1, -1);
			}

			if (key === 'name') {
				name = value;
			} else if (key === 'filename') {
				filename = value;
			}
		}

		if (name === undefined) throw new Error("Missing part name");

		this.partName = name;

		if (filename !== undefined) {
			this.originalFileName = filename || "";
			this.mime = contentType || "";
			this.state = 'file';

			this.processFile(Buffer.alloc(0));
		} else {
			this.state = 'body';
			this.processBody(Buffer.alloc(0));
		}
	}

	processBody (chunk: Buffer) {
		const b = Buffer.concat([this.processingBuffer, chunk]);

		const index = b.indexOf(this.centerBoundary);

		if (index === -1) {
			if (b.length >= this.options.maxFieldSize) {
				throw new Error("Part exceeding maxFieldSize");
			}

			this.processingBuffer = b;
		} else {
			const body = b.subarray(0, index).toString('utf-8');
			this.processingBuffer = b.subarray(index + this.centerBoundary.length);

			this.result[this.partName] = body;

			this.state = 'header';

			this.partCounter++;

			if (this.partCounter > this.options.maxParts) {
				throw new Error("MaxParts exceeded");
			}

			this.processHeader(Buffer.alloc(0));
		}
	}

	processFile (chunk: Buffer) {
		if (this.fileStream === null) {
			this.tmpFileName = this.options.tmpDir + "/" + crypto.randomBytes(32).toString('hex');
			this.fileStream = fs.createWriteStream(this.tmpFileName);
			this.fileByteCounter = 0;
		}

		const b = Buffer.concat([this.processingBuffer, chunk]);

		const index = b.indexOf(this.centerBoundary);

		if (index === -1) {
			const filePart = b.subarray(0, b.length - this.centerBoundary.length - 4);

			this.fileByteCounter += filePart.length;

			if (this.fileByteCounter >= this.options.maxFileSize) throw new Error("File too large");

			this.processingBuffer = b.subarray(b.length - this.centerBoundary.length - 4);

			this.fileStream.write(filePart);
		} else {
			const filePart = b.subarray(0, index);

			this.fileByteCounter += filePart.length;

			if (this.fileByteCounter >= this.options.maxFileSize) throw new Error("File too large");

			this.processingBuffer = b.subarray(index + this.centerBoundary.length);

			this.fileStream.write(filePart);
			this.fileStream.end();

			this.result[this.partName] = new StreamingMultipartFile(this.tmpFileName, this.originalFileName, this.mime);

			this.fileStream = null;

			this.state = 'header';

			this.partCounter++;

			if (this.partCounter > this.options.maxParts) {
				throw new Error("MaxParts exceeded");
			}

			this.fileCounter++;

			if (this.fileCounter > this.options.maxFiles) {
				throw new Error("MaxFiles exceeded");
			}

			this.processHeader(Buffer.alloc(0));
		}
	}

	finalize () {
		if (this.state !== 'end') {
			this.reject("Stream closed early");
		} else {
			this.resolve();
		}
	}

	handleClose () {
		if (this.state !== 'end') {
			this.reject("Stream closed early");
		}
	}

	resetChunk () {
		clearTimeout(this.chunkTimeout);

		this.chunkTimeout = setTimeout(this.rejectChunk.bind(this), this.options.chunkTimeout);
	}

	rejectChunk () {
		this.reject("Request timed out");
	}

	rejectRequest () {
		this.reject("Request timed out");
	}

	clearTimeouts () {
		clearTimeout(this.chunkTimeout);
		clearTimeout(this.requestTimeout);
	}

	async cleanup () {
		if (this.fileStream !== null) {
			this.fileStream.end();

			await fs.promises.rm(this.tmpFileName);
		}

		for (const partname in this.result) {
			if (typeof this.result[partname] !== "string") {
				await (this.result[partname] as StreamingMultipartFile).clear();
			}
		}
	}
}

function validateOptions (ctx: Context, options: StreamingMultipartOptions) {
	const contentType = ctx.headers["content-type"];

	if (!contentType) {
		throw new Error("Missing Content-Type");
	}

	if (!contentType.startsWith("multipart/form-data")) {
		throw new Error("Invalid Content-Type");
	}

	const contentLength = ctx.headers["content-length"];

	if (contentLength) {
		const len = Number(contentLength);

		if (!Number.isFinite(len) || len < 0) {
			throw new Error("Invalid Content-Length");
		}

		if (len > options.maxRequestSize) {
			throw new Error("Request too large");
		}
	}
}

function readBoundary (ctx: Context): string {
	let ct = ctx.headers["content-type"].split(';');
	let boundary: string | undefined = undefined;
	for (let i=0; i<ct.length; i++) {
		let str = ct[i].trim();
		if (str.match(/^boundary\=.*$/)) {
			boundary = str.slice(str.indexOf('=') + 1);
			break;
		}
	}
	if (boundary === undefined) throw new Error("StreamingMultipartBody error: No boundary");

	return boundary;
}

export default function StreamingMultipartBody (options: StreamingMultipartOptions) {
	return async (ctx: Context) => {
		validateOptions(ctx, options);
		const boundary = readBoundary(ctx);

		const stream = ctx.raw.httpVersion === 1 ? ctx.raw.req : ctx.raw.stream;

		const parser = new Parser(options, boundary, stream);

		try {
			await parser.readyPromise;
			parser.clearTimeouts();
			ctx.body = parser.result;
		} catch (err: any) {
			await parser.cleanup();

			ctx.status(500).json({
				error: true,
				details: err.toString()
			});
		}
	}
}