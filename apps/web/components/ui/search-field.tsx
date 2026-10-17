import { Search } from "lucide-react";
import { Input } from "./input";

export function SearchField({ placeholder = "Rechercher..." }: { placeholder?: string }): React.ReactNode {
  return <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder={placeholder} aria-label={placeholder} /></div>;
}
