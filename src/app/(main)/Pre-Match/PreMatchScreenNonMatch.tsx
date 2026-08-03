import preMatchBackground from "/backgrounds/glitch-bg.webp";

import { BackButton } from "../../../components/ui/back-button";
import PrematchOptions from "./components/pre-match-option";

const PreNonMatchScreen = () => {
  return (
    <div className="bg-overgoal-dark-blue h-screen w-full p-4">
      <img
        src={preMatchBackground}
        alt="pre-match-background"
        className="absolute inset-0 z-0 h-full w-full object-cover"
      />
      <div className="z-100! relative flex w-full flex-col items-center justify-between">
        <BackButton className="mr-auto h-12 w-12" to="/" />

        <div className="z-100! flex h-full w-full flex-col items-center justify-center gap-12 pt-16">
          <div className="orbitron-medium mx-auto w-full max-w-2xl px-4 text-center text-sm leading-[120%] text-white">
            <div className="relative mx-auto w-[300px]">
              <img
                src="/backgrounds/container.webp"
                alt="container"
                className="scale-70 absolute -top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/3 -rotate-90 object-cover"
              />
              <p className="orbitron-medium z-100 absolute inset-0 top-10 text-center text-sm leading-[120%] text-white">
                Lorem ipsum dolor sit amet consectetur adipisicing elit.
                Sapiente eaque iusto est non deleniti deserunt consequatur
                tempore libero quae minima eius vero cum sit ullam, quasi eos
                nobis pariatur aspernatur!
              </p>
            </div>
            <div className="z-100 relative -bottom-60 mt-auto h-full w-full">
              <PrematchOptions className=" " />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

PreNonMatchScreen.displayName = "PreNonMatchScreen";
export default PreNonMatchScreen;
