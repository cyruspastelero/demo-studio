// The titles templates/ ships with. A handoff.json or demo.json still carrying one was scaffolded
// and never filled in. Shared by the server (home screen) and the editor (which tab opens first).
export const PLACEHOLDER_TITLES = ['Product name', 'Product name, short'];

export function isPlaceholderTitle(title) {
  return typeof title !== 'string' || !title.trim() || PLACEHOLDER_TITLES.includes(title.trim());
}
