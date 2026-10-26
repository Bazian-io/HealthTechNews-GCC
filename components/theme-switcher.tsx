"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const ICON_SIZE = 16;

const ThemeSwitcher = () => {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const { theme, setTheme } = useTheme();
  const selectedTheme =
    theme === "light" || theme === "dark" ? theme : "system";

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        aria-label="Loading color theme"
        className="rounded-md border border-border bg-card"
      >
        <Laptop size={ICON_SIZE} aria-hidden="true" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Color theme: ${selectedTheme}. Change color theme`}
          title="Change color theme"
          className="rounded-md border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          {selectedTheme === "light" ? (
            <Sun
              key="light"
              size={ICON_SIZE}
              aria-hidden="true"
            />
          ) : selectedTheme === "dark" ? (
            <Moon
              key="dark"
              size={ICON_SIZE}
              aria-hidden="true"
            />
          ) : (
            <Laptop
              key="system"
              size={ICON_SIZE}
              aria-hidden="true"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-36" align="end">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={selectedTheme}
          onValueChange={setTheme}
        >
          <DropdownMenuRadioItem className="flex gap-2" value="light">
            <Sun size={ICON_SIZE} aria-hidden="true" />
            <span>Light</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem className="flex gap-2" value="dark">
            <Moon size={ICON_SIZE} aria-hidden="true" />
            <span>Dark</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem className="flex gap-2" value="system">
            <Laptop size={ICON_SIZE} aria-hidden="true" />
            <span>System</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { ThemeSwitcher };
