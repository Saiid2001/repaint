var ElementType = require("domelementtype");

var values = require("./css/values");
var declarations = require("./css/declarations");
var expand = require("./css/expand-shorthand");
var Viewport = require("./layout/viewport");

// The node types by their values rather than through the global Node, which is
// a window's and not a worker's: this file is handed a jsdom tree and runs
// wherever that tree was built. The numbers are fixed by the DOM standard.
var ELEMENT_NODE = 1;
var TEXT_NODE = 3;
var BlockBox = require("./layout/block-box");
var LineBox = require("./layout/line-box");
var LineBreakBox = require("./layout/line-break-box");
var InlineBox = require("./layout/inline-box");
var InlineBlockBox = require("./layout/inline-block-box");
var TextBox = require("./layout/text-box");
var sharedRootFontSize = require("./layout/root-font-size");
var viewportUnits = require("./layout/viewport-units");
var ImageBox = require("./layout/image-box");
const { implSymbol, computedStyle } = require("jsdom");

var None = values.Keyword.None;
var Auto = values.Keyword.Auto;
var Block = values.Keyword.Block;
var Inline = values.Keyword.Inline;
var LineBreak = values.Keyword.LineBreak;
var InlineBlock = values.Keyword.InlineBlock;

// CSS values 3 §8: calc() is an expression, and the parsers below take only
// literals — a declaration holding one was dropped and the box fell back to
// its initial value. iana.org sizes the box inside its sidebar with
// calc(250px - 25px); with no width it measured 2px, which left the sidebar
// itself with none and painted it over the article beside it.
//
// Resolved here only where every term is an absolute length, a root em or a
// plain number. The root font size is known before any box is built; a
// percentage or an em needs a containing block or a font this does not have,
// and is left alone rather than guessed at. Codex sizes its icons
// `calc(1rem + 4px)`, and unresolved the icon box had no size and the SVG in
// it, 100% of that, was laid out as wide as the search field.
var ABSOLUTE_UNITS = {
  px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, pt: 96 / 72, pc: 16,
};

function evaluateExpression(text) {
  var tokens = text.match(/\d*\.?\d+[a-z%]*|[-+*/()]/gi);

  if (!tokens) return null;

  var at = 0;
  var peek = function () { return tokens[at]; };
  var next = function () { return tokens[at++]; };

  var expression = function () {
    var left = term();

    while (left !== null && (peek() === "+" || peek() === "-")) {
      var operator = next();
      var right = term();

      if (right === null) return null;

      left = operator === "+" ? left + right : left - right;
    }

    return left;
  };

  var term = function () {
    var left = primary();

    while (left !== null && (peek() === "*" || peek() === "/")) {
      var operator = next();
      var right = primary();

      if (right === null || (operator === "/" && right === 0)) return null;

      left = operator === "*" ? left * right : left / right;
    }

    return left;
  };

  var primary = function () {
    var token = next();

    if (token === "(") {
      var inner = expression();

      return inner !== null && next() === ")" ? inner : null;
    }

    if (token === "-") {
      var negated = primary();

      return negated === null ? null : -negated;
    }

    if (token === "+") return primary();

    var parts = /^(\d*\.?\d+)([a-z%]*)$/i.exec(token || "");

    if (!parts) return null;

    var unit = parts[2].toLowerCase();

    if (!unit) return parseFloat(parts[1]);
    if (unit === "rem") return parseFloat(parts[1]) * rootFontSize;
    if (viewportUnits.is(unit)) return viewportUnits.toPx(parseFloat(parts[1]), unit);
    if (ABSOLUTE_UNITS[unit] === undefined) return null;

    return parseFloat(parts[1]) * ABSOLUTE_UNITS[unit];
  };

  var result = expression();

  return at === tokens.length && result !== null && isFinite(result) ? result : null;
}

function resolveCalc(value) {
  var text = String(value);

  if (!/calc\(/i.test(text)) return value;

  for (var guard = 0; guard < 8 && /calc\(/i.test(text); guard++) {
    var start = text.search(/calc\(/i);
    var open = text.indexOf("(", start);
    var depth = 0;
    var end = -1;

    for (var i = open; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) { end = i; break; }
    }

    if (end === -1) return value;

    var inner = text.slice(open + 1, end);

    // A nested calc is resolved first, and left alone if it cannot be.
    if (/calc\(/i.test(inner)) {
      var resolvedInner = resolveCalc(inner);

      if (resolvedInner === inner) return value;

      text = text.slice(0, open + 1) + resolvedInner + text.slice(end);
      continue;
    }

    var pixels = evaluateExpression(inner);

    if (pixels === null) return value;

    text = text.slice(0, start) + (Math.round(pixels * 1000) / 1000) + "px" + text.slice(end + 1);
  }

  return text;
}

var isInlineLevelBox = function (box) {
  return (
    box instanceof InlineBox ||
    box instanceof InlineBlockBox ||
    box instanceof TextBox ||
    box instanceof LineBreakBox ||
    box instanceof ImageBox.Inline
  );
};

// An inline-block is inline-level outside and a block container inside (CSS 2.1
// 9.2.1): what it holds is never split out of it, as an inline's block-level
// children are, and its own inline content is set in lines of its own.
var isInlineContainerBox = function (box) {
  return (
    box instanceof InlineBox ||
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
  return box instanceof Viewport || box instanceof BlockBox || box instanceof InlineBlockBox;
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
    if (viewportUnits.is(value.unit)) return viewportUnits.toPx(value.length, value.unit);
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
 * A line-height's computed value is a number or an absolute length: a length
 * or percentage is resolved against the element's own font-size, and that is
 * what its descendants inherit — not the factor, against fonts of their own.
 * Left as "1.2em", a 40px heading's lines were resolved against 16px and laid
 * over one another.
 */
var resolveLineHeight = function (styles) {
  var value = styles["line-height"];

  if (!value || (!values.Percentage.is(value) && !(values.Length.is(value) && value.unit !== "px"))) {
    return;
  }

  var fontSize = styles["font-size"];
  var px = lengthToPx(value, fontSize && values.Length.is(fontSize) ? fontSize.length : DEFAULT_FONT_SIZE);

  if (px === null || !isFinite(px)) {
    return;
  }

  var resolved = values.Length.px(px);
  resolved.specificity = value.specificity;
  styles["line-height"] = resolved;
};

// A value object of its own: the specificity the style pass records is set on
// the value, and a value shared with the parent would take the child's.
var copyValue = function (value) {
  return Object.assign(Object.create(Object.getPrototypeOf(value)), value);
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

// CSS Display 3 §2: "flow-root" generates a block box that establishes a new
// block formatting context. No formatting context is modelled here, so the box
// it generates is a block's. Unparsed it fell to the initial "inline", and an
// element meant to stand on a line of its own was laid out inside the line
// around it — every heading on Wikipedia, which sets h1-h6 to flow-root.
var DISPLAY_ALIASES = { "flow-root": "block" };

// The block-level display each inline-level one becomes when blockified.
var BLOCKIFIED_DISPLAY = { inline: "block", "inline-block": "block", "inline-grid": "grid" };

// Every property repaint has a declaration for, in declaration order. Built
// once: the set is the same for every element.
var DECLARED_PROPERTIES = Object.keys(declarations);

// What the style pass could not map, each reported once per layout pass:
// reported per element, a long page printed the same handful of names some
// 137,000 times.
var reported = new Set();
var warnOnce = function (message) {
  if (!reported.has(message)) {
    reported.add(message);
    console.warn(message);
  }
};

var parseStylesFromCSSStyleDeclaration = function (style, parentStyle) {
  var styles = {};

  // Every property repaint declares, then every other one the declaration
  // lists, which is where a shorthand cssstyle does not expand itself (inset,
  // place-items, border-radius...) is found and handed to expand() below. Read
  // through the CSSOM's indices, not cssstyle's private value store, whose
  // shape is not an interface.
  var allproperties = DECLARED_PROPERTIES.slice();
  var listed = {};

  for (var i = 0; i < style.length; i++) {
    var name = style[i];

    if (!declarations[name] && !listed[name]) {
      listed[name] = true;
      allproperties.push(name);
    }
  }

  for (var p = 0; p < allproperties.length; p++) {
    var property = allproperties[p];
    // Read once: each read of a computed style goes through the declaration's
    // getter, and this runs for every property of every element.
    var raw = style[property];

    if (raw) {
      var expanded = expand(property, raw);
      var wasShorthand = Object.keys(expanded).length > 1;
      var specificity = wasShorthand ? 1 : 2;
      for (var key in expanded) {
        if (!styles[key] || styles[key].specificity < specificity) {
          if (!declarations[key]) {
            warnOnce("CSS Mapping: Unknown property: " + key);
            continue;
          }

          // css-cascade-4: the CSS-wide keywords are not values of the property
          // and no property's own parser accepts them. Passing them through left
          // a literal "inherit" sitting where a keyword was expected, and the
          // text renderer built a font string out of it that the canvas then
          // rejected, silently falling back to its default size: whole runs of
          // text painted at 10px inside boxes measured for 16.
          var wide = String(expanded[key]).trim().toLowerCase();

          if (wide === "inherit" || wide === "initial" || wide === "unset" ||
            wide === "revert" || wide === "revert-layer") {
            var takesParent = wide === "inherit" ||
              ((wide === "unset" || wide === "revert" || wide === "revert-layer") &&
                declarations[key].INHERITED);
            var inheritedValue = takesParent && parentStyle && parentStyle[key] ? copyValue(parentStyle[key]) : null;

            styles[key] = inheritedValue || declarations[key].INITIAL;
            styles[key].specificity = specificity;
            continue;
          }

          var specified = key === "display"
            ? DISPLAY_ALIASES[wide] || expanded[key]
            : expanded[key];
          var value = declarations[key].parseValue(resolveCalc(specified), parentStyle);
          if (!value) {
            warnOnce(
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
    } else if (declarations[property] && !styles[property]) {
      // An inherited property with no declaration of its own takes the
      // parent's computed value. jsdom resolves inheritance for only a few
      // properties and reports nothing for the rest, fonts and line-height
      // among them; given the initial value instead, a page's body font
      // reached no paragraph and a link in a 40px heading was 16px. The
      // parent's values are computed ones by now: font-size and line-height
      // are made absolute below, and the rest carry no unit.
      //
      // Only where nothing has been written yet: a longhand the style object
      // does not carry is still set by its shorthand, and this would take that
      // back — a gap declared as a pair leaves row-gap and column-gap at zero.
      var inherits = declarations[property].INHERITED && parentStyle && parentStyle[property];

      styles[property] = inherits
        ? copyValue(parentStyle[property])
        : declarations[property].INITIAL;
      styles[property].specificity = 0;
    }
  }

  // CSS 2.1 §9.7: an absolutely positioned box is blockified — its inline
  // display computes to the block one. Left inline, it was laid out inside an
  // anonymous line of its parent, which is then what everything inside it was
  // measured against: lichess's `<cg-board>`, an unknown element made absolute
  // and 100% of the board, came out with no height and its pieces stacked.
  var position = styles.position && styles.position.keyword;
  var blockified = (position === "absolute" || position === "fixed") &&
    styles.display && BLOCKIFIED_DISPLAY[styles.display.keyword];

  if (blockified) {
    var specificity = styles.display.specificity;
    styles.display = declarations.display.parseValue(blockified);
    styles.display.specificity = specificity;
  }

  resolveFontSize(styles, parentStyle, style.fontSize);
  resolveLineHeight(styles);

  // Properties the layout has no model for, carried verbatim for whoever
  // paints the boxes. A transform does not affect layout — CSS transforms 2
  // §3 — so nothing here needs it, but a box drawn without one is in the
  // wrong place, and the declaration is only cheap to read here.
  //
  // The background layers below the colour are here for the same reason: a
  // background image does not change where a box sits, and the only other way
  // to reach one is a getComputedStyle per box from whoever paints it — which
  // runs the whole cascade again, where this declaration is already in hand.
  styles.unsupported = {
    transform: style.transform || "",
    transformOrigin: style.transformOrigin || "",
    backgroundImage: style.backgroundImage || "",
    backgroundSize: style.backgroundSize || "",
    backgroundPosition: style.backgroundPosition || "",
    backgroundRepeat: style.backgroundRepeat || "",
    // CSS Masking 1 §6, with the -webkit- forms Chrome still answers to and
    // pages still write first.
    maskImage: style.getPropertyValue("mask-image") || style.getPropertyValue("-webkit-mask-image") || "",
    maskSize: style.getPropertyValue("mask-size") || style.getPropertyValue("-webkit-mask-size") || "",
    maskPosition: style.getPropertyValue("mask-position") || style.getPropertyValue("-webkit-mask-position") || "",
    maskRepeat: style.getPropertyValue("mask-repeat") || style.getPropertyValue("-webkit-mask-repeat") || "",
  };

  return styles;
};

var layoutPass = 0;

/*
A style parsed from a computed style is kept by that computed style and by the
parent's parsed style, the two things it is parsed from. jsdom hands back the
same computed style for as long as nothing it is computed from changes, so an
element whose style did not change is not parsed again: on a long article,
parsing every element's style was a fifth of every layout pass. The root font
size and the viewport, which rem and viewport lengths resolve against, start a
new store when they change. Parsed styles are read, never written, after they
are made, which is what lets elements and passes share them.
*/
var parsedStyles = new WeakMap();
var parsedAgainst = null;
// What the body's style is parsed against: the viewport's, which is made
// again every pass from nothing but the viewport's size.
var VIEWPORT_PARENT = {};

var parsedStyleOf = function (node, window, parent) {
  var computed = computedStyle ? computedStyle(node) : window.getComputedStyle(node);
  var parentKey = parent instanceof Viewport ? VIEWPORT_PARENT : parent && parent.style;
  var byParent = parsedStyles.get(computed);

  if (!byParent) {
    byParent = new WeakMap();
    parsedStyles.set(computed, byParent);
  }

  var styles = parentKey ? byParent.get(parentKey) : undefined;

  if (!styles) {
    styles = parseStylesFromCSSStyleDeclaration(computed, parent && parent.style);

    if (parentKey) {
      byParent.set(parentKey, styles);
    }
  }

  return styles;
};

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
  // A textarea's child text is its default value, not content to lay out: the
  // control draws it itself. Laid out, it also split the control's own box
  // across the lines the text wrapped onto, and the renderer built a widget for
  // each of them -- a second textarea drawn beside the first.
  TEXTAREA: true,
  SCRIPT: true,
  STYLE: true,
  // Scripting is enabled here, so a noscript element's contents are not markup
  // at all: the parser leaves them as one text node, which was being painted as
  // a line of raw HTML across the top of the page.
  NOSCRIPT: true,
  TEMPLATE: true,
  TITLE: true,
  META: true,
  LINK: true,
}

// A declaration with nothing in it, read as a computed style is.
var EMPTY_DECLARATION = {
  length: 0,
  getPropertyValue: function () {
    return "";
  },
};

var build = function (parent, nodes) {
  for (var node of nodes) {
    let box;

    if (node.nodeType === ELEMENT_NODE) {
      const window =
        node.ownerDocument.defaultView || node.ownerDocument.parentWindow;
      // A style that cannot be computed lays this element out with initial
      // values, inherited ones from its parent, instead of ending the layout
      // of the whole document at it.
      var style;
      try {
        style = parsedStyleOf(node, window, parent);
      } catch (error) {
        console.warn("Style of <" + node.localName + "> could not be computed: " + (error && error.message));
        style = parseStylesFromCSSStyleDeclaration(EMPTY_DECLARATION, parent?.style);
      }
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
    } else if (node.nodeType === TEXT_NODE) {
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
  reported.clear();

  // Published before anything is laid out: rem lengths resolve against it in
  // both toPx implementations, which have no other way to reach <html>.
  rootFontSize = computeRootFontSize(body);
  sharedRootFontSize.set(rootFontSize);
  viewportUnits.set(viewport.dimensions);

  var against = rootFontSize + ":" + viewport.dimensions.width + ":" + viewport.dimensions.height;

  if (against !== parsedAgainst) {
    parsedStyles = new WeakMap();
    parsedAgainst = against;
  }

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
