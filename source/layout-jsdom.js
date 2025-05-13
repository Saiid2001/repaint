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

  return styles;
};

var bindDOMAndLayoutNode = function (domNode, layoutNode) {
  layoutNode.domRef = domNode;

  if (!domNode.layoutBoxes) {
    domNode.layoutBoxes = [];
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
