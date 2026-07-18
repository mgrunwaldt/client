function assertInvariant(condition, file, message) {
  if (!condition) throw new Error(`${file}: ${message}`);
}

function schemaNameFromRef(ref) {
  const prefix = "#/components/schemas/";
  if (typeof ref !== "string" || !ref.startsWith(prefix)) return null;
  return ref.slice(prefix.length);
}

export function buildCanonicalChoiceMatrix(openapi) {
  const schemas = openapi.components?.schemas ?? {};
  const pendingActionBranches = schemas.PendingAction?.oneOf ?? [];
  const branchSchemaNames = pendingActionBranches.map((branch) =>
    schemaNameFromRef(branch.$ref),
  );
  assertInvariant(
    branchSchemaNames.length > 0 && branchSchemaNames.every(Boolean),
    "openapi.json",
    "PendingAction must contain local canonical schema branches",
  );

  const matrix = new Map();
  for (const schemaName of branchSchemaNames) {
    const schema = schemas[schemaName];
    const choiceBranch = schema?.allOf?.find(
      (branch) => branch["x-overgoal-choice-ids"] !== undefined,
    );
    const sceneType = choiceBranch?.properties?.scene_type?.const;
    const choiceIds = choiceBranch?.["x-overgoal-choice-ids"];
    assertInvariant(
      typeof sceneType === "string" &&
        Array.isArray(choiceIds) &&
        choiceIds.length > 0 &&
        choiceIds.every((choiceId) => typeof choiceId === "string"),
      "openapi.json",
      `${schemaName} must declare a scene type and x-overgoal-choice-ids`,
    );
    assertInvariant(
      new Set(choiceIds).size === choiceIds.length,
      "openapi.json",
      `${schemaName} contains duplicate x-overgoal-choice-ids`,
    );
    assertInvariant(
      !matrix.has(sceneType),
      "openapi.json",
      `duplicate canonical choice matrix for ${sceneType}`,
    );
    matrix.set(sceneType, { choiceIds, schemaName });
  }

  return matrix;
}

function assertEventSequence(
  events,
  file,
  { eventCounter, expectedMinute, matchId, maximumMinute } = {},
) {
  assertInvariant(Array.isArray(events), file, "events must be an array");
  const eventIds = new Set();
  let previousEventId = 0;
  let previousMinute = 0;
  const sequenceMatchId = matchId ?? events[0]?.match_id;

  for (const event of events) {
    assertInvariant(
      !eventIds.has(event.event_id),
      file,
      `duplicate event_id ${event.event_id}`,
    );
    assertInvariant(
      Number.isInteger(event.event_id) && event.event_id > previousEventId,
      file,
      "events must be strictly ordered by event_id",
    );
    assertInvariant(
      Number.isInteger(event.minute) && event.minute >= previousMinute,
      file,
      "event minutes must be nondecreasing",
    );
    if (expectedMinute !== undefined) {
      assertInvariant(
        event.minute === expectedMinute,
        file,
        `event ${event.event_id} minute must equal response minute ${expectedMinute}`,
      );
    }
    if (maximumMinute !== undefined) {
      assertInvariant(
        event.minute <= maximumMinute,
        file,
        `event ${event.event_id} occurs after match minute ${maximumMinute}`,
      );
    }
    if (sequenceMatchId !== undefined) {
      assertInvariant(
        event.match_id === sequenceMatchId,
        file,
        `event ${event.event_id} match_id does not match ${sequenceMatchId}`,
      );
    }

    eventIds.add(event.event_id);
    previousEventId = event.event_id;
    previousMinute = event.minute;
  }

  if (eventCounter !== undefined && events.length > 0) {
    assertInvariant(
      events.at(-1).event_id === eventCounter,
      file,
      `last event_id must equal match event_counter ${eventCounter}`,
    );
  }
}

function assertPendingAction(
  pendingAction,
  suppliedFieldState,
  choiceMatrix,
  file,
  expectedSchemaName,
) {
  assertInvariant(
    pendingAction && typeof pendingAction === "object",
    file,
    "waiting fixture must contain a pending action",
  );
  const canonicalBranch = choiceMatrix.get(pendingAction.scene_type);
  assertInvariant(
    canonicalBranch !== undefined,
    file,
    `no canonical choice matrix for ${pendingAction.scene_type}`,
  );
  if (expectedSchemaName !== undefined) {
    assertInvariant(
      canonicalBranch.schemaName === expectedSchemaName,
      file,
      `${pendingAction.scene_type} must use ${expectedSchemaName}`,
    );
  }

  const choiceIds = pendingAction.available_choices?.map((choice) => choice.id);
  assertInvariant(
    Array.isArray(choiceIds) &&
      JSON.stringify(choiceIds) === JSON.stringify(canonicalBranch.choiceIds),
    file,
    `${pendingAction.scene_type} choices must equal x-overgoal-choice-ids ${canonicalBranch.choiceIds.join(", ")}`,
  );
  assertInvariant(
    new Set(choiceIds).size === choiceIds.length,
    file,
    `${pendingAction.scene_type} contains duplicate available choices`,
  );

  const fieldStates = [pendingAction.field_state, suppliedFieldState].filter(
    Boolean,
  );
  assertInvariant(
    fieldStates.length > 0,
    file,
    `${pendingAction.scene_type} must link to a field state`,
  );
  for (const fieldState of fieldStates) {
    assertInvariant(
      pendingAction.minute === fieldState.minute,
      file,
      "pending action and field state minutes differ",
    );
    assertInvariant(
      pendingAction.field_state_id === fieldState.id,
      file,
      "pending field_state_id does not match field state id",
    );
    assertInvariant(
      pendingAction.action_type === fieldState.action_type,
      file,
      "pending action_type does not match field action_type",
    );
  }
}

function assertProgressResponse(value, choiceMatrix, file) {
  const match = value.match;
  assertInvariant(match && typeof match === "object", file, "missing match");
  assertInvariant(
    value.status === match.match_status,
    file,
    "response and match status differ",
  );
  assertInvariant(
    value.minute === match.current_time,
    file,
    "response and match minute differ",
  );
  assertInvariant(
    value.prev_time <= value.minute,
    file,
    "response prev_time exceeds minute",
  );

  const isWaiting = value.status === "WAITING_FOR_DECISION";
  if (isWaiting) {
    assertInvariant(
      value.field_state !== null,
      file,
      "waiting response has no field state",
    );
    assertPendingAction(
      value.pending_action,
      value.field_state,
      choiceMatrix,
      file,
    );
    assertInvariant(
      value.pending_action.minute === value.minute &&
        value.field_state.minute === value.minute,
      file,
      "response, pending action, and field state minutes differ",
    );
    assertInvariant(
      value.field_state.match_id === match.id,
      file,
      "field state match_id does not match response match",
    );
    assertInvariant(
      value.action === value.pending_action.action_type &&
        value.action_team === value.pending_action.action_team,
      file,
      "response action metadata does not match pending action",
    );
    assertInvariant(
      match.pending_action?.id === value.pending_action.id,
      file,
      "match pending action does not match response pending action",
    );
    assertPendingAction(
      match.pending_action,
      value.field_state,
      choiceMatrix,
      file,
    );
  } else {
    assertInvariant(
      value.pending_action === null,
      file,
      "lifecycle stop has a pending action",
    );
    assertInvariant(
      match.pending_action === null,
      file,
      "match lifecycle stop has a pending action",
    );
    assertInvariant(
      value.field_state === null,
      file,
      "lifecycle stop has a field state",
    );
  }

  assertInvariant(
    value.events.length > 0,
    file,
    "progress fixture has no events",
  );
  assertEventSequence(value.events, file, {
    eventCounter: match.event_counter,
    expectedMinute: value.minute,
    matchId: match.id,
  });
  const lastEvent = value.events.at(-1);
  if (value.status === "HALFTIME") {
    assertInvariant(value.minute === 45, file, "halftime must be minute 45");
    assertInvariant(
      lastEvent.halftime === true,
      file,
      "halftime event is not marked halftime",
    );
  } else if (value.status === "FINISHED") {
    assertInvariant(value.minute === 90, file, "fulltime must be minute 90");
    assertInvariant(
      lastEvent.match_end === true,
      file,
      "fulltime event is not marked match_end",
    );
  } else if (value.status === "WAITING_FOR_DECISION") {
    assertInvariant(
      lastEvent.halftime !== true && lastEvent.match_end !== true,
      file,
      "waiting event cannot be a lifecycle stop",
    );
  }
}

export function assertCanonicalFixtureRelations({
  choiceMatrix,
  file,
  schemaName,
  value,
}) {
  const branchSchemaNames = new Set(
    [...choiceMatrix.values()].map((branch) => branch.schemaName),
  );
  if (branchSchemaNames.has(schemaName)) {
    assertPendingAction(
      value,
      value.field_state,
      choiceMatrix,
      file,
      schemaName,
    );
    return;
  }

  if (schemaName === "MatchProgressResponse") {
    assertProgressResponse(value, choiceMatrix, file);
    return;
  }

  if (schemaName === "MatchSnapshotResponse") {
    assertEventSequence(value.timeline, file, {
      eventCounter: value.match.event_counter,
      matchId: value.match.id,
      maximumMinute: value.match.current_time,
    });
    return;
  }

  if (schemaName === "TimelineResponse") {
    assertEventSequence(value.timeline, file);
  }
}
