let current;

export function setState(value) {
  current = value;
}

export function getState() {
  if (!current) throw new Error("App state is not ready.");
  return current;
}
