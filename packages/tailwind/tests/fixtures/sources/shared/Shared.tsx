import React from 'react';

// Reachable only through the `@source "../shared"` directive in global.css.
export function Shared() {
  return <div className="bg-rose-500">shared source</div>;
}
