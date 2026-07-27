// Ren logik til opskrifts-køen og historikken.
//
// Køen er de opskrifter man har handlet ind til og vil lave. Når en opskrift
// markeres som lavet, flyttes den til historikken ("nyligt i køen"). Al
// browser-persistering (localStorage) ligger i app.js — her er kun rene
// funktioner på almindelige arrays, så de er nemme at teste.
//
// Datamodel:
//   kø:        [{ slug, addedAt }]                (rækkefølge = ældst først)
//   historik:  [{ slug, addedAt, madeAt }]        (nyest først)

/** Hvor mange poster historikken højst gemmer. */
export const HISTORY_LIMIT = 30;

/** Er slug'en allerede i køen? */
export function isQueued(queue, slug) {
  return queue.some((item) => item.slug === slug);
}

/**
 * Læg en opskrift i køen. Dubletter ignoreres, så den oprindelige
 * tilføjelsestid bevares. Returnerer en ny kø (muterer ikke input).
 */
export function addToQueue(queue, slug, now = Date.now()) {
  if (isQueued(queue, slug)) return queue;
  return [...queue, { slug, addedAt: now }];
}

/** Fjern en opskrift fra køen igen — ren fortrydelse, gemmes ikke i historik. */
export function removeFromQueue(queue, slug) {
  return queue.filter((item) => item.slug !== slug);
}

/**
 * Markér en opskrift som lavet: fjern den fra køen og læg den øverst i
 * historikken med tidspunktet `now`. Samme opskrift optræder kun én gang i
 * historikken (nyeste tidspunkt vinder), og historikken beskæres til
 * HISTORY_LIMIT. Returnerer { queue, history } — begge nye arrays.
 */
export function markMade(queue, history, slug, now = Date.now()) {
  const queued = queue.find((item) => item.slug === slug);
  const entry = { slug, addedAt: queued?.addedAt ?? now, madeAt: now };
  const nextHistory = [entry, ...history.filter((h) => h.slug !== slug)].slice(0, HISTORY_LIMIT);
  return { queue: removeFromQueue(queue, slug), history: nextHistory };
}
