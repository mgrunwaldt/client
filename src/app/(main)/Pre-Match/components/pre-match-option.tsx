import { cn } from "../../../../utils/utils";

const options = [
  {
    id: 1,
    title: "Option 1",
  },
  {
    id: 2,
    title: "Option 2",
  },
  {
    id: 3,
    title: "Option 3",
  },
];

type PrematchOptionProps = {
  title: string;
};

const PrematchOption = ({ title }: PrematchOptionProps) => {
  return (
    <div className="pre-match-item-container h-full w-full rounded-lg bg-transparent p-6 text-center">
      <h3 className="text-lg font-bold text-white">{title}</h3>
    </div>
  );
};

type PrematchOptionsProps = {
  className?: string;
};
export default function PrematchOptions({ className }: PrematchOptionsProps) {
  return (
    <div
      className={cn(
        "z-100 flex w-full flex-col items-center justify-center gap-6 px-2",
        className,
      )}
    >
      {options.map((option) => (
        <PrematchOption key={option.id} title={option.title} />
      ))}
    </div>
  );
}
