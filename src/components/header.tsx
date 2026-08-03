import DojoRedLogo from "../assets/Dojo-Logo-Stylized-Red.svg";
import DojoLogo from "../assets/DojoByExample_logo.svg";
import StarknetLogo from "../assets/SN-Linear-Gradient.svg";

export function Header() {
  return (
    <div className="mb-12 text-center">
      <div className="flex items-center justify-center gap-12">
        {/* Dojo Engine Logo */}
        <div className="flex h-32 w-32 items-center justify-center p-2 transition-transform duration-300 hover:scale-105">
          <img
            src={DojoRedLogo}
            alt="Dojo"
            className="h-full w-full object-contain drop-shadow-lg filter"
          />
        </div>

        {/* Dojo By Example Logo*/}
        <div className="flex h-40 w-40 items-center justify-center transition-transform duration-500 hover:scale-105">
          <img
            src={DojoLogo}
            alt="Dojo By Example Logo"
            className="h-full w-full object-contain drop-shadow-2xl filter"
          />
        </div>

        {/* Starknet Logo */}
        <div className="flex h-40 w-40 items-center justify-center p-2 transition-transform duration-300 hover:scale-105">
          <img
            src={StarknetLogo}
            alt="Starknet"
            className="h-full w-full object-contain drop-shadow-lg filter"
          />
        </div>
      </div>

      <h1 className="mb-2 bg-gradient-to-r from-red-500 via-white to-blue-600 bg-clip-text py-2 text-3xl leading-normal font-bold text-transparent md:text-5xl">
        Se viene Overgoal papa
      </h1>
      <p className="mx-auto max-w-2xl px-4 text-lg text-slate-300 md:text-xl">
        <span className="bg-gradient-to-r from-red-400 to-blue-400 bg-clip-text font-semibold text-transparent">
          ARG - URU
        </span>{" "}
      </p>
    </div>
  );
}
