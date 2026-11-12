// calc(), min(), max() and clamp() (CSS Values 4 §10), evaluated to pixels.
// Each length or percentage term is resolved the way it would be on its own --
// `resolve` is the box's own toPx for the property -- so a percentage keeps the
// basis the property gives it. A bare number stays a number for * and /.
// Anything that does not parse evaluates to NaN, which callers treat as no
// value.

var TOKEN = /\s*(?:([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|[a-z]+)?|([a-z-]+)\(|([()+\-*/,]))/iy;

function tokenize(text) {
  var tokens = [];
  TOKEN.lastIndex = 0;

  while (TOKEN.lastIndex < text.length) {
    if (/^\s*$/.test(text.slice(TOKEN.lastIndex))) break;

    var start = TOKEN.lastIndex;
    var match = TOKEN.exec(text);

    if (!match || TOKEN.lastIndex === start) return null;

    if (match[1] !== undefined) tokens.push({ number: parseFloat(match[1]), unit: match[2] || "" });
    else if (match[3] !== undefined) tokens.push({ fn: match[3].toLowerCase() });
    else tokens.push({ op: match[4] });
  }

  return tokens;
}

exports.FUNCTIONS = ["calc", "min", "max", "clamp"];

exports.is = function (text) {
  return /^\s*(calc|min|max|clamp)\(/i.test(String(text));
};

// `resolve(number, unit)` gives a length or percentage term in pixels.
exports.evaluate = function (text, resolve) {
  var tokens = tokenize(String(text));
  if (!tokens) return NaN;

  var at = 0;
  var peek = function () { return tokens[at]; };
  var take = function () { return tokens[at++]; };
  var expectOp = function (op) {
    var token = take();
    if (!token || token.op !== op) throw new Error("expected " + op);
  };

  function sum() {
    var value = product();
    while (peek() && (peek().op === "+" || peek().op === "-")) {
      var op = take().op;
      var right = product();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  function product() {
    var value = factor();
    while (peek() && (peek().op === "*" || peek().op === "/")) {
      var op = take().op;
      var right = factor();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }

  function args() {
    var list = [sum()];
    while (peek() && peek().op === ",") {
      take();
      list.push(sum());
    }
    expectOp(")");
    return list;
  }

  function factor() {
    var token = take();
    if (!token) throw new Error("unexpected end");

    if (token.number !== undefined) {
      return token.unit === "" ? token.number : resolve(token.number, token.unit);
    }

    if (token.op === "(") {
      var inner = sum();
      expectOp(")");
      return inner;
    }

    if (token.op === "-") return -factor();
    if (token.op === "+") return factor();

    if (token.fn) {
      var values = args();
      switch (token.fn) {
        case "calc": return values.length === 1 ? values[0] : NaN;
        case "min": return Math.min.apply(Math, values);
        case "max": return Math.max.apply(Math, values);
        case "clamp": return values.length === 3 ? Math.max(values[0], Math.min(values[1], values[2])) : NaN;
        default: return NaN;
      }
    }

    throw new Error("unexpected token");
  }

  try {
    var result = sum();
    return at === tokens.length ? result : NaN;
  } catch (error) {
    return NaN;
  }
};
