import DriveLensApp from "./DriveLensApp";
import { parseReplayState, type ReplaySearchParams } from "./lib/replay-state";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<ReplaySearchParams>;
}) {
  const replayState = parseReplayState(await searchParams);
  return (
    <DriveLensApp
      initialIncidentId={replayState.eventId}
      initialDataSource={replayState.source}
      initialEvidenceMode={replayState.evidenceMode}
    />
  );
}
