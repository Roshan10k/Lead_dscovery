import { Users, Mail, Phone, Globe2 } from "lucide-react";
import type { Lead } from "@/lib/types";

export function StatsBar({ leads }: { leads: Lead[] }) {
  const withEmail = leads.filter((l) => l.email).length;
  const withPhone = leads.filter((l) => l.phone).length;
  const withWebsite = leads.filter((l) => l.website).length;

  const stats = [
    { label: "Leads found", value: leads.length, icon: Users },
    { label: "With email", value: withEmail, icon: Mail },
    { label: "With phone", value: withPhone, icon: Phone },
    { label: "With website", value: withWebsite, icon: Globe2 },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Icon className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
          </div>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
      ))}
    </div>
  );
}
