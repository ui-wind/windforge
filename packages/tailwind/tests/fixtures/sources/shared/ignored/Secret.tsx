import React from 'react';

// Lives under shared/ignored/, which fixtures/sources/.gitignore excludes —
// its classes must never reach the artifact.
export function Secret() {
  return <div className="bg-lime-500">gitignored source</div>;
}
