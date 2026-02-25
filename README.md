# Currents

**Currents** is a lightweight pipeline-based API constructor, designed to cover 90% of API use cases.

## Features

* 🚦 Routing
* 🌍 CORS headers
* 🍪 Cookie management
* 🛡️ Security headers
* 📂 Static file delivery
* 📦 Parsing of popular request bodies (JSON, multipart, etc.)
* ⚡ HTTP/2 support

## Concept

Currents is **pipeline-based**: every route is treated as a chain of handlers. Instead of plugin registration, you just add or remove handlers from the chain. This gives you full control over every route.

---

## Installation

```bash
npm install @tripod311/currents
```

---

## Example

```ts
import { Currents, Context, JsonBody, MultipartBody, ServeStatic } from "@tripod311/currents"

const app = Currents.fromOptions({});

app.get("/", [
	(ctx: Context) => {
		ctx.text("Hello world");
	}
]);

app.post('/table/:id', [
	JsonBody,
	(ctx: Context) => {
		const body = ctx.body as { some: "body" };
		ctx.json({ hello: "world" });
	}
]);

app.put('/images/*', [
	MultipartBody,
	(ctx: Context) => {
		// some operations with body
		ctx.binary(result_buffer);
	}
]);

app.get('/images/', [
	ServeStatic({
		basePath: '/images',
		rootDir: '/home/me/images',
		cacheControl: ["public", "max-age=0"],
		fallback: 'default.png'
	})
])

app.server.listen({ port: 80 });
```

---

## API

### Currents

The main application class. Holds the server and provides the interface for routing.

#### Constructor

```ts
Currents.fromOptions({
	forceHttpVersion?: 1 | 2,
	certificates: {
		cert: "path-to-cert",
		key: "path-to-key",
		ca?: "path-to-ca"
	}
})
```

* Creates the app and sets up the server with given configuration.
* If you don’t force HTTP version: with certificates → defaults to **HTTP/2**, without → defaults to **HTTP/1**.

```ts
Currents.fromServer(server: HttpServer | Http2Server)
```

* Create Currents app with an already configured server.

#### Methods

```ts
app.get(route: string, handlers: RouteHandler[])
app.post(route: string, handlers: RouteHandler[])
app.put(route: string, handlers: RouteHandler[])
app.delete(route: string, handlers: RouteHandler[])
app.any(route: string, handlers: RouteHandler[])
```

#### Properties

```ts
app.notFoundHandler(chain: RouteHandler[])
```

Custom 404 handler. By default returns: `Cannot find ${route}`.

```ts
app.errorHandler(handler: (err: any, ctx: Context) => void)
```

Custom error handler.

---

### Context

Context represents a single request/response.

#### Properties

* `ctx.method: string` → Request method
* `ctx.path: string` → URL-decoded request path
* `ctx.headers: Record<string, string>` → Request headers
* `ctx.cookies: Record<string, string>` → Filled if you use `ParseCookies`
* `ctx.params: Record<string, string>` → Route params (`/table/:id`)
* `ctx.query: UrlSearchParams` → Query parameters
* `ctx.body: any` → Filled if body parsers are used
* `ctx.locals: Record<string, any>` → Custom data (pass between handlers)
* `ctx.finished: boolean` → Response already sent
* `ctx.notFound: boolean` → NotFound chain should be executed

#### Methods

* `ctx.responseHeader(header, value)` → set response header
* `ctx.status(code)` → set HTTP status
* `ctx.json(value)` → send JSON with proper header
* `ctx.text(value)` → send text response
* `ctx.binary(value)` → send buffer response
* `ctx.send(data, contentLength?)` → send custom buffer or stream
* `ctx.end()` → end response with empty body
* `ctx.redirect(to)` → 307 redirect
* `ctx.callNotFound()` → call default notFound chain

---

### Body parsers

Default handlers to populate `ctx.body`:

```ts
import { BinaryBody, TextBody, JsonBody, FormBody, MultipartBody } from "@tripod311/currents"
```

* **BinaryBody** → dumps buffer into body
* **TextBody** → UTF-8 string body
* **JsonBody** → parses JSON
* **FormBody** → parses `application/x-www-form-urlencoded`
* **MultipartBody** → parses multipart bodies (only for tests, stores request in memory, can cause OOM errors and vulnerable to attacks)
* **StreamingMultipartBody** → streaming multipart/form-data parser, for real cases

---

### Cookies

```ts
import { Context, ParseCookies, SetCookie } from "@tripod311/currents"

app.get('/', [
	ParseCookies(),
	(ctx: Context) => {
		ctx.cookies; // filled with cookies
		SetCookie(ctx, 'myCookie', 'myValue', {
			maxAge?: number,
			expires?: Date,
			httpOnly?: boolean,
			secure?: boolean,
			sameSite?: "Strict" | "Lax" | "None",
			path?: string,
			domain?: string
		});
	}
])
```

You can provide a secret string to `ParseCookies` if you want signed cookies.

---

### Static files

```ts
import { ServeStatic } from "@tripod311/currents"

app.get('/*', [
	ServeStatic({
		basePath: '/',
		rootDir: '/home/me/site',
		cacheControl: ["public", "max-age=0"],
		fallback: 'index.html'
	})
])
```

* **cacheControl** and **fallback** are optional
* **basePath** defines which part of path should be cut before file lookup
* **fallback** is useful for SPA

---

### CORS

```ts
import { Cors } from "@tripod311/currents"

app.get('/*', [
	Cors({
		allowedOrigin: string | string[],
		allowedMethods?: string[],
		allowedHeaders?: '*' | string[],
		credentials?: boolean
	})
])
```

Passing asterisk in allowedHeaders field will make cors reply with access-control-request-headers that browser requires.

---

### Security headers

```ts
import { SecurityHeaders } from "@tripod311/currents"

app.get('/*', [
	SecurityHeaders({
		contentTypeOptions?: boolean,
		xFrameOptions?: 'DENY' | 'SAMEORIGIN',
		referrerPolicy?: "no-referrer" | "no-referrer-when-downgrade" | "origin" | "origin-when-cross-origin" | "same-origin" | "strict-origin" | "strict-origin-when-cross-origin" | "unsafe-url",
		transportSecurity?: {
			maxAge: number,
			includeSubDomains?: boolean,
			preload?: boolean
		},
		contentSecurityPolicy?: string,
		crossOriginResourcePolicy?: 'same-origin' | 'same-site' | 'cross-origin',
		permissionsPolicy?: string
	})
])
```

---

### Streaming Multipart

``` ts
import { StreamingMultipartBody } from "@tripod311/currents"
import type { StreamingMultipartResult, StreamingMultipartFile, StreamingMultipartOptions } from "@tripod311/currents"

app.post('/*', [
    StreamingMultipartBody({
        tmpDir: "/path/to/folder/for/temp/files",
        maxRequestSize: 1024 * 1024 * 150,          // 150 MB
        maxFileSize: 1024 * 1024 * 100,             // 100 MB
        maxFieldSize: 1024 * 1024 * 10,             // 10 MB
        maxPartHeaderSize: 1024 * 16,               // 16 KB
        maxParts: 50,
        maxFiles: 10,
        requestTimeout: 1000 * 60 * 5,              // 5 min
        chunkTimeout: 1000 * 30                     // 30 sec
    })
])
```

This middleware provides a **streaming, production-safe
multipart/form-data parser** designed for handling large file uploads
(up to \~100--200 MB) without loading entire files into memory.

It uses:

-   a streaming state machine
-   strict size limits
-   request and chunk timeouts
-   disk-backed file storage
-   DoS protection (limits on parts, headers, files, etc.)

The values shown above are example limits, but they are reasonable
defaults for real-world API usage and can safely be used as a starting
point.

------------------------------------------------------------------------

#### Result structure

After successful parsing, `ctx.body` will contain:

``` ts
export type StreamingMultipartResult =
    Record<string, string | StreamingMultipartFile>;
```

Text fields are returned as strings.\
File fields are returned as `StreamingMultipartFile` instances:

``` ts
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
```

##### Example

``` ts
app.post('/upload', async (ctx) => {
    const body = ctx.body as StreamingMultipartResult;

    const username = body.username as string;
    const avatar = body.avatar as StreamingMultipartFile;

    await avatar.move(`/permanent/storage/${avatar.originalFileName}`);
});
```

------------------------------------------------------------------------

#### ⚠ Temporary file lifecycle

Uploaded files are written to the temporary directory specified in
`tmpDir`.

You are responsible for either:

-   moving the file to permanent storage using `move()`, or
-   manually deleting it using `clear()`.

The middleware **only removes temporary files automatically in case of
an error** (e.g. size limit exceeded, timeout, malformed multipart).

If the request completes successfully, file cleanup is your
responsibility.

Simplest way to cleanup:

```ts
app.post('/upload', async (ctx) => {
    const body = ctx.body as StreamingMultipartResult;

    // Some actions with body

    await ctx.locals.bodyCleanup();
});
````

------------------------------------------------------------------------

#### Why streaming?

This parser:

-   never loads full files into memory
-   processes request data chunk by chunk
-   enforces strict limits to prevent OOM and slowloris attacks
-   validates multipart boundaries safely across chunk splits

It is suitable for APIs that need controlled large-file handling without
relying on third-party multipart libraries.
