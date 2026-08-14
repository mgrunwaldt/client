import { clamp } from "./kick-input";

export interface KickContactFeedback {
  power: {
    label: "Soft touch" | "Controlled" | "Driven" | "Full power";
    level: 1 | 2 | 3 | 4 | 5;
  };
  flight: "Lofted" | "Rising" | "Level" | "Skimming";
  curve: "Curl left" | "Straight" | "Curl right";
}

export function kickContactFeedback(
  power: number,
  contact: { x: number; y: number },
): KickContactFeedback {
  const boundedPower = clamp(power, 0, 1);
  const powerFeedback: KickContactFeedback["power"] =
    boundedPower < 0.3
      ? { label: "Soft touch", level: 1 }
      : boundedPower < 0.5
        ? { label: "Controlled", level: 2 }
        : boundedPower < 0.7
          ? { label: "Driven", level: 3 }
          : boundedPower < 0.88
            ? { label: "Driven", level: 4 }
            : { label: "Full power", level: 5 };

  const flight: KickContactFeedback["flight"] =
    contact.y <= -0.55
      ? "Lofted"
      : contact.y <= -0.18
        ? "Rising"
        : contact.y >= 0.45
          ? "Skimming"
          : "Level";
  const curve: KickContactFeedback["curve"] =
    contact.x >= 0.22
      ? "Curl left"
      : contact.x <= -0.22
        ? "Curl right"
        : "Straight";

  return { power: powerFeedback, flight, curve };
}
