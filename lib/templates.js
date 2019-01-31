;(function (root, factory)
{
	'use strict';

	if (typeof module === 'object' && module.exports) module.exports = factory();
	else if (typeof define === 'function' && define.amd) define([], factory);
	else root['/*MODULENAME*/'] = factory();
}(typeof window === 'object' ? window : this, function ()
{
	'use strict';

	var templates = {};

/*PLACEHOLDER*/


	var ctrl = {
			ctx: {},
			render: __render,

			get: function (_sTplName)
			{
				return templates[_sTplName];
			},

			escape: null,
			amp: true
		},

		ENCODE_HTML_RULES = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&#34;',
			"'": '&#39;'
		},
		MATCH_HTML = /[&<>'"]/g,

		__render = function (_sTplName, _data)
		{
			return templates[_sTplName](extend({}, ctrl.ctx, _data));
		},
		__esc = function (_html)
		{
			__esc = ctrl.escape || __escape;

			if (!ctrl.amp)
			{
				ENCODE_HTML_RULES['&'] = '&';
			}

			return __esc(_html);
		};

	return ctrl;


	function __escape (_html)
	{
		return _html && String(_html).replace(MATCH_HTML, encode_char) || '';
	}
	function encode_char (c)
	{
		return ENCODE_HTML_RULES[c] || c;
	}

	function extend (_oTarget)
	{
		var args = arguments,
			iLength = args.length,
			oSource, xCopy,
			i, sProp;

		for (i = 1; i < iLength; i++)
		{
			oSource = args[i];

			if (oSource)
			{
				for (sProp in oSource)
				{
					xCopy = oSource[sProp];

					// Prevent never-ending loop
					if (_oTarget === xCopy) continue;

					// Don't bring in undefined values
					if (typeof xCopy !== 'undefined')
					{
						_oTarget[sProp] = xCopy;
					}
				}
			}
		}

		return _oTarget;
	}
}));
