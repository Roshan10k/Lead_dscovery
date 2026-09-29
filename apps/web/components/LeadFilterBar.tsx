import { Mail, Sparkles, ArrowUpDown, Download } from "lucide-react";

interface Props {
  emailOnly: boolean;
  onToggleEmailOnly: () => void;
  newOnly: boolean;
  onToggleNewOnly: () => void;
  sortAZ: boolean;
  onToggleSortAZ: () => void;
  exportUrl: string;
}

function ToggleButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Mail;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
        active
          ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-glow-teal"
          : "bg-slate-900/70 text-slate-400 ring-1 ring-white/10 hover:text-slate-200"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </button>
  );
}

export function LeadFilterBar({
  emailOnly,
  onToggleEmailOnly,
  newOnly,
  onToggleNewOnly,
  sortAZ,
  onToggleSortAZ,
  exportUrl,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleButton active={emailOnly} onClick={onToggleEmailOnly} icon={Mail}>
        Has email
      </ToggleButton>
      <ToggleButton active={newOnly} onClick={onToggleNewOnly} icon={Sparkles}>
        New only
      </ToggleButton>
      <ToggleButton active={sortAZ} onClick={onToggleSortAZ} icon={ArrowUpDown}>
        A–Z
      </ToggleButton>
      <a
        href={exportUrl}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900/70 px-3 py-1.5 text-sm text-slate-400 ring-1 ring-white/10 transition hover:text-slate-200 hover:shadow-glow-cyan"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Export CSV
      </a>
    </div>
  );
}
