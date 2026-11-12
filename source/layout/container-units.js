// Container query lengths (CSS Contain 3 §6.1): 1cqw is 1% of the width of the
// nearest ancestor that is a query container for that axis -- `container-type:
// inline-size` for the inline axis, `size` for both -- measured as its content
// box was laid out, and of the small viewport where there is none. Writing
// modes are taken as horizontal: the inline axis is the width.

var viewportUnits = require("./viewport-units");

var AXIS = { cqw: "width", cqi: "width", cqh: "height", cqb: "height" };

exports.UNITS = ["cqw", "cqh", "cqi", "cqb", "cqmin", "cqmax"];

exports.is = function (unit) {
  return exports.UNITS.indexOf(unit) !== -1;
};

function containerType(element) {
  var view = element.ownerDocument && element.ownerDocument.defaultView;

  try {
    return view ? String(view.getComputedStyle(element).getPropertyValue("container-type")).trim() : "";
  } catch (error) {
    return "";
  }
}

// The size of `box`'s nearest query container along `axis`, or of the small
// viewport.
function extent(box, axis) {
  for (var ancestor = box.parent; ancestor; ancestor = ancestor.parent) {
    var element = ancestor.domRef;

    if (!element || element.nodeType !== 1) continue;

    var type = containerType(element);

    if (type === "size" || (type === "inline-size" && axis === "width")) {
      return ancestor.dimensions[axis];
    }
  }

  return viewportUnits.toPx(100, axis === "width" ? "svw" : "svh");
}

// The length in pixels, or null for a unit that is not one of these.
exports.toPx = function (box, length, unit) {
  if (!exports.is(unit)) return null;

  if (unit === "cqmin" || unit === "cqmax") {
    var width = extent(box, "width");
    var height = extent(box, "height");
    return (length * (unit === "cqmin" ? Math.min(width, height) : Math.max(width, height))) / 100;
  }

  return (length * extent(box, AXIS[unit])) / 100;
};
