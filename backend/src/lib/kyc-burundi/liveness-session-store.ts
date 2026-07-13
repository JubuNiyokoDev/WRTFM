import { randomInt, randomUUID } from "node:crypto";
import type { ActiveLivenessChallenge } from "./liveness-detector";

export const LIVENESS_CHALLENGES: ActiveLivenessChallenge[] = [
  "blink",
  "head_turn",
  "mouth",
];

type LivenessSession = {
  userId?: number;
  order: ActiveLivenessChallenge[];
  expiresAt: number;
  nextIndex: number;
  confirmed: Set<ActiveLivenessChallenge>;
  segments: Partial<Record<ActiveLivenessChallenge, Buffer[]>>;
};

const sessions = new Map<string, LivenessSession>();
let lastFirstChallenge: ActiveLivenessChallenge | null = null;

function shuffledLivenessOrder(): ActiveLivenessChallenge[] {
  const order = [...LIVENESS_CHALLENGES];
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (lastFirstChallenge && order[0] === lastFirstChallenge && order.length > 1) {
    const swapIndex = 1 + randomInt(order.length - 1);
    [order[0], order[swapIndex]] = [order[swapIndex], order[0]];
  }
  lastFirstChallenge = order[0];
  return order;
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(id);
  }
}

export function createLivenessSession(userId?: number) {
  pruneExpiredSessions();
  const sessionId = randomUUID();
  const order = shuffledLivenessOrder();
  sessions.set(sessionId, {
    userId,
    order,
    expiresAt: Date.now() + 10 * 60 * 1000,
    nextIndex: 0,
    confirmed: new Set(),
    segments: {},
  });
  return { sessionId, order };
}

export function getLivenessSession(sessionId: string, userId?: number) {
  pruneExpiredSessions();
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (userId !== undefined && session.userId !== userId) return null;
  return session;
}

export function confirmLivenessSegment(
  sessionId: string,
  challenge: ActiveLivenessChallenge,
  frames: Buffer[],
) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.confirmed.add(challenge);
  session.segments[challenge] = frames;
  session.nextIndex += 1;
  return session;
}

export function deleteLivenessSession(sessionId: string) {
  sessions.delete(sessionId);
}

export function parseLivenessOrder(value: unknown): ActiveLivenessChallenge[] | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.length === 3 &&
      parsed.every((item) => LIVENESS_CHALLENGES.includes(item))
    ) {
      return parsed as ActiveLivenessChallenge[];
    }
  } catch {
    return null;
  }
  return null;
}

export function validateLivenessSegments(
  segments: Record<ActiveLivenessChallenge, Buffer[]>,
): string | null {
  for (const challenge of LIVENESS_CHALLENGES) {
    const count = segments[challenge].length;
    if (count < 5 || count > 8) {
      return `Segment ${challenge}: 5 à 8 frames requises (reçu: ${count}).`;
    }
  }
  return null;
}

export function selectLiveReferenceFrame(
  segments: Record<ActiveLivenessChallenge, Buffer[]>,
): Buffer | null {
  const preferred: ActiveLivenessChallenge[] = ["blink", "mouth", "head_turn"];
  for (const challenge of preferred) {
    const frames = segments[challenge];
    if (frames?.length) return frames[Math.floor(frames.length / 2)];
  }
  return null;
}
