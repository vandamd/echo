export const getRateLimitMessage = (
  resource: string,
  retryAt: number | null
): string => {
  if (retryAt === null) {
    return `Sorry, you've hit the rate limits for ${resource}. Please try again soon.`;
  }

  const retryDate = new Date(retryAt);
  const now = new Date();
  const isSameDay = retryDate.toDateString() === now.toDateString();
  const formattedRetryTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(isSameDay ? {} : { day: "2-digit", month: "short" }),
  }).format(retryDate);

  return `Sorry, you've hit the rate limits for ${resource}. Please try again at ${formattedRetryTime}.`;
};
