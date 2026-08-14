import { Slot } from "@radix-ui/react-slot";
import { ChevronLeft } from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router";

import { cn } from "../../utils/utils";

export interface BackButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  asChild?: boolean;
  to?: string;
}

const BackButton = React.forwardRef<HTMLButtonElement, BackButtonProps>(
  (
    {
      className,
      asChild = false,
      to,
      onClick,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const navigate = useNavigate();

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (onClick) {
        onClick(event);
      } else if (to) {
        navigate(to);
      } else {
        navigate(-1); // Go back to previous page
      }
    };

    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(
          "flex w-1/5 items-center justify-center bg-[url('/homepage/button_settings.svg')] bg-contain bg-center bg-no-repeat",
          className,
        )}
        ref={ref}
        onClick={handleClick}
        aria-label={ariaLabel ?? "Back"}
        {...props}
      >
        <ChevronLeft aria-hidden="true" className="h-6 w-6 text-white" />
      </Comp>
    );
  },
);

BackButton.displayName = "BackButton";

export { BackButton };
