// The viewport that viewport-percentage lengths -- vw, vh, vmin, vmax and the
// rest -- resolve against.
//
// Like the root font size, it is not reachable from a box: the entry point
// publishes the layout viewport here before anything is laid out, and both
// toPx implementations read it. The layout viewport is fixed and has no
// toolbar that slides away, so the small, large and dynamic viewports (sv*,
// lv*, dv*) are all this one, and the inline and block axes (vi, vb) are the
// horizontal and vertical ones of a horizontal writing mode.

var current = { width: 0, height: 0 };

exports.set = function (dimensions) {
  var width = dimensions && dimensions.width;
  var height = dimensions && dimensions.height;

  current = {
    width: typeof width === "number" && isFinite(width) ? width : 0,
    height: typeof height === "number" && isFinite(height) ? height : 0
  };
};

var BASES = ["vw", "vh", "vmin", "vmax", "vi", "vb"];

exports.UNITS = BASES.reduce(function (units, base) {
  return units.concat([base, "s" + base, "l" + base, "d" + base]);
}, []);

exports.is = function (unit) {
  return exports.UNITS.indexOf(unit) !== -1;
};

// The length in pixels, or null for a unit that is not one of these.
exports.toPx = function (length, unit) {
  if (!exports.is(unit)) return null;

  var base = unit.length > 2 && unit !== "vmin" && unit !== "vmax" ? unit.slice(1) : unit;
  var hundredth;

  switch (base) {
    case "vw":
    case "vi":
      hundredth = current.width / 100;
      break;
    case "vh":
    case "vb":
      hundredth = current.height / 100;
      break;
    case "vmin":
      hundredth = Math.min(current.width, current.height) / 100;
      break;
    case "vmax":
      hundredth = Math.max(current.width, current.height) / 100;
      break;
    default:
      return null;
  }

  return length * hundredth;
};
