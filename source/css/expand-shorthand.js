var expand = require('css-shorthand-expand');
var properties = require('css-shorthand-properties');
var flatten = require('flatten');
var extend = require('xtend');
var tuple = require('tuple');

module.exports = function(name, value) {

	// gap is declared as a single length, so its two value form has to be split
	// here or the declaration does not parse at all. Row first, column second.
	//
	// Split at the spaces outside parentheses only: a function's arguments are
	// one length, and split at their spaces `clamp(1.25rem, 2vw, 1.75rem)` was
	// a row gap of "clamp(1.25rem," and dropped.
	if (name === 'gap' || name === 'grid-gap') {
		var parts = [];
		var depth = 0;
		var current = '';

		String(value).trim().split('').forEach(function(char) {
			if (char === '(') depth++;
			if (char === ')') depth = Math.max(0, depth - 1);

			if (depth === 0 && /\s/.test(char)) {
				if (current) parts.push(current);
				current = '';
			} else {
				current += char;
			}
		});

		if (current) parts.push(current);

		// Only the longhands: a gap of its own would set both gutters and take
		// the column one back with it.
		if (parts.length > 1) {
			return { 'row-gap': parts[0], 'column-gap': parts[1] };
		}

		return { 'row-gap': parts[0], 'column-gap': parts[0] };
	}

	// inset is top, right, bottom and left in margin's order, and is not in the
	// expander's table either: a fixed overlay written `inset: 0` was given no
	// offsets at all, and came out as small as its content in a corner.
	if (name === 'inset') {
		var sides = String(value).trim().split(/\s+(?![^(]*\))/);

		if (sides.length >= 1 && sides.length <= 4) {
			var top = sides[0];
			var right = sides[1] !== undefined ? sides[1] : top;
			var bottom = sides[2] !== undefined ? sides[2] : top;
			var left = sides[3] !== undefined ? sides[3] : right;

			return { top: top, right: right, bottom: bottom, left: left };
		}
	}

	// flex is not in the table the expander works from, so it arrived whole and
	// only the basis in it was ever read: an item written "flex: 0px" kept the
	// initial grow of 0 against a basis of nothing and came out with no width.
	// CSS flexbox 1 7.1.1, where a lone basis means "flex: 1 1 <basis>".
	if (name === 'flex') {
		var text = String(value).trim().toLowerCase();

		if (text === 'none') return { 'flex-grow': '0', 'flex-shrink': '0', 'flex-basis': 'auto' };
		if (text === 'initial') return { 'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto' };
		if (text === 'auto') return { 'flex-grow': '1', 'flex-shrink': '1', 'flex-basis': 'auto' };

		var words = text.split(/\s+/);
		var number = function(word) { return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(word); };

		if (words.length && words.length < 4) {
			var grow = '1';
			var shrink = '1';
			// A basis is omitted from the one and two value forms only where
			// the values given are numbers, and then it is zero rather than
			// automatic.
			var basis = '0%';
			var read = 0;

			if (number(words[0])) {
				grow = words[read++];

				if (words.length > read && number(words[read])) {
					shrink = words[read++];
				}

				if (words.length > read) {
					basis = words[read++];
				}
			} else {
				basis = words[read++];
			}

			if (read === words.length) {
				return { 'flex-grow': grow, 'flex-shrink': shrink, 'flex-basis': basis };
			}
		}
	}

	var expanded = expand(name, value);
	if(!expanded) return tuple(name, value);

	var recursive = /^border/.test(name);
	var all = properties.expand(name, recursive);
	all = flatten(all);
	all = all.reduce(function(acc, property) {
		acc[property] = 'initial';
		return acc;
	}, {});

	return extend(all, expanded);
};
