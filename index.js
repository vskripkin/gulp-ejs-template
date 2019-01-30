'use strict';
/*
 * gulp-ng-template
 * https://github.com/teambition/gulp-ejs-template
 *
 * Copyright (c) 2014 Vladimir Skripkin
 * Licensed under the MIT license.
 */

var fs = require('fs'),
	util = require('util'),
	path = require('path'),
	Vinyl = require('vinyl'),
	PluginError = require('plugin-error'),
	through = require('through2');

var ejs = require('./lib/ejs'),
	sPackageName = require('./package.json').name,
	sTemplatesTpl = fs.readFileSync(path.join(__dirname,'./lib/templates.js'), {encoding: 'utf8'});


module.exports = function (_options)
{
	_options = _options || {};

	var sJoinedContent = '',
		sModuleName = _options.sModuleName || 'templates',
		sTemplates = sTemplatesTpl.replace('moduleName', sModuleName),
		sContentTpl = 'templates[\'%s\'] = templates[\'%s\'] = %s;\n\n',
		oJoinedFile = new Vinyl({
			cwd: __dirname,
			base: __dirname,
			path: path.join(__dirname, sModuleName + '.js')
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

		sJoinedContent += util.format(sContentTpl, normalName(sName), fullName(sName), sTpl);
		_next();
	},
	function ()
	{
		sJoinedContent = sJoinedContent.trim().replace(/^/gm, '  ');
		oJoinedFile.contents = new Buffer(sTemplates.replace('/*PLACEHOLDER*/', sJoinedContent));

		this.push(oJoinedFile);
		this.push(null);
	});

	function fullName (name)
	{
		return name.replace(/\\/g, '/');
	}

	function normalName (name)
	{
		return fullName(name).replace(path.extname(name), '');
	}
};
