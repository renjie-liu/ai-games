// The files that are the page: what the game's server sends to a browser, and what is copied when
// the page is published as plain files somewhere else (deploy/static-site.mjs). Nothing of the
// rules or of a room's private facts is among them: those stay on the server.
export const PAGE='play.html';
export const PAGE_FILES=Object.freeze(['play.mjs','scene.mjs','play.css','voice-client.mjs','live-client.mjs','mic-worklet.js',
  'vendor/three.module.min.js','vendor/three.core.min.js']);
// Carried along with a published copy, never requested by the page.
export const PAGE_NOTICES=Object.freeze(['vendor/THREE-LICENSE.txt']);
// Where the page says which server it talks to. Empty on the server's own page.
export const SERVER_META='<meta name="partition-server" content="">';
