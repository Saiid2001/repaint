var ElementType = require("domelementtype");

var values = require("./css/values");
var declarations = require("./css/declarations");
var expand = require("./css/expand-shorthand");
var Viewport = require("./layout/viewport");
var BlockBox = require("./layout/block-box");
var LineBox = require("./layout/line-box");
var LineBreakBox = require("./layout/line-break-box");
var InlineBox = require("./layout/inline-box");
var InlineBlockBox = require("./layout/inline-block-box");
var TextBox = require("./layout/text-box");
var ImageBox = require("./layout/image-box");
const { implSymbol } = require("jsdom");

var None = values.Keyword.None;
var Auto = values.Keyword.Auto;
var Block = values.Keyword.Block;
var Inline = values.Keyword.Inline;
var LineBreak = values.Keyword.LineBreak;
var InlineBlock = values.Keyword.InlineBlock;

var isInlineLevelBox = function (box) {
  return (
    box instanceof InlineBox ||
    box instanceof InlineBlockBox ||
    box instanceof TextBox ||
    box instanceof LineBreakBox ||
    box instanceof ImageBox.Inline
  );
};

var isInlineContainerBox = function (box) {
  return (
    box instanceof InlineBox ||
    box instanceof InlineBlockBox ||
    box instanceof LineBox
  );
};

var isBlockLevelBox = function (box) {
  return (
    box instanceof Viewport ||
    box instanceof LineBox ||
    box instanceof BlockBox ||
    box instanceof ImageBox.Block
  );
};

var isBlockContainerBox = function (box) {
  return box instanceof Viewport || box instanceof BlockBox;
};

var branch = function (ancestor, descedant) {
  var first, current;
  while (descedant !== ancestor) {
    var d = descedant.clone();
    descedant.addLink(d);

    if (current) d.attach(current);
    if (!first) first = d;

    current = d;

    if (!descedant.parent) throw new Error("No ancestor match");
    descedant = descedant.parent;
  }

  if (current) ancestor.attach(current);
  return first;
};

var DEFAULT_FONT_SIZE = 16;

// The root element's computed font size, which rem resolves against. Seeded per
// layout pass from <html>, which is above the <body> layout starts at.
var rootFontSize = DEFAULT_FONT_SIZE;

// CSS absolute-size keywords, in px for a medium of 16.
var ABSOLUTE_FONT_SIZES = {
  "xx-small": 9,
  "x-small": 10,
  small: 13,
  medium: 16,
  large: 18,
  "x-large": 24,
  "xx-large": 32,
};

// Relative-size keywords scale the parent's size by roughly 1.2.
var RELATIVE_FONT_SIZE_RATIO = 1.2;

var keywordToPx = function (specified, parentPx) {
  if (!specified) return null;

  var keyword = String(specified).trim().toLowerCase();

  if (ABSOLUTE_FONT_SIZES[keyword] !== undefined) {
    return ABSOLUTE_FONT_SIZES[keyword];
  }
  if (keyword === "larger") return parentPx * RELATIVE_FONT_SIZE_RATIO;
  if (keyword === "smaller") return parentPx / RELATIVE_FONT_SIZE_RATIO;

  return null;
};

var lengthToPx = function (value, relativeTo) {
  if (values.Percentage.is(value)) {
    return (relativeTo * value.percentage) / 100;
  }

  if (values.Length.is(value)) {
    if (value.unit === "px") return value.length;
    if (value.unit === "em") return value.length * relativeTo;
    if (value.unit === "rem") return value.length * rootFontSize;
  }

  return null;
};

/**
 * CSS resolves font-size at computed-value time, so the computed value is
 * always an absolute length and layout never sees em/rem/%. Browsers do this
 * while computing style; jsdom's getComputedStyle returns the specified value
 * instead (and nothing at all when the property is inherited), so it has to
 * happen here — top-down, where the parent's resolved size is known.
 */
var resolveFontSize = function (styles, parentStyles, specified) {
  var parentValue = parentStyles && parentStyles["font-size"];
  var parentPx =
    parentValue && values.Length.is(parentValue) && parentValue.unit === "px"
      ? parentValue.length
      : DEFAULT_FONT_SIZE;

  var value = styles["font-size"];
  // An unspecified font-size inherits the parent's computed value. Keywords are
  // checked first: they never survive the length parser.
  var px = keywordToPx(specified, parentPx);

  if (px === null) {
    px = value ? lengthToPx(value, parentPx) : parentPx;
  }

  if (px === null || !isFinite(px)) {
    px = parentPx;
  }

  var resolved = values.Length.px(px);
  resolved.specificity = value ? value.specificity : 0;
  styles["font-size"] = resolved;
};

/**
 * rem resolves against the root element, which is never laid out because layout
 * starts at <body>. Its own font-size resolves against the 16px initial value.
 */
var computeRootFontSize = function (body) {
  var documentElement = body.ownerDocument.documentElement;
  var window =
    body.ownerDocument.defaultView || body.ownerDocument.parentWindow;

  if (!documentElement || !window) {
    return DEFAULT_FONT_SIZE;
  }

  var specified = window.getComputedStyle(documentElement).fontSize;
  if (!specified) {
    return DEFAULT_FONT_SIZE;
  }

  var parsed = declarations["font-size"]?.parseValue(specified);
  var px = parsed ? lengthToPx(parsed, DEFAULT_FONT_SIZE) : null;

  return px === null || !isFinite(px) ? DEFAULT_FONT_SIZE : px;
};

var parseStylesFromCSSStyleDeclaration = function (style, parentStyle) {
  var styles = {};

  // join the set of keys from declarations and style
  var allproperties = {};

  for (var key in declarations) {
    allproperties[key] = true;
  }

  for (var key in style._values) {
    allproperties[key] = true;
  }

  for (var property in allproperties) {

    if (style[property]) {
      var expanded = expand(property, style[property]);
      var wasShorthand = Object.keys(expanded).length > 1;
      var specificity = wasShorthand ? 1 : 2;
      for (var key in expanded) {
        if (!styles[key] || styles[key].specificity < specificity) {
          if (!declarations[key]) {
            console.warn("CSS Mapping: Unknown property: " + key);
            continue;
          }
          var value = declarations[key].parseValue(expanded[key], parentStyle);
          if (!value) {
            console.warn(
              "CSS Mapping: Unknown value for property: " +
                key +
                " = " +
                expanded[key]
            );
            styles[key] = declarations[property]?.INITIAL || Auto;
            styles[key].specificity = 0;
            continue;
          }

          value.specificity = specificity;
          styles[key] = value;
        }
      }
    } else if (declarations[property]) {
      styles[property] = declarations[property].INITIAL;
      styles[property].specificity = 0;
    }
  }

  resolveFontSize(styles, parentStyle, style.fontSize);

  return styles;
};

var layoutPass = 0;

var bindDOMAndLayoutNode = function (domNode, layoutNode) {
  layoutNode.domRef = domNode;

  // A single pass can bind several boxes to one node (inline fragments), but
  // boxes from earlier passes are stale: readers index layoutBoxes[0] and
  // expect the current pass. Rerendering keeps the same DOM nodes, so the
  // bindings have to be dropped when a new pass reaches the node.
  if (!domNode.layoutBoxes || domNode.layoutPass !== layoutPass) {
    domNode.layoutBoxes = [];
    domNode.layoutPass = layoutPass;
  }

  domNode.layoutBoxes.push(layoutNode);
};

const IGNORE_CHILDREN = {
  SELECT: true,
  OPTION: true,
  SCRIPT: true,
  STYLE: true,
}

var build = function (parent, nodes) {
  for (var node of nodes) {
    let box;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const window =
        node.ownerDocument.defaultView || node.ownerDocument.parentWindow;
      var style = window.getComputedStyle(node);
      style = parseStylesFromCSSStyleDeclaration(style, parent?.style);
      var display = style.display;

      if (None.is(display)) {
        continue;
      } else if (node.tagName === "IMG") {
        var image = node;
        if (Block.is(display)) box = new ImageBox.Block(parent, style, image);
        else box = new ImageBox.Inline(parent, style, image);
      } else if (node.tagName === "BR") {
        box = new LineBreakBox(parent, style);
      } else if (Inline.is(display)) {
        box = new InlineBox(parent, style);
      } else if (Block.is(display)) {
        box = new BlockBox(parent, style);
      } else if (LineBreak.is(display)) {
        box = new LineBreakBox(parent, style);
      } else if (InlineBlock.is(display)) {
        box = new InlineBlockBox(parent, style);
      } else {
        // TODO: implement the rest of display options
        box = new BlockBox(parent, style);
      }
      bindDOMAndLayoutNode(node, box);

      if (!IGNORE_CHILDREN[node.tagName]) {
        if (node.childNodes.length) {
          build(box, node.childNodes);
        }
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      box = new TextBox(parent, node.data);
      bindDOMAndLayoutNode(node, box);
    }

    if (box) parent.children.push(box);
  }
};

var blocks = function (parent, boxes, ancestor) {
  ancestor = ancestor || parent;

  var isInline = isInlineContainerBox(parent);
  var resume;

  boxes.forEach(function (child) {
    var isBlock = isBlockLevelBox(child);
    var box;

    if (isInline && isBlock) {
      box = child.clone(ancestor);
      parent = branch(ancestor, parent);
      resume = parent.parent;
    } else {
      box = child.cloneWithLinks(parent);
    }

    if (child.children) {
      var a = isBlockContainerBox(box) ? box : ancestor;
      parent = blocks(box, child.children, a) || parent;
    }
  });

  // copy the isDirty field from parent to resume
  if (resume != parent && parent?.domRef?.[implSymbol]?.isDirty) {
    if (resume?.domRef) resume.domRef[implSymbol].isDirty = true;
  }

  return resume;
};

var lines = function (parent, boxes) {
  var isBlock = isBlockContainerBox(parent);
  var line;

  boxes.forEach(function (child) {
    var isInline = isInlineLevelBox(child);
    var box;

    if (isBlock && isInline) {
      if (!line) {
        line = new LineBox(parent);
        parent.children.push(line);
      }

      box = child.cloneWithLinks(line);
    } else {
      line = null;
      box = child.cloneWithLinks(parent);
    }

    if (child.children) lines(box, child.children);
  });
};

module.exports = function (body, viewport) {
  layoutPass++;
  rootFontSize = computeRootFontSize(body);

  viewport = new Viewport(viewport.position, viewport.dimensions);

  build(viewport, [body]);

  viewport = [blocks, lines].reduce(function (acc, fn) {
    var a = acc.clone();
    fn(a, acc.children);
    return a;
  }, viewport);

  viewport.layout();

  return viewport;
};
