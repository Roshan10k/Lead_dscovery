// lucide-react dropped brand/logo icons in recent versions (trademark
// reasons), so these are hand-written rather than pulling in a whole
// separate icon library just for four glyphs.

type IconProps = { className?: string };

export function FacebookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M13.5 21v-7.5h2.5l.4-3H13.5V8.5c0-.87.24-1.46 1.49-1.46H16.5V4.36C16.2 4.32 15.2 4.24 14 4.24c-2.4 0-4 1.46-4 4.15V10.5H7.5v3H10V21h3.5z" />
    </svg>
  );
}

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LinkedinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M6.94 8.5H4V20h2.94V8.5zM5.47 7.18a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM20 20v-6.3c0-3.37-1.8-4.94-4.2-4.94-1.94 0-2.8 1.07-3.28 1.82V8.5H9.58S9.62 9.4 9.58 20h2.94v-6.14c0-.33.02-.66.12-.9.26-.66.86-1.34 1.86-1.34 1.31 0 1.84.99 1.84 2.45V20H20z" />
    </svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M13.6 10.6 20 4h-1.9l-5.6 6.1L8 4H3l6.7 9.2L3 20h1.9l5.9-6.4L15.9 20H21l-7.4-9.4zM11.6 12.5l-.7-.9L5.4 5.3h2l4.4 6 .7.9 5.8 8h-2l-4.7-6.7z" />
    </svg>
  );
}
