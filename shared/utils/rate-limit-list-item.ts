export const RATE_LIMIT_MESSAGE_ID = "RATE_LIMIT_MESSAGE_ID" as const;

const RATE_LIMIT_ITEM_KIND = "rate-limit-message" as const;

export interface RateLimitListItem {
  kind: typeof RATE_LIMIT_ITEM_KIND;
  id: typeof RATE_LIMIT_MESSAGE_ID;
  message: string;
}

export type WithRateLimitItem<T> = T | RateLimitListItem;

export const createRateLimitListItem = (
  message: string
): RateLimitListItem => ({
  kind: RATE_LIMIT_ITEM_KIND,
  id: RATE_LIMIT_MESSAGE_ID,
  message,
});

export function prependRateLimitItem<T>(
  items: T[],
  isRateLimited: boolean,
  message: string
): WithRateLimitItem<T>[];

export function prependRateLimitItem<T>(
  items: T[] | null,
  isRateLimited: boolean,
  message: string
): WithRateLimitItem<T>[] | null;

export function prependRateLimitItem<T>(
  items: T[] | null,
  isRateLimited: boolean,
  message: string
): WithRateLimitItem<T>[] | null {
  if (!isRateLimited) {
    return items;
  }

  return [createRateLimitListItem(message), ...(items ?? [])];
}

export const isRateLimitItem = <T extends object>(
  item: WithRateLimitItem<T>
): item is RateLimitListItem =>
  "kind" in item &&
  "id" in item &&
  item.kind === RATE_LIMIT_ITEM_KIND &&
  item.id === RATE_LIMIT_MESSAGE_ID;
