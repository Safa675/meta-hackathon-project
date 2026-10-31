// Where Tuck's bubble opens, and keeping a dragged Tuck inside the window. A classic
// script (injected before overlay.js) that defines globalThis.tuckLayout; pure, so it
// is tested in node.
globalThis.tuckLayout = {
  // rect: Tuck's box; view: {width, height}. The bubble opens toward the roomier side.
  placement(rect, view) {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    return { side: cx < view.width / 2 ? "right" : "left", vertical: cy > view.height / 2 ? "above" : "below" };
  },
  clamp({ x, y }, size, view, margin = 8) {
    return {
      x: Math.min(Math.max(x, margin), view.width - size.width - margin),
      y: Math.min(Math.max(y, margin), view.height - size.height - margin),
    };
  },
};
