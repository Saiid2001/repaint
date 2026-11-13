var util = require("util");

var ParentBox = require("./parent-box");
var values = require("../css/values");

var Auto = values.Keyword.Auto;
var Percentage = values.Percentage;
var Length = values.Length;

var auto = function (value) {
  return Auto.is(value);
};

var BlockBox = function (parent, style) {
  ParentBox.call(this, parent, style);
};

util.inherits(BlockBox, ParentBox);

BlockBox.prototype.addLine = function (child, branch) {
  var children = this.children;
  var i = children.indexOf(child);

  this.attach(branch, i + 1);
};

BlockBox.prototype.layout = function (offset) {
  this._layoutWidth();
  this._layoutPosition(offset);
  this._layoutChildren();
  this._layoutHeight();
  this.afterLayout();
};

BlockBox.prototype._layoutWidth = function () {
  var self = this;
  var parent = this.parent;
  var style = this.style;

  var width = style.width;

  var marginLeft = style["margin-left"];
  var marginRight = style["margin-right"];

  var borderLeft = this.styledBorderWidth("left");
  var borderRight = this.styledBorderWidth("right");

  var paddingLeft = style["padding-left"];
  var paddingRight = style["padding-right"];

  var total = [
    {width},
    {marginLeft},
    {marginRight},
    {borderLeft},
    {borderRight},
    {paddingLeft},
    {paddingRight},
  ].reduce(function (acc, v) {
    return acc + self.toPx(Object.values(v)[0], Object.keys(v)[0]);
  }, 0);

  var underflow = parent.dimensions.width - total;

  if (!auto(width) && underflow < 0) {
    if (auto(marginLeft)) marginLeft = Length.px(0);
    if (auto(marginRight)) marginRight = Length.px(0);
  }

  var isWidthAuto = auto(width);
  var isMarginLeftAuto = auto(marginLeft);
  var isMarginRightAuto = auto(marginRight);

  if (!isWidthAuto && !isMarginLeftAuto && !isMarginRightAuto) {
    var margin = this.toPx(marginRight, "marginRight");
    marginRight = Length.px(margin + underflow);
  } else if (!isWidthAuto && !isMarginLeftAuto && isMarginRightAuto) {
    marginRight = Length.px(underflow);
  } else if (!isWidthAuto && isMarginLeftAuto && !isMarginRightAuto) {
    marginLeft = Length.px(underflow);
  } else if (isWidthAuto && !isMarginLeftAuto && !isMarginRightAuto) {
    if (isMarginLeftAuto) marginLeft = Length.px(0);
    if (isMarginRightAuto) marginRight = Length.px(0);

    if (underflow >= 0) {
      width = Length.px(underflow);
    } else {
      var margin = this.toPx(marginRight, "marginRight");

      width = Length.px(0);
      marginRight = Length.px(margin + underflow);
    }
  } else if (!isWidthAuto && isMarginLeftAuto && isMarginRightAuto) {
    marginLeft = Length.px(underflow / 2);
    marginRight = Length.px(underflow / 2);
  }

  this.dimensions.width = this.toPx(width, "width");

  this.margin.left = this.toPx(marginLeft, "marginLeft");
  this.margin.right = this.toPx(marginRight, "marginRight");

  this.border.left = this.toPx(borderLeft, "borderLeft");
  this.border.right = this.toPx(borderRight, "borderRight");

  this.padding.left = this.toPx(paddingLeft, "paddingLeft");
  this.padding.right = this.toPx(paddingRight, "paddingRight");
};

BlockBox.prototype._layoutPosition = function (offset) {
  var parent = this.parent;
  var style = this.style;

  this.margin.top = this.toPx(style["margin-top"], "marginTop");
  this.margin.bottom = this.toPx(style["margin-bottom"], "marginBottom");

  this.border.top = this.toPx(this.styledBorderWidth("top"), "borderTop");
  this.border.bottom = this.toPx(this.styledBorderWidth("bottom"), "borderBottom"); 
  this.padding.top = this.toPx(style["padding-top"], "paddingTop");
  this.padding.bottom = this.toPx(style["padding-bottom"], "paddingBottom");

  this.position.x = parent.position.x + this.leftWidth();
  this.position.y = parent.position.y + offset.height + this.topWidth();
};

// CSS 2.1 §10.6.3: a block's auto height is that of its children in normal
// flow. An absolutely positioned child is not one; it is laid out where it
// would have been, and the children after it go where they would without it.
var OUT_OF_FLOW = { absolute: true, fixed: true };

var isOutOfFlow = function (box) {
  var position = box.style && box.style.position;

  return Boolean(position && OUT_OF_FLOW[position.keyword]);
};

// A flex container laying its items out side by side on one line. Its items
// are not laid out along a row here -- each is a block as wide as the
// container -- but they start at its top, and it is as tall as the tallest:
// stacked, a menu bar of seven items was seven items tall.
BlockBox.prototype._isSingleLineFlexRow = function () {
  var style = this.style;

  if (!(style.display && style.display.keyword === "flex")) {
    return false;
  }

  var direction = style["flex-direction"] && style["flex-direction"].keyword;
  var wrap = style["flex-wrap"] && style["flex-wrap"].keyword;

  return (!direction || direction === "row" || direction === "row-reverse") &&
    (!wrap || wrap === "nowrap");
};

BlockBox.prototype._layoutChildren = function () {
  var offset = { width: 0, height: 0 };
  var row = this._isSingleLineFlexRow();
  var tallest = 0;

  this.forEach(function (child) {
    child.layout(offset);

    if (isOutOfFlow(child)) {
      return;
    }

    if (row) {
      tallest = Math.max(tallest, child.height());
    } else {
      offset.height += child.height();
    }
  });
  this.dimensions.height = row ? tallest : offset.height;
};

BlockBox.prototype._layoutHeight = function () {
  var height = this.style.height;

  // Mirrors _layoutWidth. Reading Length.length took the bare number and so
  // treated every unit as pixels, leaving a 32.5rem box 32.5px tall; toPx
  // applies the unit and resolves a percentage against the containing block.
  if (Length.is(height) || Percentage.is(height)) {
    this.dimensions.height = this.toPx(height, "height");
  }
};

module.exports = BlockBox;
