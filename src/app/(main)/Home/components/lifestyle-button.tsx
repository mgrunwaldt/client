import { Link } from "react-router";

import { Button } from "../../../../components/ui/button";
import { cn } from "../../../../utils/utils";
import { getIcon } from "../../../../utils/utils";

type Props = {
  icon: string;
  title: string;
  href: string;
};

export const LifestylesButton = ({ icon, title, href }: Props) => {
  return (
    <div
      className={cn(
        "flex h-full max-h-[97px] w-full max-w-[85px] flex-col items-center justify-center gap-1 p-2",
        "lifestyle-container",
        "ml-auto",
      )}
    >
      <Link to={href}>
        <Button className="lifestyle-inner-container flex h-full w-full flex-col items-center justify-center gap-2 p-4">
          <div className="flex -rotate-10 flex-col items-center justify-center gap-2">
            <img
              src={getIcon(icon)}
              alt={title}
              className="h-10 w-10 -rotate-2"
            />
            <p className="orbitron-medium text-[8px] text-white uppercase">
              {title}
            </p>
          </div>
        </Button>
      </Link>
    </div>
  );
};
