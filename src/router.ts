import { Context } from "./context.js"

export type RouteHandler = (ctx: Context) => Promise<void>;

export interface Route {
	pathname: string;
	pattern: RegExp;
	keys: string[];
	staticParts: number;
	parametricParts: number;
	handlers: RouteHandler[];
}

export interface RouteMatch {
	handlers: RouteHandler[];
	params: Record<string, string>;
}

export class Router {
	private staticRoutes: Route[] = [];
	private parametricRoutes: Route[] = [];
	private wildcardRoutes: Route[] = [];

	add (path: string, handlers: RouteHandler[]) {
		const { pattern, keys } = Router.pathToRegex(path);
		const route: Route = {
			pathname: path,
			pattern: pattern,
			keys: keys,
			staticParts: 0,
			parametricParts: 0,
			handlers: handlers
		};
		let isWildCard = false;

		const sp = path.split('/');

		for (const hop of sp) {
			if (hop === "*") {
				if (sp.indexOf(hop) !== sp.length - 1) {
					console.warn(`Wildcard '*' should be last hop: ${path}`);
				}
				isWildCard = true;
			} else if (hop.charAt(0) === ':') {
				route.parametricParts++;
			} else {
				route.staticParts++;
			}
		}

		if (isWildCard) {
			this.injectRoute(route, this.wildcardRoutes);
		} else if (route.parametricParts > 0) {
			this.injectRoute(route, this.parametricRoutes);
		} else {
			this.injectRoute(route, this.staticRoutes);
		}
	}

	private injectRoute (route: Route, collection: Route[]) {
		let index = 0;

		while (index < collection.length) {
			const r = collection[index];

			if ((r.parametricParts < route.parametricParts) ||
				(r.parametricParts === route.parametricParts && r.staticParts < route.staticParts)) {

				collection.splice(index, 0, route);
				return;
			}

			index++;
		}

		collection.push(route);
	}

	private static pathToRegex (path: string) {
		const keys: string[] = [];

		const regex = path
			.split("/")
			.map(seg => {
				if (seg.startsWith(":")) {
					keys.push(seg.slice(1));
					return "([^/]+)";
				}
				if (seg === "*") {
					return "(.*)?";
				}
				return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape
			})
			.join("/");

		return { 
			pattern: new RegExp("^" + regex + "$"), 
			keys 
		};
	}

	match (pathname: string): RouteMatch | null {
		for (const route of this.staticRoutes) {
			if (pathname === route.pathname) {
				return {
					handlers: route.handlers,
					params: {}
				};
			}
		}

		for (const route of this.parametricRoutes) {
			const match = pathname.match(route.pattern);

			if (match !== null) {
				const routeParams: Record<string, string> = {};

				for (let i=0; i<route.keys.length; i++) {
					routeParams[route.keys[i]] = match[i+1];
				}

				return {
					handlers: route.handlers,
					params: routeParams
				};
			}
		}

		for (const route of this.wildcardRoutes) {
			const match = pathname.match(route.pattern);

			if (match !== null) {
				const routeParams: Record<string, string> = {};

				for (let i=0; i<route.keys.length; i++) {
					routeParams[route.keys[i]] = match[i+1];
				}

				return {
					handlers: route.handlers,
					params: routeParams
				};
			}
		}

		return null;
	}
}