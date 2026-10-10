// The map camera's CSS transform (kml; seyh.10). Pure so it's unit-testable.
// The translate is rounded to whole pixels: a fractional offset left the 1px grid
// gaps straddling pixel columns/rows, which drew as faint hairlines across the tiles.
export function camTransform(cam: { x: number; y: number }, zoom: number): string {
  // `+ 0` folds -0 to 0 so a centred camera prints "0px", not "-0px"
  return `translate(${-Math.round(cam.x) + 0}px, ${-Math.round(cam.y) + 0}px) scale(${zoom})`;
}
