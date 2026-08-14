/**
 * Vite example app — demonstrates the CSS-first web pipeline.
 *
 * Uses plain DOM elements with className strings directly (not RNW
 * components) to prove the @windforge/vite plugin compiles and serves
 * CSS correctly. The web-css backend returns `{ className }` which
 * maps 1:1 to DOM className attributes.
 */

export function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <h1 className="text-2xl font-bold mb-6">Windforge Web CSS Backend</h1>

      {/* Base utilities */}
      <div className="p-4 bg-accent rounded-lg mb-4">
        <span className="font-medium">bg-accent token (#3b82f6)</span>
      </div>

      {/* Hover variant — pure CSS pseudo-selector */}
      <div className="p-4 bg-zinc-800 hover:bg-red-500 rounded-lg mb-4 transition-colors">
        <span>Hover me (hover:bg-red-500)</span>
      </div>

      {/* Dark mode variant — pure CSS media query */}
      <div className="p-4 bg-white dark:bg-zinc-900 text-black dark:text-white rounded-lg mb-4">
        <span>Dark mode aware (dark:bg-zinc-900)</span>
      </div>

      {/* Responsive variant */}
      <div className="p-4 bg-zinc-800 sm:bg-green-700 rounded-lg">
        <span>Responsive (sm:bg-green-700 at ≥640px)</span>
      </div>
    </div>
  );
}
