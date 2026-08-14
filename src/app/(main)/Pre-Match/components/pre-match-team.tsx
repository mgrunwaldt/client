import { cn } from "../../../../utils/utils";
type PreMatchTeamProps = {
  teamName: string;
  teamImage?: string;
  side: "left" | "right";
  isMyTeam?: boolean;
};

export default function PreMatchTeam({
  teamName,
  side,
  isMyTeam,
  teamImage,
}: PreMatchTeamProps) {
  // Split team name into words for better line breaking
  const formatTeamName = (name: string) => {
    const words = name.split(" ");
    if (words.length <= 2) {
      return name;
    }

    // For names with more than 2 words, split into two lines
    const midPoint = Math.ceil(words.length / 2);
    const firstLine = words.slice(0, midPoint).join(" ");
    const secondLine = words.slice(midPoint).join(" ");

    return (
      <>
        <span className="block">{firstLine}</span>
        <span className="block">{secondLine}</span>
      </>
    );
  };

  return (
    <article className="relative h-full min-h-0 min-w-0 flex-1">
      <div
        className="absolute inset-0 z-0 h-full w-full bg-contain bg-center bg-no-repeat"
        style={{
          backgroundImage: isMyTeam
            ? "url('/pre-match/myTeamContainer.svg')"
            : "url('/pre-match/enemyTeamContainer.svg')",
        }}
      />

      <div
        className={cn(
          "relative z-10 flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 px-2 py-3",
          side === "left" ? "pr-4" : "pl-4",
        )}
      >
        <div className="flex h-[clamp(2.5rem,12vw,4rem)] w-[clamp(2.5rem,12vw,4rem)] shrink-0 items-center justify-center">
          <img
            src={teamImage ?? "/logo.png"}
            alt={`${teamName} crest`}
            className="h-full w-full object-contain"
          />
        </div>
        <h1
          aria-label={teamName}
          className={cn(
            "font-orbitron mx-auto max-w-[140px] text-center text-[clamp(0.65rem,3.2vw,1rem)] leading-tight font-bold text-white uppercase",
            isMyTeam ? "text-overgoal-lime-green" : "text-overgoal-error",
          )}
        >
          {formatTeamName(teamName)}
        </h1>
      </div>
    </article>
  );
}
