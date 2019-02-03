'use strict';

exports.compile = function (_sTemplate, _opts)
{
	return (new Template(_sTemplate, _opts)).compile();
};



var _REGEX_STRING = '(<%=|<%-|<%_|<%#|<%|%>|-%>|_%>)',
	_TRAILING_SEMCOL = /;(\s*$)/, // чтобы удалить точку с запятой у вызываемого кода в тегах вывода контента
	_INCLUDE = / include\(/,
	_REGEX_CHARS = /[|\\{}()[\]^$+*?.]/g,
	_DEFAULT_OPEN_TAG = '<%',
	_DEFAULT_CLOSE_TAG = '%>',
	_DEFAULT_VARIABLE = 'ctx';


function Template (_sTpl, _opts)
{
	_opts = _opts || {};


	this.mode = null;
	this.truncate = false;
	this.source = '';
	this.opts = _opts = {
		'open-tag':  _opts['open-tag']  || _DEFAULT_OPEN_TAG,
		'close-tag': _opts['close-tag'] || _DEFAULT_CLOSE_TAG,
		'variable':  _opts.variable     || _DEFAULT_VARIABLE,

		'alt-escape-sign': _opts['alt-escape-sign'] || false
	};


	var sRegex = _REGEX_STRING,
		sOpen  = _opts['open-tag'],
		sClose = _opts['close-tag'],

		sOpenReg  = _opts['open-tag'].replace(_REGEX_CHARS,  '\\$&'),
		sCloseReg = _opts['close-tag'].replace(_REGEX_CHARS, '\\$&');

	sRegex =  sRegex.replace(new RegExp(_DEFAULT_OPEN_TAG,  'g'), sOpenReg)
					.replace(new RegExp(_DEFAULT_CLOSE_TAG, 'g'), sCloseReg);

	this.regex = new RegExp(sRegex);


	// Slurp spaces and tabs before <%_ and after _%>
	this.templateText = _sTpl.replace(/[\r\n]+/g, '\n')
							.replace(/^\s+|\s+$/gm, '')
							.replace(new RegExp('[ \t]*' + sOpenReg + '_', 'gm'), sOpen + '_')
							.replace(new RegExp('_' + sCloseReg + '[ \t]*', 'gm'), '_' + sClose);
};


Template.modes = {
	EVAL: 'eval',
	ESCAPED: 'escaped',
	RAW: 'raw',
	COMMENT: 'comment'
};

Template.prototype = {
	compile: function ()
	{
		this._generateSource();

		var sAppended = '\tvar __output = [], __append = print = __output.push.bind(__output);' + '\n';

		if (_INCLUDE.test(this.source))
		{
			sAppended += '\tvar include = function (_tpl, _data) { return __include(_tpl, _data); }\n  ';
		}

		this.source = sAppended + this.source + '\n\treturn __output.join("");';

		return  '/* ' + (this.templateName || '') + ' */ ' +
				'function (' + this.opts.variable + ')\n{\n' + this.source + '\n}';
	},

	_generateSource: function ()
	{
		var aMatches = this._parseTemplateText(),
			opts = this.opts,
			o    = this.opts['open-tag'],
			c    = this.opts['close-tag'];


		if (aMatches && aMatches.length)
		{
			var sLine, sClosing,
				i, L;

			for (i = 0, L = aMatches.length; i < L; i++)
			{
				sLine = aMatches[i];

				// If this is an opening tag, check for closing tags
				// FIXME: May end up with some false positives here
				// Better to store modes as k/v with open-tag as key
				// Then this can simply check against the map

				// If it is a tag
				if (sLine.indexOf(o) === 0)
				{
					sClosing = aMatches[i + 2];

					if (!(sClosing === c || sClosing === '-' + c || sClosing === '_' + c))
					{
						throw new Error('Could not find matching close tag for "' + sLine + '".');
					}
				}

				this._scanLine(sLine);
			}
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
	_scanLine: function (_sLine)
	{
		var opts = this.opts,
			o    = opts['open-tag'],
			c    = opts['close-tag'],

			sRaw = '-',
			sEscape = '=';

		if (opts['alt-escape-sign'])
		{
			sRaw = '=';
			sEscape = '-';
		}

		switch (_sLine)
		{
			case o:
			case o + '_':
				this.mode = Template.modes.EVAL;
				break;
			case o + sRaw:
				this.mode = Template.modes.RAW;
				break;
			case o + sEscape:
				this.mode = Template.modes.ESCAPED;
				break;
			case o + '#':
				this.mode = Template.modes.COMMENT;
				break;

			case c:
			case '-' + c:
			case '_' + c:
				this.mode = null;
				this.truncate = _sLine.indexOf('-') === 0 || _sLine.indexOf('_') === 0;
				break;


			default:
				// In string mode, just add the output
				if (!this.mode)
				{
					this._addOutput(_sLine);
				}
				// In script mode, depends on type of tag
				else
				{
					// If '//' is found without a line break, add a line break.
					// чтобы однострочный комментарий не подействовал на следующий добавленный код
					if (this.mode === Template.modes.EVAL || this.mode === Template.modes.ESCAPED || this.mode === Template.modes.RAW)
					{
						if (_sLine.lastIndexOf('//') > _sLine.lastIndexOf('\n'))
						{
							_sLine += '\n';
						}
					}

					switch (this.mode)
					{
						// Just executing code
						case Template.modes.EVAL:
							this.source += '; ' + _sLine + '\n';
							break;
						// Exec, esc, and output
						case Template.modes.ESCAPED:
							// удаляем точку с запятой у вызываемого кода
							this.source += '\t\t; __append(__esc(' + _sLine.replace(_TRAILING_SEMCOL, '$1').trim() + '))' + '\n';
							break;
						// Exec and output
						case Template.modes.RAW:
							// удаляем точку с запятой у вызываемого кода
							this.source += '\t\t; __append(' + _sLine.replace(_TRAILING_SEMCOL, '$1').trim() + ')' + '\n';
							break;
						// Do nothing
						case Template.modes.COMMENT:
							this._maybeTemplateName(_sLine);
							break;
					}
				}
		}
	},
	_addOutput: function (_sLine)
	{
		if (this.truncate)
		{
			// Only replace single leading linebreak in the line after
			// -%> tag -- this is the single, trailing linebreak
			// after the tag that the truncation mode replaces
			// Handle Win / Unix / old Mac linebreaks -- do the \r\n
			// combo first in the regex-or
			_sLine = _sLine.replace(/^(?:\r\n|\r|\n)/, '');
			this.truncate = false;
		}

		if (!_sLine) return;


		// Preserve literal slashes
		_sLine = _sLine.replace(/\\/g, '\\\\');

		// Convert linebreaks
		_sLine = _sLine.replace(/\n/g, '\\n');
		_sLine = _sLine.replace(/\r/g, '\\r');

		// Escape double-quotes
		// - this will be the delimiter during execution
		_sLine = _sLine.replace(/"/g, '\\"');

		this.source += '\t\t; __append("' + _sLine + '")' + '\n';
	},
	_maybeTemplateName: function (_sLine)
	{
		if (this.templateName) return;

		var aMatch = /^Template Name: ([a-zA-Z0-9_-]+)$/.exec(_sLine.trim());

		if (aMatch)
		{
			this.templateName = aMatch[1];
		}
	}
};
