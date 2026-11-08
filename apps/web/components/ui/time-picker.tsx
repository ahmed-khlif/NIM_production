"use client";

import { Clock3 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type TimePickerProps = {
  "aria-label": string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
};

const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));

/** Shadcn select-based 24-hour time picker with minute-level precision. */
export function TimePicker({ "aria-label": ariaLabel, value, onChange, className, disabled }: TimePickerProps): React.ReactNode {
  const [hour, minute] = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)?.slice(1) ?? ["08", "00"];
  const update = (nextHour: string, nextMinute: string) => onChange(`${nextHour}:${nextMinute}`);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex h-11 min-w-0 items-center gap-0 rounded-md border border-input bg-background px-1 shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2", className)}
    >
      <Clock3 aria-hidden="true" className="ml-1 size-4 shrink-0 text-muted-foreground" />
      <Select value={hour} onValueChange={(nextHour) => update(nextHour, minute)} disabled={disabled}>
        <SelectTrigger aria-label={`${ariaLabel}, heure`} className="h-9 min-h-9 w-12 border-0 bg-transparent px-0.5 shadow-none focus:ring-0 focus:ring-offset-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64 min-w-[5rem]">
          {hours.map((item) => <SelectItem key={item} value={item} className="min-h-9">{item}</SelectItem>)}
        </SelectContent>
      </Select>
      <span aria-hidden="true" className="text-sm font-semibold text-muted-foreground">:</span>
      <Select value={minute} onValueChange={(nextMinute) => update(hour, nextMinute)} disabled={disabled}>
        <SelectTrigger aria-label={`${ariaLabel}, minutes`} className="h-9 min-h-9 w-12 border-0 bg-transparent px-0.5 shadow-none focus:ring-0 focus:ring-offset-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64 min-w-[5rem]">
          {minutes.map((item) => <SelectItem key={item} value={item} className="min-h-9">{item}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
