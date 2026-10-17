"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ThemeToggle(): React.ReactNode {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "Activer le thème clair" : "Activer le thème sombre";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-slate-500 dark:text-slate-300"
          aria-label={label}
          onClick={() => setTheme(dark ? "light" : "dark")}
          disabled={!mounted}
        >
          {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
