var util = require('util');
var textHeight = require('text-height');

var ParentBox = require('./parent-box');
var values = require('../css/values');

var Length = values.Length;
var Percentage = values.Percentage;

var InlineBox = function(parent, style) {
	ParentBox.call(this, parent, style);
	this.baseline = 0;
};

// TODO: Actually implement inline-block-box. Currently, it's just a copy of inline-box.

util.inherits(InlineBox, ParentBox);

InlineBox.prototype.layout = function(offset, line) {
	this._layoutWidth();
	this._layoutBaseline();
	this._layoutPosition(offset);
	this._layoutHeight();
	this._layoutChildren(line);
	this._layoutWidth();

	this.afterLayout();
};

InlineBox.prototype.linePosition = function() {
	var lineHeight = this.lineHeight();
	var size = this.toPx(this.style['font-size'], 'fontSize');
	var leading = (lineHeight - size) / 2;

	return {
		x: this.position.x,
		y: this.position.y - leading
	};
};

InlineBox.prototype.lineHeight = function() {
	var style = this.style;
	var size = this.toPx(style['font-size'], 'fontSize');
	var lineHeight = style['line-height'];

	return values.Number.is(lineHeight) ?
		lineHeight.number * size : this.toPx(lineHeight, 'lineHeight');
};

InlineBox.prototype._layoutWidth = function() {
	var self = this;
	var style = this.style;

	var iif = function(direction, value, label) {
		return self[direction + 'Link'] ? 0 : self.toPx(value, label);
	};

	this.margin.left = iif('left', style['margin-left'], 'marginLeft');
	this.border.left = iif('left', this.styledBorderWidth('left'), 'borderLeft');
	this.padding.left = iif('left', style['padding-left'], 'paddingLeft');

	this.margin.right = iif('right', style['margin-right'], 'marginRight');
	this.border.right = iif('right', this.styledBorderWidth('right'), 'borderRight');
	this.padding.right = iif('right', style['padding-right'], 'paddingRight');
};

InlineBox.prototype._layoutPosition = function(offset) {
	var parent = this.parent;
	var style = this.style;
	var size = this.toPx(style['font-size'], 'fontSize');

	this.border.top = this.toPx(this.styledBorderWidth('top'), 'borderTop');
	this.border.bottom = this.toPx(this.styledBorderWidth('bottom'), 'borderBottom');

	this.padding.top = this.toPx(style['padding-top'], 'paddingTop');
	this.padding.bottom = this.toPx(style['padding-bottom'], 'paddingBottom');

	this.position.x = parent.position.x + offset.width + this.leftWidth();
	this.position.y = this.baseline - size + this._textHeight().descent;
};

// What an inline-block holds is block content (CSS 2.1 9.2.1): line boxes and
// block boxes, stacked. It offers them the width its containing block offers,
// and is as wide as the widest of them: shrink-to-fit without a preferred
// width, which the renderer's own layout settles.
InlineBox.prototype._layoutChildren = function() {
	var offset = { width: 0, height: 0 };
	var widest = 0;

	var container = this.parent;
	while (container && !(container.dimensions && container.dimensions.width > 0 && !container.isInlineLevel)) {
		container = container.parent;
	}
	this.dimensions.width = container ? container.dimensions.width : 0;

	this.forEach(function(child) {
		child.layout(offset);
		offset.height += child.height();
		widest = Math.max(widest, child.width());
	});

	this.dimensions.width = widest;
	this.dimensions.height = offset.height;
};

InlineBox.prototype._layoutHeight = function() {
	// Set by _layoutChildren, from what it holds.
};

// An inline-block is laid out whole within its line: see LineBox._layoutHeight.
InlineBox.prototype.isAtomicInline = true;

InlineBox.prototype._layoutBaseline = function() {
	var parent = this.parent;
	var alignment = this.style['vertical-align'];

	if(Length.is(alignment)) {
		this.baseline = parent.baseline - alignment.length;
	} else if(Percentage.is(alignment)) {
		this.baseline = parent.baseline - (alignment.percentage * this.lineHeight() / 100);
	}  else {
		this.baseline = parent.baseline;
	}
};

InlineBox.prototype._textHeight = function() {
	var style = this.style;
	return textHeight({
		size: style['font-size'].toString(),
		family: style['font-family'].toString(),
		weight: style['font-weight'].keyword,
		style: style['font-style'].keyword
	});
};

module.exports = InlineBox;
