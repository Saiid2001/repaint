var expand = require('css-shorthand-expand');
var properties = require('css-shorthand-properties');
var flatten = require('flatten');
var extend = require('xtend');
var tuple = require('tuple');

module.exports = function(name, value) {

	// gap is declared as a single length, so its two value form has to be split
	// here or the declaration does not parse at all. Row first, column second.
	if (name === 'gap' || name === 'grid-gap') {
		var parts = String(value).trim().split(/\s+/);

		// Only the longhands: a gap of its own would set both gutters and take
		// the column one back with it.
		if (parts.length > 1) {
			return { 'row-gap': parts[0], 'column-gap': parts[1] };
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
