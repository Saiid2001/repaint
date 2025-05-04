var util = require("util");

var Box = require("./box");
var compute = require("../css/compute");
var values = require("../css/values");

var Auto = values.Keyword.Auto;
var Percentage = values.Percentage;
var Length = values.Length;

var camelToKebab = function (str) {
  if (!str) return str;

  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
};

var ParentBox = function (parent, style) {
  Box.call(this, style);

  this.style = style || compute({}, parent.style);
  this.parent = parent;
  this.children = [];

  // add a root reference
  if (parent) {
    if (parent.root) {
      this.root = parent.root;
    } else {
      this.root = this.parent;
    }
  } else {
    this.root = this;
  }

  this.leftLink = false;
  this.rightLink = false;
};

util.inherits(ParentBox, Box);

ParentBox.prototype.layout = function () {
  this.afterLayout();
};

ParentBox.prototype.addLink = function (box) {
  box.leftLink = true;
  box.rightLink = this.rightLink;

  this.rightLink = true;
};

ParentBox.prototype.addLine = function (child, branch, force) {
  this.stopEach();

  var parent = this.parent;
  var i = this.children.indexOf(child);
  if (i === 0 && !branch && !force) return parent.addLine(this);

  var children = this.children.slice();
  var box = this.clone();

  if (branch) box.attach(branch);
  else box.attach(child);

  for (var j = i + 1; j < children.length; j++) {
    box.attach(children[j]);
  }

  this.addLink(box);
  parent.addLine(this, box);
};

ParentBox.prototype.breakLine = function (child) {
  var children = this.children.slice();
  var box = this.clone();
  var i = children.indexOf(child);

  for (var j = i + 1; j < children.length; j++) {
    box.attach(children[j]);
  }

  this.addLink(box);
  this.parent.addLine(this, box);
};

ParentBox.prototype.hasContent = function () {
  var hasOutline =
    this.padding.some() || this.border.some() || this.margin.some();

  return (
    hasOutline ||
    this.children.some(function (child) {
      return child.hasContent();
    })
  );
};

ParentBox.prototype.collapseWhitespace = function (strip) {
  this.children.forEach(function (child) {
    strip = child.collapseWhitespace(strip);
  });

  return strip;
};

ParentBox.prototype.attach = function (node, i) {
  if (node.parent) node.parent.detach(node);

  node.parent = this;

  if (i !== undefined) this.children.splice(i, 0, node);
  else this.children.push(node);
};

ParentBox.prototype.detach = function (node) {
  var children = this.children;
  var i = children.indexOf(node);

  if (i < 0) return;

  node.parent = null;
  children.splice(i, 1);
};

ParentBox.prototype.clone = function (parent) {
  var clone = new this.constructor(parent, this.style);
  if (parent) parent.children.push(clone);

  return clone;
};

const replaceDomLayoutBindings = function (oldBox, newBox) {
  // Makes sure the new box has the same dom reference as the old box

  newBox.domRef = oldBox.domRef;
  oldBox.domRef.layoutBoxes.pop();
  oldBox.domRef.layoutBoxes.push(newBox);
};

ParentBox.prototype.cloneWithLinks = function (parent) {
  var clone = this.clone(parent);
  clone.leftLink = this.leftLink;
  clone.rightLink = this.rightLink;

  if (this.domRef) replaceDomLayoutBindings(this, clone);

  return clone;
};

ParentBox.prototype.forEach = function (fn) {
  var children = this.children;
  var stop = false;

  this._stop = function () {
    stop = true;
  };

  for (var i = 0; i < children.length && !stop; i++) {
    fn(children[i], i);
  }
};

ParentBox.prototype.stopEach = function () {
  if (this._stop) this._stop();
};

ParentBox.prototype.translate = function (dx, dy) {
  Box.prototype.translate.call(this, dx, dy);
  this.translateChildren(dx, dy);
};

ParentBox.prototype.translateChildren = function (dx, dy) {
  this.children.forEach(function (child) {
    child.translate(dx, dy);
  });
};

ParentBox.prototype.visibleWidth = function () {
  if (
    !this.cached_computes["visibleWidth"] ||
    this.renderIteration != this.cached_computes["visibleWidth"].i
  ) {
    var min = function (box) {
      return box.position.x - box.leftWidth();
    };

    var max = function (box) {
      return box.position.x + box.dimensions.width + box.rightWidth();
    };

    var minX = min(this);
    var maxX = max(this);

    var width = function (parent) {
      minX = Math.min(minX, min(parent));
      maxX = Math.max(maxX, max(parent));

      if (parent.children) parent.children.forEach(width);
    };

    this.children.forEach(width);
    this.cached_computes["visibleWidth"] = {
      i: this.renderIteration,
      px: maxX - minX,
    };
  }

  return this.cached_computes["visibleWidth"].px;
};

ParentBox.prototype.visibleHeight = function () {
  if (
    !this.cached_computes["visibleHeight"] ||
    this.renderIteration != this.cached_computes["visibleWidth"].i
  ) {
    var min = function (box) {
      return box.position.y - box.topWidth();
    };

    var max = function (box) {
      return box.position.y + box.dimensions.height + box.bottomWidth();
    };

    var minY = min(this);
    var maxY = max(this);

    var height = function (parent) {
      minY = Math.min(minY, min(parent));
      maxY = Math.max(maxY, max(parent));

      if (parent.children) parent.children.forEach(height);
    };

    this.children.forEach(height);
    this.cached_computes["visibleHeight"] = {
      i: this.renderIteration,
      px: maxY - minY,
    };
  }
  return this.cached_computes["visibleHeight"].px;
};

const computeAutoWidth = function (box) {
  var display = box.style["display"]?.keyword;

  switch (display) {
    case "block":
      return box.parent.dimensions.width;
    case "inline":
      return box.visibleWidth();
    case "inline-block":
      return box.visibleWidth();
    // TODO
    // case "flex":
    // case "inline-flex":
    // case "grid":
    // case "inline-grid":
    // case "table":
    // case "inline-table":
    default:
      return box.parent.visibleWidth();
  }
};

const computeAutoHeight = function (box) {
  var display = box.style["display"]?.keyword;

  switch (display) {
    case "block":
      return box.parent.dimensions.height;
    case "inline":
      return box.visibleHeight();
    case "inline-block":
      return box.visibleHeight();
    // TODO
    // case "flex":
    // case "inline-flex":
    // case "grid":
    // case "inline-grid":
    // case "table":
    // case "inline-table":
    default:
      return box.parent.visibleHeight();
  }
};

ParentBox.prototype.toPx = function (value, label) {
  if (
    !this.cached_computes[label] ||
    this.renderIteration != this.cached_computes[label].i
  ) {
    var px;
    if (Auto.is(value)) {
      switch (label) {
        case "width":
          px = computeAutoWidth(this);
          break;
        case "height":
          px = computeAutoHeight(this);
          break;
        default:
          px = 0;
      }
    } else if (Percentage.is(value)) {
      var width = this.parent.dimensions.width;
      px = (width * value.percentage) / 100;
    } else if (Length.is(value)) {
      if (value.unit === "px") {
        return value.length;
      } else if (value.unit === "em") {
        if (label === "fontSize") {
          var parentDomNode;
          if (this.domRef) {
            parentDomNode = this.domRef.parentNode;
          } else {
            parentDomNode = this.parent.domRef.parentNode;
          }

          var parentLayoutBox = parentDomNode.layoutBoxes[0];
          const parentPx = ParentBox.prototype.toPx.call(
            parentLayoutBox,
            parentLayoutBox.style[camelToKebab(label)],
            label
          );

          px = value.length * parentPx;
        } else {
          const fontSize = this.toPx(this.style["font-size"], "fontSize");
          px = value.length * fontSize;
        }
      } else if (value.unit === "rem") {
        const rootValue = ParentBox.prototype.toPx.call(
          this.root,
          this.root.style["font-size"],
          "fontSize"
        );

        px = value.length * rootValue;
      } else {
        throw new Error("Unsupported unit: " + value);
      }
    }
    this.cached_computes[label] = {
      i: this.renderIteration,
      px,
    };
  }

  return this.cached_computes[label].px;
};

module.exports = ParentBox;
module.exports.replaceDomLayoutBindings = replaceDomLayoutBindings;
