// Loose but sufficient shape check: requires "x@y.z", nothing else. Applied
// at every point an email enters the system — LLM output, a mailto href, a
// decoded Cloudflare-obfuscation string — as a single, shared plausibility
// gate. Found live that an LLM extraction call returned the literal string
// "[email protected]" (Cloudflare's obfuscation placeholder — its real
// email was hidden behind a `data-cfemail` attribute the LLM never saw as
// text) as if it were a real address; this regex rejects it outright, since
// "protected]" has no dot and isn't a valid domain shape.
const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPlausibleEmail(value: string | null | undefined): value is string {
  return !!value && PLAUSIBLE_EMAIL.test(value);
}
