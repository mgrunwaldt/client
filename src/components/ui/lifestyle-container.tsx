import { Link } from "react-router";

import { getIcon } from "../../utils/iconMap";
import { cn } from "../../utils/utils";
import { Button } from "./button";

interface HomeMenuItemProps {
  borderColor?: string;
  backgroundColor?: string;
  position?: "left" | "right";
  className?: string;
  href?: string;
  icon?: string;
  title?: string;
  size?: "small" | "large";
  disabled?: boolean;
}

export function HomeMenuItem({
  borderColor = "var(--color-overgoal-light-blue)",
  backgroundColor = "#0b3d41",
  position = "left",
  className = "",
  href = "/calendar",
  icon = "Calendar",
  title = "Calendar",
  size = "large",
  disabled = false,
}: HomeMenuItemProps) {
  const clipClass =
    position === "left" ? "lifestyle-clip-left" : "lifestyle-clip-right ";

  const containerSize =
    size === "small"
      ? "max-w-[80px] max-h-[90px]"
      : "max-w-[90px] max-h-[97px]";

  return (
    <div
      className={`lifestyle-container ${containerSize} ${position === "left" ? "ml-auto" : "mr-auto"} flex h-full w-full flex-col items-center justify-center gap-1 p-2 ${clipClass} ${className}`}
      style={
        {
          "--lifestyle-border-color": borderColor,
          "--lifestyle-bg-color": backgroundColor,
        } as React.CSSProperties
      }
    >
      <div className="lifestyle-inner-container h-full w-full">
        <Link to={disabled ? "" : href}>
          <Button
            disabled={disabled}
            className="lifestyle-inner-container flex h-full w-full flex-col items-center justify-center gap-2 p-4"
          >
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-2",
                position === "left" ? "-rotate-10" : "rotate-10",
              )}
            >
              <img
                loading="lazy"
                src={getIcon(icon as keyof typeof getIcon)}
                alt={title}
                className={cn(
                  "h-6 w-6 -rotate-2",
                  position === "left" ? "-rotate-2" : "-rotate-2",
                )}
              />
              <p
                className={cn(
                  "orbitron-medium rotate-2 text-[7px] uppercase text-white",
                  position === "left" ? "rotate-2" : "-rotate-2",
                )}
              >
                {title}
              </p>
            </div>
          </Button>
        </Link>
      </div>
    </div>
  );
}
