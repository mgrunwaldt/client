import { Slot } from "@radix-ui/react-slot";
import { ChevronLeft } from "lucide-react";
import * as React from "react";
import { useNavigate } from "react-router";

import { cn } from "../../utils/utils";
import { Button } from "./button";

export interface BackButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  asChild?: boolean;
  to?: string;
}

const BackButton = React.forwardRef<HTMLButtonElement, BackButtonProps>(
  ({ className, asChild = false, to, onClick, ...props }, ref) => {
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
        {...props}
      >
        <div>
          <Button className="h-full w-full text-white opacity-100">
            <ChevronLeft className="h-6 w-6 text-white" />
          </Button>
        </div>
      </Comp>
    );
  },
);

BackButton.displayName = "BackButton";

export { BackButton };
