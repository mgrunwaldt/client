import React from "react";

import CalendarItem from "./calendar-item";

type Props = {
  children: React.ReactNode;
};

export default function CalendarTeamItemComponent({ children }: Props) {
  return (
    <div className="h-35 w-23 relative flex items-center justify-center">
      <CalendarItem
        bgColor="#2b0045"
        noShadow
        borderColor="#9400ff"
        className="h-35 w-25 flex flex-col items-center"
      >
        {children}
      </CalendarItem>
      <div className="border-overgoal-purple text-overgoal-blue font-orbitron border-1 absolute bottom-0 right-0 flex h-8 w-20 flex-row items-center justify-between bg-[#1b002b] px-4 text-base font-normal">
        <span>-</span>
        <span>|</span>
        <span>-</span>
      </div>
    </div>
  );
}
