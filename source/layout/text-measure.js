// Text advance width, supplied by the embedder.
//
// Layout cannot measure text on its own: the width of a string depends on the
// font engine actually doing the drawing. Without a measurer every text box is
// zero wide, so inline siblings all sit at the same x and draw on top of each
// other, and line breaking never triggers because nothing ever exceeds the
// available width.
//
// The embedder installs a measurer backed by whatever it renders with, and the
// default keeps the previous behaviour for callers that have none.

var measurer = null;

exports.set = function (fn) {
  measurer = typeof fn === "function" ? fn : null;
};

exports.has = function () {
  return measurer !== null;
};

/**
 * @param text the string to measure
 * @param style the box's computed style, for font family, size, weight, style
 * @returns advance width in px
 */
exports.measure = function (text, style) {
  if (!measurer || !text) {
    return 0;
  }

  var width = measurer(text, style);

  return typeof width === "number" && isFinite(width) && width > 0 ? width : 0;
};
