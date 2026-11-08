"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  "aria-label": string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  containerClassName?: string;
  required?: boolean;
  disabled?: boolean;
};

const weekdays = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

function parseDateKey(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function displayDate(value: string): string {
  const date = parseDateKey(value);
  return date
    ? new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(date)
    : "Choisir une date";
}

/** Accessible shadcn-styled date field with an in-app calendar popover. */
export function DatePicker({
  "aria-label": ariaLabel,
  value,
  onChange,
  className,
  containerClassName,
  required,
  disabled,
}: DatePickerProps): React.ReactNode {
  const [open, setOpen] = React.useState(false);
  const selected = parseDateKey(value);
  const [visibleMonth, setVisibleMonth] = React.useState(() => {
    const initial = selected ?? new Date();
    return new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1, 12));
  });
  const rootRef = React.useRef<HTMLDivElement>(null);
  const monthTitle = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" }).format(visibleMonth);
  const year = visibleMonth.getUTCFullYear();
  const month = visibleMonth.getUTCMonth();
  const firstWeekday = (new Date(Date.UTC(year, month, 1, 12)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  React.useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  React.useEffect(() => {
    if (!selected) return;
    setVisibleMonth((current) => current.getUTCFullYear() === selected.getUTCFullYear() && current.getUTCMonth() === selected.getUTCMonth()
      ? current
      : new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1, 12)));
  }, [value]);

  const moveMonth = (offset: number) => setVisibleMonth(new Date(Date.UTC(year, month + offset, 1, 12)));

  return (
    <div ref={rootRef} className={cn("relative min-w-0", containerClassName)}>
      <Button
        type="button"
        variant="outline"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-required={required}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn("w-full justify-start gap-3 px-3 font-normal tabular-nums", className)}
      >
        <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !selected && "text-muted-foreground")}>{displayDate(value)}</span>
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-label="Choisir une date"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-[100] w-[min(20rem,calc(100vw-3rem))] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <Button type="button" size="icon" variant="ghost" aria-label="Mois précédent" onClick={() => moveMonth(-1)}>
              <ChevronLeft />
            </Button>
            <p className="text-sm font-semibold capitalize" aria-live="polite">{monthTitle}</p>
            <Button type="button" size="icon" variant="ghost" aria-label="Mois suivant" onClick={() => moveMonth(1)}>
              <ChevronRight />
            </Button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground" aria-hidden="true">
            {weekdays.map((day) => <span key={day} className="py-2">{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1" role="grid" aria-label={monthTitle}>
            {Array.from({ length: cellCount }, (_, index) => {
              const dayNumber = index - firstWeekday + 1;
              const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
              const date = new Date(Date.UTC(year, month, dayNumber, 12));
              const key = dateKey(date);
              const isSelected = key === value;
              const label = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(date);
              return (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "ghost"}
                  aria-label={label}
                  aria-pressed={isSelected}
                  className={cn("h-9 min-h-9 min-w-0 px-0", !inMonth && "text-muted-foreground/50")}
                  onClick={() => {
                    onChange(key);
                    setVisibleMonth(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12)));
                    setOpen(false);
                  }}
                >
                  {date.getUTCDate()}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
