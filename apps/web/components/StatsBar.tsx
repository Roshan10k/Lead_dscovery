import { Users, Mail, Phone, Globe2 } from "lucide-react";
import type { Lead } from "@/lib/types";

export function StatsBar({ leads }: { leads: Lead[] }) {
  const withEmail = leads.filter((l) => l.email).length;
  const withPhone = leads.filter((l) => l.phone).length;
  const withWebsite = leads.filter((l) => l.website).length;

  const stats = [
    { label: "Leads found", value: leads.length, icon: Users, accent: "text-teal-400" },
    { label: "With email", value: withEmail, icon: Mail, accent: "text-cyan-400" },
    { label: "With phone", value: withPhone, icon: Phone, accent: "text-teal-400" },
    { label: "With website", value: withWebsite, icon: Globe2, accent: "text-cyan-400" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, accent }) => (
        <div
          key={label}
          className="group relative overflow-hidden rounded-2xl bg-slate-900/70 p-4 shadow-card ring-1 ring-white/10 backdrop-blur-xl transition-transform hover:-translate-y-0.5"
        >
          <div
            className={`pointer-events-none absolute -bottom-6 -right-6 h-24 w-24 rounded-full ${accent} opacity-[0.07] blur-xl`}
          />
          <div className="flex items-center justify-between text-slate-500">
            <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
            <Icon className={`h-4 w-4 ${accent}`} aria-hidden />
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-slate-100">{value}</p>
        </div>
      ))}
    </div>
  );
}
