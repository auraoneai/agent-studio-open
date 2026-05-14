export function handleTask(payload: { input?: string }) {
  return { score: 0.91, input: payload.input ?? "" };
}

