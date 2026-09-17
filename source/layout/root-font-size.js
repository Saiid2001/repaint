// The root element's computed font size, which rem units resolve against.
//
// <html> sits above the <body> that layout starts from, so it never gets a box
// and cannot be discovered from the box tree. The entry point resolves it and
// publishes it here, where both toPx implementations can read it. Without this
// they fall back to the viewport box's own font size, which is unrelated to the
// document: a page using the common html { font-size: 62.5% } idiom then has
// every rem length come out 1.6x too large.

var DEFAULT_ROOT_FONT_SIZE = 16;

var current = DEFAULT_ROOT_FONT_SIZE;

exports.set = function (px) {
  current = typeof px === "number" && isFinite(px) && px > 0 ? px : DEFAULT_ROOT_FONT_SIZE;
};

exports.get = function () {
  return current;
};

exports.DEFAULT = DEFAULT_ROOT_FONT_SIZE;
