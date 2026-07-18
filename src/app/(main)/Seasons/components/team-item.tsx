import BoxContainer from "../../../../components/common/container";
import { SeasonTeam } from "./teams-list";

type SeasonTeamItemProps = SeasonTeam & {
  index: number;
  color?: "blue" | "purple";
};

const formatIndex = (index: number) => {
  return index < 10 ? `0${index}` : index;
};

export default function SeasonTeamItem({
  name,
  index,
  color,
  imageUrl,
}: SeasonTeamItemProps) {
  return (
    <BoxContainer
      color={color}
      isSingleSide={false}
      className="flex h-[80px] w-full items-center justify-start"
    >
      <BoxContainer
        color={color}
        isSingleSide={true}
        className="z-100! flex h-[50px] w-[50px] items-center justify-center"
      >
        <span
          className="font-orbitron text-center text-lg font-medium"
          style={{
            color: color === "blue" ? "var(--color-overgoal-blue)" : "white",
          }}
        >
          {formatIndex(index)}
        </span>
      </BoxContainer>
      <div className="flex h-full w-full flex-row items-center justify-between gap-4">
        <div className="flex flex-col items-start justify-start gap-2">
          <span className="font-orbitron ml-2 text-sm font-medium text-white">
            {name}
          </span>
          <span
            className="h-[1px] w-full"
            style={{
              backgroundColor:
                color === "purple"
                  ? "var(--color-overgoal-purple)"
                  : "var(--color-overgoal-blue)",
            }}
          ></span>
          <div className="ml-2 flex flex-row items-center justify-start gap-6">
            <div className="font-orbitron flex flex-row items-center justify-center gap-2 text-xs !font-light text-white">
              <span className="font-orbitron text-xs !font-medium text-white">
                Points:
              </span>
              <span className="font-orbitron text-xs !font-medium text-white">
                {0}
              </span>
            </div>
            <span className="font-orbitron flex flex-row items-center justify-center gap-2 text-xs !font-light text-white">
              <span className="font-orbitron text-xs !font-medium text-white">
                Members:
              </span>
              <span className="font-orbitron text-xs !font-medium text-white">
                {0}
              </span>
            </span>
          </div>
        </div>
        <div className="flex h-[50px] w-[50px] items-center justify-center">
          <img src={imageUrl} alt={name} width={50} height={50} />
        </div>
      </div>
    </BoxContainer>
  );
}
