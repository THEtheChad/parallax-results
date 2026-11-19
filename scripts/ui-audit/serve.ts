// The audit's server: the production build (dist/, from `pnpm build`) over plain HTTP, once per data
// set. The site is static with relative asset paths (vite.config.ts: base "./") and fetches
// data/index.json relative to the page, so the same build serves every set under its own prefix:
//
//   /<set>/            dist/index.html and its assets
//   /<set>/data/...    that set's data directory (dist/data for `real`, a fixture set's otherwise)
//
// No rewriting, no caching, nothing outside those two trees. `vite preview` cannot swap the data
// per set, which is why this exists; it serves the same files.
//
//   node scripts/ui-audit/serve.ts      serves dist/ and every fixture set for a look by hand

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export interface Served {
  readonly origin: string;
  close(): Promise<void>;
}

/** A file under `root`, or undefined for anything that escapes it or is not a file. */
function inside(root: string, rest: string): string | undefined {
  const file = resolve(root, normalize(rest).replace(/^([/\\])+/, ""));
  if (file !== root && !file.startsWith(root + sep)) return undefined;
  return existsSync(file) && statSync(file).isFile() ? file : undefined;
}

/** Serve `dist` under `/<set>/`, each set's data under `/<set>/data/`, on 127.0.0.1:`port`. */
export function serve(opts: { port: number; dist: string; data: Record<string, string> }): Promise<Served> {
  const dist = resolve(opts.dist);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const [, set, ...rest] = path.split("/");
    const dataDir = set ? opts.data[set] : undefined;
    let file: string | undefined;
    if (dataDir && rest[0] === "data") file = inside(resolve(dataDir), rest.slice(1).join("/"));
    else if (dataDir) file = inside(dist, rest.join("/") || "index.html");
    if (!file || (req.method !== "GET" && req.method !== "HEAD")) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
  });
  return new Promise((done, fail) => {
    server.once("error", (e: NodeJS.ErrnoException) =>
      fail(e.code === "EADDRINUSE" ? new Error(`port ${opts.port} is in use: stop what holds it, or set AUDIT_PORT`) : e),
    );
    server.listen(opts.port, "127.0.0.1", () =>
      done({
        origin: `http://127.0.0.1:${opts.port}`,
        close: () => new Promise((closed) => server.close(() => closed())),
      }),
    );
  });
}

if (import.meta.main) {
  const { STUB_SETS, writeFixtureSets } = await import("./fixtures.ts");
  const root = resolve(import.meta.dirname, "../..");
  const dist = join(root, "dist");
  if (!existsSync(join(dist, "index.html"))) throw new Error("no dist/index.html: run `pnpm build` first");
  const data: Record<string, string> = { real: join(dist, "data"), ...writeFixtureSets() };
  const port = Number(process.env.AUDIT_PORT ?? 4179);
  const s = await serve({ port, dist, data });
  for (const set of ["real", ...STUB_SETS]) console.log(`${set}: ${s.origin}/${set}/`);
}
