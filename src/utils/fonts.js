/**
 * fonts.js
 * Curated Font Library definitions and font family resolvers
 * supporting Standard, Handwritten, and Monospaced styles for zine making.
 */

export const FONT_LIBRARY = [
  // Standard Styles
  { id: 'sans', name: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", sans-serif', category: 'standard', description: 'Clean Modern Sans' },
  { id: 'serif', name: 'Fraunces Serif', family: '"Fraunces", Georgia, serif', category: 'standard', description: 'Editorial Serif' },
  { id: 'bricolage', name: 'Bricolage Grotesque', family: '"Bricolage Grotesque", sans-serif', category: 'standard', description: 'Expressive Display' },
  { id: 'oswald', name: 'Oswald Headline', family: '"Oswald", sans-serif', category: 'standard', description: 'Condensed Headline' },
  { id: 'playfair', name: 'Playfair Display', family: '"Playfair Display", Georgia, serif', category: 'standard', description: 'Classic Luxury Serif' },

  // Handwritten Styles
  { id: 'handwriting', name: 'Caveat Cursive', family: '"Caveat", cursive, sans-serif', category: 'handwritten', description: 'Flowing Script' },
  { id: 'marker', name: 'Permanent Marker', family: '"Permanent Marker", cursive, sans-serif', category: 'handwritten', description: 'Indie Zine Marker' },
  { id: 'patrick', name: 'Patrick Hand', family: '"Patrick Hand", cursive, sans-serif', category: 'handwritten', description: 'Notebook Print' },
  { id: 'typewriter', name: 'Special Elite', family: '"Special Elite", "Courier New", monospace', category: 'handwritten', description: 'Vintage Typewriter' },

  // Monospaced Styles
  { id: 'mono', name: 'Space Mono', family: '"Space Mono", monospace', category: 'monospaced', description: 'Futuristic Mono' },
  { id: 'courier', name: 'Courier Prime', family: '"Courier Prime", monospace', category: 'monospaced', description: 'Classic Courier' },
  { id: 'fira', name: 'Fira Code', family: '"Fira Code", monospace', category: 'monospaced', description: 'Technical Code' }
];

export const FONT_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'standard', label: 'Standard' },
  { id: 'handwritten', label: 'Handwritten' },
  { id: 'monospaced', label: 'Monospaced' }
];

export function getFontCssFamily(fontId) {
  const item = FONT_LIBRARY.find((f) => f.id === fontId);
  if (item) {
    return item.family;
  }
  // Backward compatibility for legacy font keys
  if (fontId === 'serif') {
    return '"Fraunces", Georgia, serif';
  }
  if (fontId === 'mono') {
    return '"Space Mono", monospace';
  }
  if (fontId === 'handwriting') {
    return '"Caveat", cursive, sans-serif';
  }
  return '"Plus Jakarta Sans", sans-serif';
}

export function getFontCategory(fontId) {
  const item = FONT_LIBRARY.find((f) => f.id === fontId);
  return item ? item.category : 'standard';
}
