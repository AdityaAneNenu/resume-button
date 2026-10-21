// Fictional example: the last response to arrive wins.
export async function searchDestinations(query: string) {
  const response = await fetch(`/api/destinations?q=${encodeURIComponent(query)}`);
  const destinations = await response.json();
  renderDestinations(destinations);
}

declare function renderDestinations(destinations: unknown[]): void;
