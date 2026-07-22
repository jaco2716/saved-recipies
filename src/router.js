// Minimal hash-baseret router.
//
// Vi bruger hash-routing (#/...) i stedet for history-API, fordi det virker
// på GitHub Pages og når man åbner siden lokalt — uden server-konfiguration.
// URL'erne er delbare: #/ er forsiden, #/opskrift/<slug> er en enkelt opskrift.

const routes = [];
let notFoundHandler = () => {};

/**
 * Registrér en rute.
 * @param {RegExp} pattern - matcher mod stien (uden '#').
 * @param {(params: string[]) => void} handler
 */
export function route(pattern, handler) {
  routes.push({ pattern, handler });
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

function resolve() {
  const path = location.hash.replace(/^#/, "") || "/";
  for (const { pattern, handler } of routes) {
    const match = path.match(pattern);
    if (match) {
      handler(match.slice(1));
      return;
    }
  }
  notFoundHandler();
}

/** Start routeren og reagér på fremtidige navigationer. */
export function startRouter() {
  window.addEventListener("hashchange", resolve);
  resolve();
}

/** Naviger programmatisk. */
export function navigate(path) {
  location.hash = path;
}
