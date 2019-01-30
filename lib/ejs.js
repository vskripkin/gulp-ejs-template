/*
 * EJS Embedded JavaScript templates
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

'use strict';

/**
 * @file Embedded JavaScript templating engine. {@link http://ejs.co}
 * @author Matthew Eernisse <mde@fleegix.org>
 * @author Tiancheng "Timothy" Gu <timothygu99@gmail.com>
 * @project EJS
 * @license {@link http://www.apache.org/licenses/LICENSE-2.0 Apache License, Version 2.0}
 */

/**
 * EJS internal functions.
 *
 * Technically this "module" lies in the same file as {@link module:ejs}, for
 * the sake of organization all the private functions re grouped into this
 * module.
 *
 * @module ejs-internal
 * @private
 */

var fs = require('fs'),

	_REGEX_STRING = '(<%%|%%>|<%=|<%-|<%_|<%#|<%|%>|-%>|_%>)',
	_DEFAULT_OPEN_DELIMITER = '<',
	_DEFAULT_CLOSE_DELIMITER = '>',
	_DEFAULT_DELIMITER = '%',
	_DEFAULT_LOCALS_NAME = 'locals',
	_BOM = /^\uFEFF/;



var regExpChars = /[|\\{}()[\]^$+*?.]/g;

function escapeRegExpChars (_str)
{
	return _str && String(_str).replace(regExpChars, '\\$&') || '';
}


/**
 * Escape characters reserved in XML.
 *
 * If `markup` is `undefined` or `null`, the empty string is returned.
 *
 * @implements {EscapeCallback}
 * @param {String} markup Input string
 * @return {String} Escaped string
 * @static
 * @private
 */

var _ENCODE_HTML_RULES = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&#34;',
		"'": '&#39;'
	},
	_MATCH_HTML = /[&<>'"]/g;

function encode_char (c)
{
	return _ENCODE_HTML_RULES[c] || c;
}

function escapeXML (_html)
{
	return _html && String(_html).replace(_MATCH_HTML, encode_char) || '';
}



/**
 * Re-throw the given `err` in context to the `str` of ejs, `filename`, and `lineno`.
 *
 * @implements RethrowCallback
 * @memberof module:ejs-internal
 * @param {Error}  err      Error object
 * @param {String} str      EJS source
 * @param {String} filename file name of the EJS file
 * @param {String} lineno   line number of the error
 * @static
 */

function rethrow (err, str, flnm, lineno, esc)
{
	var lines = str.split('\n');
	var start = Math.max(lineno - 3, 0);
	var end = Math.min(lines.length, lineno + 3);
	var filename = esc(flnm); // eslint-disable-line
	// Error context
	var context = lines.slice(start, end).map(function (line, i){
		var curr = i + start + 1;
		return (curr == lineno ? ' >> ' : '    ')
			+ curr
			+ '| '
			+ line;
	}).join('\n');

	// Alter exception message
	err.path = filename;
	err.message = (filename || 'ejs') + ':'
		+ lineno + '\n'
		+ context + '\n\n'
		+ err.message;

	throw err;
}

function stripSemi (str)
{
	return str.replace(/;(\s*$)/, '$1');
}

/**
 * Compile the given `str` of ejs into a template function.
 *
 * @param {String}  template EJS template
 *
 * @param {Options} opts     compilation options
 *
 * @return {(TemplateFunction|ClientFunction)}
 * Depending on the value of `opts.client`, either type might be returned.
 * Note that the return type of the function also depends on the value of `opts.async`.
 * @public
 */

exports.compile = function (template, opts)
{
	return (new Template(template, opts)).compile();
};



/**
 * EJS template class
 * @public
 */
exports.Template = Template;


function Template (text, opts)
{
	opts = opts || {};

	var options = {};

	this.mode = null;
	this.truncate = false;
	this.currentLine = 1;
	this.source = '';
	this.dependencies = [];

	options.client = opts.client || false;
	options.escapeFunction = opts.escape || opts.escapeFunction || escapeXML;
	options.compileDebug = opts.compileDebug !== false;
	options.debug = !!opts.debug;
	options.filename = opts.filename;
	options.openDelimiter = opts.openDelimiter || _DEFAULT_OPEN_DELIMITER;
	options.closeDelimiter = opts.closeDelimiter || _DEFAULT_CLOSE_DELIMITER;
	options.delimiter = opts.delimiter || _DEFAULT_DELIMITER;
	options.strict = opts.strict || false;
	options.context = opts.context;
	options.root = opts.root;
	options.outputFunctionName = opts.outputFunctionName;
	options.localsName = opts.localsName || _DEFAULT_LOCALS_NAME;
	options.views = opts.views;
	options.async = opts.async;

	if (options.strict)
	{
		options._with = false;
	}
	else
	{
		options._with = typeof opts._with != 'undefined' ? opts._with : true;
	}

	this.opts = options;


	var sRegex = _REGEX_STRING,
		sDelim = escapeRegExpChars(options.delimiter),
		sOpen  = escapeRegExpChars(options.openDelimiter),
		sClose = escapeRegExpChars(options.closeDelimiter);

	sRegex =  sRegex.replace(/%/g, sDelim)
					.replace(/</g, sOpen)
					.replace(/>/g, sClose);

	this.regex = new RegExp(sRegex);


	// Slurp spaces and tabs before <%_ and after _%>
	this.templateText = text.replace(/[\r\n]+/g, '\n')
							.replace(/^\s+|\s+$/gm, '')
							.replace(new RegExp('[ \t]*' + sOpen + sDelim + '_', 'gm'), sOpen + sDelim + '_')
							.replace(new RegExp('_' + sDelim + sClose + '[ \t]*', 'gm'), '_' + sDelim + sClose);
}

Template.modes = {
	EVAL: 'eval',
	ESCAPED: 'escaped',
	RAW: 'raw',
	COMMENT: 'comment',
	LITERAL: 'literal'
};

Template.prototype = {
	compile: function ()
	{
		var src;
		var opts = this.opts;
		var prepended = '';
		var appended = '';
		var escapeFn = opts.escapeFunction;

		if (!this.source)
		{
			this.generateSource();

			prepended += '  var __output = [], __append = __output.push.bind(__output);' + '\n';

			if (opts.outputFunctionName)
			{
				prepended += '  var ' + opts.outputFunctionName + ' = __append;' + '\n';
			}

			if (opts._with !== false)
			{
				prepended +=  '  with (' + opts.localsName + ' || {}) {' + '\n';
				appended += '  }' + '\n';
			}

			appended += '  return __output.join("");' + '\n';
			this.source = prepended + this.source + appended;
		}


		if (opts.compileDebug)
		{
			src = 'var __line = 1' + '\n'
				+ '  , __lines = ' + JSON.stringify(this.templateText) + '\n'
				+ '  , __filename = ' + (opts.filename ?
				JSON.stringify(opts.filename) : 'undefined') + ';' + '\n'
				+ 'try {' + '\n'
				+ this.source
				+ '} catch (e) {' + '\n'
				+ '  rethrow(e, __lines, __filename, __line, escapeFn);' + '\n'
				+ '}' + '\n';
		}
		else
		{
			src = this.source;
		}

		if (opts.strict)
		{
			src = '"use strict";\n' + src;
		}
		if (opts.debug)
		{
			console.log(src);
		}

		return 'function (' + opts.localsName + ') {\n ' + src + ' \n}';
	},

	generateSource: function ()
	{
		var opts = this.opts;

		var self = this;
		var matches = this._parseTemplateText();
		var d = this.opts.delimiter;
		var o = this.opts.openDelimiter;
		var c = this.opts.closeDelimiter;

		if (matches && matches.length)
		{
			matches.forEach(function (line, index)
			{
				var opening;
				var closing;
				var include;
				var includeOpts;
				var includeObj;
				var includeSrc;

				// If this is an opening tag, check for closing tags
				// FIXME: May end up with some false positives here
				// Better to store modes as k/v with openDelimiter + delimiter as key
				// Then this can simply check against the map
				if ( line.indexOf(o + d) === 0        // If it is a tag
					&& line.indexOf(o + d + d) !== 0) { // and is not escaped
					closing = matches[index + 2];
					if (!(closing == d + c || closing == '-' + d + c || closing == '_' + d + c)) {
						throw new Error('Could not find matching close tag for "' + line + '".');
					}
				}

				self.scanLine(line);
			});
		}
	},
	_parseTemplateText: function ()
	{
		var sTemplate = this.templateText,
			rPattern = this.regex,
			aParsed = [],
			oResult, iFirstPos;

		while ((oResult = rPattern.exec(sTemplate)))
		{
			iFirstPos = oResult.index;

			if (iFirstPos !== 0)
			{
				aParsed.push(sTemplate.substring(0, iFirstPos));
				sTemplate = sTemplate.slice(iFirstPos);
			}

			aParsed.push(oResult[0]);
			sTemplate = sTemplate.slice(oResult[0].length);
		}

		if (sTemplate)
		{
			aParsed.push(sTemplate);
		}

		return aParsed;
	},

	scanLine: function (line)
	{
		var self = this;
		var d = this.opts.delimiter;
		var o = this.opts.openDelimiter;
		var c = this.opts.closeDelimiter;
		var newLineCount = 0;

		newLineCount = (line.split('\n').length - 1);

		switch (line)
		{
			case o + d:
			case o + d + '_':
				this.mode = Template.modes.EVAL;
				break;
			case o + d + '=':
				this.mode = Template.modes.ESCAPED;
				break;
			case o + d + '-':
				this.mode = Template.modes.RAW;
				break;
			case o + d + '#':
				this.mode = Template.modes.COMMENT;
				break;
			case o + d + d:
				this.mode = Template.modes.LITERAL;
				this.source += '    ; __append("' + line.replace(o + d + d, o + d) + '")' + '\n';
				break;
			case d + d + c:
				this.mode = Template.modes.LITERAL;
				this.source += '    ; __append("' + line.replace(d + d + c, d + c) + '")' + '\n';
				break;
			case d + c:
			case '-' + d + c:
			case '_' + d + c:
				if (this.mode == Template.modes.LITERAL) {
					this._addOutput(line);
				}

				this.mode = null;
				this.truncate = line.indexOf('-') === 0 || line.indexOf('_') === 0;
				break;
			default:
				// In script mode, depends on type of tag
				if (this.mode) {
					// If '//' is found without a line break, add a line break.
					switch (this.mode) {
					case Template.modes.EVAL:
					case Template.modes.ESCAPED:
					case Template.modes.RAW:
						if (line.lastIndexOf('//') > line.lastIndexOf('\n')) {
							line += '\n';
						}
					}
					switch (this.mode) {
					// Just executing code
					case Template.modes.EVAL:
						this.source += '    ; ' + line + '\n';
						break;
						// Exec, esc, and output
					case Template.modes.ESCAPED:
						this.source += '    ; __append(escapeFn(' + stripSemi(line) + '))' + '\n';
						break;
						// Exec and output
					case Template.modes.RAW:
						this.source += '    ; __append(' + stripSemi(line) + ')' + '\n';
						break;
					case Template.modes.COMMENT:
						// Do nothing
						break;
						// Literal <%% mode, append as raw output
					case Template.modes.LITERAL:
						this._addOutput(line);
						break;
					}
				}
				// In string mode, just add the output
				else {
					this._addOutput(line);
				}
		}

		if (self.opts.compileDebug && newLineCount)
		{
			this.currentLine += newLineCount;
			this.source += '    ; __line = ' + this.currentLine + '\n';
		}
	},
	_addOutput: function (line)
	{
		if (this.truncate)
		{
			// Only replace single leading linebreak in the line after
			// -%> tag -- this is the single, trailing linebreak
			// after the tag that the truncation mode replaces
			// Handle Win / Unix / old Mac linebreaks -- do the \r\n
			// combo first in the regex-or
			line = line.replace(/^(?:\r\n|\r|\n)/, '');
			this.truncate = false;
		}

		if (!line)
		{
			return line;
		}

		// Preserve literal slashes
		line = line.replace(/\\/g, '\\\\');

		// Convert linebreaks
		line = line.replace(/\n/g, '\\n');
		line = line.replace(/\r/g, '\\r');

		// Escape double-quotes
		// - this will be the delimiter during execution
		line = line.replace(/"/g, '\\"');
		this.source += '    ; __append("' + line + '")' + '\n';
	}
};
