import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EventFeed } from "../src/app/(main)/Match/components/EventFeed";

const events = [
  {
    id: "event-1",
    minute: 4,
    text: "A quiet opening.",
    type: "neutral" as const,
  },
  {
    id: "event-2",
    minute: 11,
    text: "Dojo breaks forward.",
    type: "team-opportunity" as const,
  },
  {
    id: "event-3",
    minute: 18,
    text: "Cartridge City threatens.",
    type: "opponent-opportunity" as const,
  },
  {
    id: "event-4",
    minute: 20,
    text: "GOAL! Dojo finds the net.",
    type: "team-goal" as const,
  },
];

describe("timeline event feed", () => {
  it("promotes the current event once and retains only two recent moments", () => {
    const markup = renderToStaticMarkup(
      <EventFeed events={events} currentMinute={20} />,
    );

    expect(markup).toContain('data-current-event-id="event-4"');
    expect(markup.match(/data-event-id="event-4"/g)).toHaveLength(1);
    expect(markup).toContain('data-event-id="event-2"');
    expect(markup).toContain('data-event-id="event-3"');
    expect(markup).not.toContain('data-event-id="event-1"');
    expect(markup).toContain("Goal - your team");
    expect(markup).toContain("20&#x27;");
    expect(markup).toContain('data-event-type="team-goal"');
    expect(markup).toContain('data-score-link="event-4"');
  });

  it("uses distinct presentation semantics for each event family", () => {
    const familyEvents = [
      {
        id: "neutral",
        minute: 1,
        text: "Match pulse",
        type: "neutral" as const,
      },
      {
        id: "team-goal",
        minute: 2,
        text: "Goal for us",
        type: "team-goal" as const,
      },
      {
        id: "opponent-goal",
        minute: 3,
        text: "Goal against",
        type: "opponent-goal" as const,
      },
      {
        id: "team-opportunity",
        minute: 4,
        text: "We attack",
        type: "team-opportunity" as const,
      },
      {
        id: "opponent-opportunity",
        minute: 5,
        text: "They attack",
        type: "opponent-opportunity" as const,
      },
      {
        id: "possession",
        minute: 6,
        text: "Kept",
        type: "team-possession" as const,
      },
      {
        id: "lost",
        minute: 7,
        text: "Lost",
        type: "opponent-possession" as const,
      },
      {
        id: "card",
        minute: 8,
        text: "Booked",
        type: "disciplinary" as const,
      },
      {
        id: "break",
        minute: 9,
        text: "Half-time",
        type: "interval" as const,
      },
    ];

    const currentEventClasses: string[] = [];
    for (const event of familyEvents) {
      const markup = renderToStaticMarkup(
        <EventFeed events={[event]} currentMinute={event.minute} />,
      );
      expect(markup).toContain(`data-event-type="${event.type}"`);
      const className = markup.match(/<article[^>]*class="([^"]+)"/)?.[1];
      expect(className).toBeDefined();
      currentEventClasses.push(className!);
    }
    expect(new Set(currentEventClasses).size).toBe(familyEvents.length);
  });

  it("shows a purposeful live state during a quiet minute", () => {
    const markup = renderToStaticMarkup(
      <EventFeed events={events} currentMinute={21} />,
    );

    expect(markup).toContain("Match in motion");
    expect(markup).toContain("The next opening is building.");
    expect(markup).not.toContain("undefined");
  });

  it("distinguishes server work from an authoritative incoming opportunity", () => {
    const advancing = renderToStaticMarkup(
      <EventFeed events={events} currentMinute={21} advancing />,
    );
    const incoming = renderToStaticMarkup(
      <EventFeed events={events} currentMinute={21} opportunityIncoming />,
    );

    expect(advancing).toContain('data-testid="timeline-transition-feedback"');
    expect(advancing).toContain("Reading the play");
    expect(incoming).toContain("Opportunity incoming");
  });
});
