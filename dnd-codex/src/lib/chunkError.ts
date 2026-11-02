// Decides whether a render error means "a lazy chunk is gone after a deploy".
// Browsers word that failure differently, so match loosely:
//   Chrome:  "Failed to fetch dynamically imported module" or, when the server
//            answers with index.html, "Failed to load module script: Expected a
//            JavaScript module script but the server responded with a MIME type
//            of "text/html""
//   Firefox: "error loading dynamically imported module" or "Loading module from
//            ... was blocked because of a disallowed MIME type ("text/html")"
//   Safari:  "Importing a module script failed.", a bare "Load failed", or, for
//            an index.html reply, "'text/html' is not a valid JavaScript MIME
//            type." (T-58: this one matched nothing, so Safari never reloaded)
export function isChunkLoadError(msg: string): boolean {
  return /dynamic(ally)? import|imported module|module script|loading chunk|chunkloaderror|failed to fetch|load failed|mime type/i.test(
    msg,
  )
}
