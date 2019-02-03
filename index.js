'use strict';

/*
 * https://github.com/vskripkin/gulp-ejs-template
 *
 * Copyright (c) 2019 Vladimir Skripkin
 * Licensed under the MIT license.
 */


var fs = require('fs'),
	util = require('util'),
	path = require('path'),
	through = require('through2'),
	Vinyl = require('vinyl'),
	PluginError = require('plugin-error'),

	ejs = require('./lib/ejs'),
	sPackageName = require('./package.json').name,
	sTemplatesTpl = fs.readFileSync(path.join(__dirname,'./lib/templates.js'), {encoding: 'utf8'});


module.exports = function (_options)
{
	_options = _options || {};

	var sModuleName = _options['module-name'] || _options.moduleName || 'templates',
		sTemplates = sTemplatesTpl.replace('/*MODULENAME*/', sModuleName),
		sContentTpl = 'templates[\'%s\'] = %s;\n\n';


	if (_options.unify === false)
	{
		var rEscapeRegExp = /[|\\{}()[\]^$+*?.]/g,
			sTplType = (_options['tpl-type'] || 'text/template').replace(rEscapeRegExp, '\\$&'),
			aScript = [
				'<script\\s+type="' + sTplType +'"\\s+id="([^\'"]+)">([\\s\\S]+?)</script>',
				'<script\\s+id="([^\'"]+)"\\s+type="' + sTplType +'">([\\s\\S]+?)</script>'
			],
			rScript = new RegExp('(?:' + aScript.join('|') + ')', 'g');

		return through.obj(function (_oFile, _sEncoding, _next)
		{
			if (_oFile.isNull())
			{
				return _next();
			}
			if (_oFile.isStream())
			{
				return this.emit('error', new PluginError(sPackageName, 'Streaming not supported'));
			}


			var sName = path.relative(_oFile.base, _oFile.path),
				sContent = _oFile.contents.toString('utf8');

			sContent = sContent.replace(rScript, function (_sMatch, _ID, _sTpl)
			{
				return util.format(sContentTpl, _ID, ejs.compile(_sTpl, _options));
			})
			.trim().replace(/^/gm, '\t');

			_oFile.contents = new Buffer(sTemplates.replace('/*PLACEHOLDER*/', sContent));
			_oFile.path = path.join(__dirname, _oFile.stem + '.js');

			this.push(_oFile);
			_next();
		});
	}


	var sFileName = _options['file-name'] || sModuleName,
		sJoinedContent = '',
		oJoinedFile = new Vinyl({
			cwd: __dirname,
			base: __dirname,
			path: path.join(__dirname, sFileName + '.js')
		});

	return through.obj(function (_oFile, _sEncoding, _next)
	{
		if (_oFile.isNull())
		{
			return _next();
		}
		if (_oFile.isStream())
		{
			return this.emit('error', new PluginError(sPackageName, 'Streaming not supported'));
		}

		var sName = path.relative(_oFile.base, _oFile.path),
			sTpl = ejs.compile(_oFile.contents.toString('utf8'), _options);

		sJoinedContent += util.format(sContentTpl, template_name(sTpl, sName), sTpl);
		_next();
	},
	function ()
	{
		sJoinedContent = sJoinedContent.trim().replace(/^/gm, '\t');
		oJoinedFile.contents = new Buffer(sTemplates.replace('/*PLACEHOLDER*/', sJoinedContent));

		this.push(oJoinedFile);
		this.push(null);
	});


	function template_name (_sTpl, _sName)
	{
		var aMatch = /^\/\* ([a-zA-Z0-9_-]+) \*\/ /.exec(_sTpl);

		if (aMatch)
		{
			return aMatch[1];
		}

		return _sName.replace(/\\/g, '/').replace(path.extname(_sName), '');
	};
};
