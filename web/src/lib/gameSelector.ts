import type { GameInfo, PlayerSummary, RoomState } from '../../../shared/protocol';

export function getAvailableGames(state: RoomState): GameInfo[] {
  return state.games.filter(
    (g) => state.players.length >= g.minPlayers && state.players.length <= g.maxPlayers
  );
}

export function getConnectedCount(state: RoomState): number {
  return state.players.filter((p) => p.connected).length;
}

export function getVoteCount(state: RoomState): number {
  const votes = state.gameVotes ?? {};
  return state.players.filter((p) => p.connected && Boolean(votes[p.id])).length;
}

export function getVotersFor(state: RoomState, gameId: string): PlayerSummary[] {
  const votes = state.gameVotes ?? {};
  return state.players.filter((p) => p.connected && votes[p.id] === gameId);
}
