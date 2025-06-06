var util = require("util");
// var textWidth = require("text-width");
var he = require("he");

var values = require("../css/values");
var collapse = require("./whitespace/collapse");
var breaks = require("./whitespace/breaks");
var Box = require("./box");
var ParentBox = require("./parent-box");
var Viewport = require("./viewport");
const ImageBox = require("./image-box");

var camelToKebab = function (str) {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
};

var closestDomRef = function (box) {
  // cache it
  if (!box.parent.cached_computes["closestDomRef"]) {
    if (box.domRef)
      box.cached_computes["closestDomRef"] = box.domRef.parentNode;
    else if (!box.parent) box.cached_computes["closestDomRef"] = null;
    else if (box.parent.domRef)
      box.cached_computes["closestDomRef"] = box.parent.domRef;
    else box.cached_computes["closestDomRef"] = closestDomRef(box.parent);
  }

  return box.cached_computes["closestDomRef"];
};

var Auto = values.Keyword.Auto;
var Percentage = values.Percentage;
var Length = values.Length;

var Normal = values.Keyword.Normal;
var Nowrap = values.Keyword.Nowrap;
var PreLine = values.Keyword.PreLine;
var PreWrap = values.Keyword.PreWrap;

var NEWLINE = "\n";
var TAB = "        ";

var isBreakable = function (box) {
  if (box instanceof ImageBox) return false;

  var format = box.format.keyword;
  return Normal.is(format) || PreWrap.is(format) || PreLine.is(format);
};

var TextString = function (str, style) {
  this.original = str;
  this.style = style;

  this.normalized = he.decode(str).replace(/\t/g, TAB);
};

TextString.prototype.trimLeft = function () {
  this.normalized = this.normalized.replace(/^ /, "");
};

TextString.prototype.trimRight = function () {
  this.normalized = this.normalized.replace(/ $/, "");
};

TextString.prototype.append = function (str) {
  return new TextString(this.original + str, this.style);
};

TextString.prototype.width = function () {
  var style = this.style;

  // DEV: we do not want to use the textWidth
  return 0;
  // return textWidth(this.normalized, {
  //   size: style["font-size"].toString(),
  //   family: style["font-family"].toString(),
  //   weight: style["font-weight"].keyword,
  //   style: style["font-style"].keyword,
  // });
};

var TextBox = function (styleOrParent, text) {
  var isParent =
    styleOrParent instanceof ParentBox || styleOrParent instanceof Viewport;
  var parent = isParent ? styleOrParent : null;
  var style = isParent ? styleOrParent.style : styleOrParent;
  text = text || "";

  Box.call(this, style);
  this.parent = parent;
  this.text = text;
  this.display = text;
  this.format = style["white-space"];
  this.leftLink = false;
  this.rightLink = false;
  this.preservedNewline = false;
};

util.inherits(TextBox, Box);

TextBox.prototype.layout = function (offset, line) {
  var parent = this.parent;
  var style = this.style;
  var format = this.format.keyword;
  var textContext = this._textContext(line);
  var lines = breaks.hard(this.text, format);

  var textString = function (t) {
    return new TextString(t || "", style);
  };

  var text = textString(lines[0]);
  var isCollapsible = this._isCollapsible();
  var isBreakable = this._isBreakable() || textContext.precededByBreakable;
  var isMultiline = lines.length > 1;
  var isTrimable = isCollapsible && textContext.precededByEmpty;

  if (isTrimable) text.trimLeft();
  if (isCollapsible && (textContext.followedByEmpty || isMultiline))
    text.trimRight();

  var x = parent.position.x + offset.width;
  var available = line.position.x + line.dimensions.width - x;
  var rest;

  if (isBreakable && available < 0 && !textContext.first) {
    rest = this.text;
    text = textString();
  } else if (isBreakable && text.width() > available) {
    var i = 0;
    var words = breaks.soft(text.original, format);
    var fillCurrent,
      fillNext = textString(words[i]);

    if (isTrimable) fillNext.trimLeft();

    while (fillNext.width() <= available && i++ < words.length) {
      fillCurrent = fillNext;
      fillNext = fillNext.append(words[i]);
      if (isTrimable) fillNext.trimLeft();
    }

    fillCurrent = fillCurrent || textString();

    if (!fillCurrent.width() && textContext.first) {
      i = 0;

      do {
        fillCurrent = fillCurrent.append(words[i]);
        if (isTrimable) fillCurrent.trimLeft();
      } while (!fillCurrent.width() && i++ < words.length);
    }

    if (isCollapsible) fillCurrent.trimRight();

    var newline = fillCurrent.original === text.original ? 1 : 0;

    rest = this.text.slice(fillCurrent.original.length + newline);
    text = fillCurrent;
  } else {
    rest = this.text.slice(text.original.length + 1);
  }

  if (this.text.charAt(text.length) === NEWLINE) this.preservedNewline = true;

  if (rest || isMultiline) {
    var textBox = rest === this.text ? null : new TextBox(style, rest);
    parent.addLine(this, textBox);
    if (!textBox) return;
  }

  this.dimensions.height = this.toPx(style["font-size"], "fontSize");
  this.dimensions.width = text.width();

  this.position.x = x;
  this.position.y = parent.position.y;

  this.display = text.normalized;

  this.afterLayout();
};

TextBox.prototype.endsWithCollapsibleWhitespace = function () {
  var text = collapse(this.text, { format: this.format.keyword });
  return / $/.test(text) && this._isCollapsible();
};

TextBox.prototype.collapseWhitespace = function (strip) {
  var wh = this.endsWithCollapsibleWhitespace();
  var text = collapse(this.text, {
    format: this.format.keyword,
    strip: strip,
  });

  this.text = text;
  return wh;
};

TextBox.prototype.hasContent = function () {
  return this._isCollapsible()
    ? !this._isWhitespace()
    : this.preservedNewline || !!this.dimensions.width;
};

TextBox.prototype.linePosition = function () {
  return this.position;
};

TextBox.prototype.lineHeight = function () {
  return this.dimensions.height;
};

TextBox.prototype.clone = function (parent) {
  var clone = new TextBox(parent, this.text);
  parent.children.push(clone);

  return clone;
};

TextBox.prototype.cloneWithLinks = ParentBox.prototype.cloneWithLinks;
TextBox.prototype.addLink = ParentBox.prototype.addLink;

// TODO: merge with ParentBox.toPx
TextBox.prototype.toPx = function (value, label) {
  // modified to handle relative units like em

  if (
    !this.cached_computes[label] ||
    this.renderIteration != this.cached_computes[label].i
  ) {
    var px;
    if (Auto.is(value)) px = 0;
    else if (Percentage.is(value)) {
      var parentDomNode = closestDomRef(this.parent).parentNode;
      var parentLayoutBox = parentDomNode.layoutBoxes[0];
      const parentPx = TextBox.prototype.toPx.call(
        parentLayoutBox,
        parentLayoutBox.style[camelToKebab(label)],
        label
      );

      px = (parentPx * value.percentage) / 100;
    } else if (Length.is(value) && value.unit === "px") {
      return value.length;
    } else if (Length.is(value) && value.unit === "em") {
      // we fix the font size of the grandparent

      var parentDomNode = this.domRef.parentNode.parentNode;

      let parentPx = 16;
      if (parentDomNode.layoutBoxes?.length) {
        var parentLayoutBox = parentDomNode.layoutBoxes[0];
        parentPx = TextBox.prototype.toPx.call(
          parentLayoutBox,
          parentLayoutBox.style["font-size"],
          "fontSize"
        );
      }

      px = value.length * parentPx;
    } else if (value.unit === "rem") {
      const rootValue = ParentBox.prototype.toPx.call(
        this.parent.root,
        this.parent.root.style["font-size"],
        "fontSize"
      );

      px = value.length * rootValue;
    } else if (value.unit !== "px") {
      throw new Error("Unsupported unit: " + value.unit);
    }

    this.cached_computes[label] = {
      i: this.renderIteration,
      px,
    };
  }
  return this.cached_computes[label].px;
};

TextBox.prototype._isCollapsible = function () {
  var format = this.format;
  return Normal.is(format) || Nowrap.is(format) || PreLine.is(format);
};

TextBox.prototype._isBreakable = function () {
  return isBreakable(this);
};

TextBox.prototype._isWhitespace = function () {
  return /^[\t\n\r ]*$/.test(this.text);
};

TextBox.prototype._textContext = function (line) {
  var contents = line.contents();
  var i = contents.indexOf(this);
  var precededByBreakable = false;
  var precededByEmpty = true;
  var followedByEmpty = true;
  for (var j = 0; j < contents.length; j++) {
    var empty = !contents[j].hasContent();
    if (j < i)
      precededByBreakable = precededByBreakable || isBreakable(contents[j]);
    if (j < i) precededByEmpty = precededByEmpty && empty;
    if (j > i) followedByEmpty = followedByEmpty && empty;
  }

  return {
    first: i === 0,
    last: i === contents.length - 1,
    precededByBreakable: precededByBreakable,
    precededByEmpty: precededByEmpty,
    followedByEmpty: followedByEmpty,
  };
};

module.exports = TextBox;
