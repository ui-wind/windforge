import React from 'react';

// Excluded by `@source not "../extra/skip"` in global.css.
export function Bad() {
  return <div className="bg-cyan-500">negated source</div>;
}
