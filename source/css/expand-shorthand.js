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
