export function calculateTopicMastery(oldMastery: number, latestScore: number): number {
  return 0.7 * oldMastery + 0.3 * latestScore;
}
