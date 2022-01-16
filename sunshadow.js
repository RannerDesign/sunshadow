/*	sunshadow.js
	v1.6.0	2022-01-16 RB
	Calculation of shadow, based on sun position and shadow generating objects
	Draw only without shadow but variable drawing formats
	Implementation of equiscale in calculateScaling
	Input and dial for shadowlevel, cot(Altitude)
	Variable format for any element
	Spin buttons for dials
	Text corrections
	Prepared for GitHub
*/

//	Program global variables
	var confFiles = [];					// List of available config files
	var currentConfigFile = '';			// Actual configfile
	var currenttime;					// Datetime of calculation
	var editor;							// Editor area (ACE)
	var canvas;							// Canvas element
	var ctx;							// Canvas context
	var CONF = {};						// configuration from json file
	var SGO = [];						// shadow generating objects
	var PRO;							// Projection area
	var polyClip;						// Clipping polygon for displayable areas

//	Program initialization
	document.addEventListener('DOMContentLoaded', function(e) {
//		console.log('Start sunshadow');
		editorInit();
		loadConfigList();
	});

//	------------------------------------------------------------------
//	Configuration file handling
//	------------------------------------------------------------------
//	Backend call for all functions
	function backend(action, filename, data, callback) {
		var param = new FormData();
		param.append('a', action);
		param.append('f', filename);
		param.append('d', data);
		var bckend = new XMLHttpRequest();
		bckend.open('POST', 'sunshadowbackend.php');
		bckend.onreadystatechange = function () {
			if (bckend.readyState === 4) {
				if (bckend.status === 200) {
					callback(action, filename, bckend.responseText);
				} else {
					console.log('backend - status no success:', bckend);
				}
			}
		}
		bckend.send(param);
	}

//	Get list of available config files
	function loadConfigList() {
		backend('dir', '', '', function(a, f, d) {
			var resp = JSON.parse(d);
			if (resp['status'] == 'success') {
				confFiles = resp['data'];
				confFiles.sort();
				loadConfigOptions();
			} else {
				console.log('Error in loadConfigList: ', d);
			}
		});
	}

//	Populate options for config file selection
	function loadConfigOptions() {
		var opt = '<option value="">File selection</option>';
		for (let i=0, ll=confFiles.length; i<ll; i++) {
			opt += '<option value="' + confFiles[i] + '">' + confFiles[i] + '</option>';
		}
		document.getElementById('conffile').innerHTML = opt;
	}

//	Read config file
	function readConfigFile() {
		var conffile = document.getElementById('conffile').value;
		if (!conffile) {return;}
		backend('get', conffile, '', function(a, f, d) {
			var resp = JSON.parse(d);
			if (resp['status'] == 'success') {
				CONF = JSON.parse(resp['data'][0]);
				currentConfigFile = f;
				simulatestop();
			} else {
				console.log('Error in readConfigFile: ', d);
				currentConfigFile = '';
			}
			editorPrepare();
			showConfigFileInfo();
		});
	}

//	Save config file
	function saveConfigFile() {
		if (!currentConfigFile) {return;}
		useEditorContent();
		let urlConf = encodeURIComponent(JSON.stringify(CONF, null, '\t'));
		backend('save', currentConfigFile, urlConf, function(a, f, d) {
			var resp = JSON.parse(d);
			if (resp['status'] == 'success') {
				console.log('saveConfigFile - success:', resp);
			} else {
				console.log('Error in saveConfigFile: ', d);
			}
			showConfigFileInfo();
		})
	}

//	Save as config file
	function saveAsConfigFile() {
		var saveasfile = document.getElementById('saveasfile').value;
		saveasfile = saveasfile.split('.')[0];			// dots aren't allowed
		if (!saveasfile) {return;}
		useEditorContent();
		let urlConf = encodeURIComponent(JSON.stringify(CONF, null, '\t'));
		backend('save', saveasfile, urlConf, function(a, f, d) {
			var resp = JSON.parse(d);
			if (resp['status'] == 'success') {
				currentConfigFile = f;
				loadConfigList();
				console.log('saveAsConfigFile - success:', resp);
			} else {
				console.log('Error in saveAsConfigFile: ', d);
			}
			showConfigFileInfo();
		})
	}

//	Delete config file
	function deleteConfigFile() {
		if (!currentConfigFile) {return;}
		backend('del', currentConfigFile, '', function(a, f, d) {
			var resp = JSON.parse(d);
			if (resp['status'] == 'success') {
				loadConfigList();
				document.getElementById('saveasfile').value = '';
				console.log('deleteConfigFile - success:', resp);
			} else {
				console.log('Error in deleteConfigFile: ', d);
			}
		})
	}

//	Show short information of config file
	function showConfigFileInfo() {
		var confdata = document.getElementById('confdata');
		try {
			let out = [];
			out.push(currentConfigFile);
			out.push(CONF['title']);
			out.push(CONF['date']);
			out.push(CONF['data'].length + ' elements');
			confdata.innerHTML = out.join('<br />');
			confdata.style.visibility = 'visible';
		} catch(err) {
			console.log('showConfigFileInfo - error: ', err.message);
			confdata.style.visibility = 'hidden';
		}
	}
//	------------------------------------------------------------------
//	Configuration file editor with ACE
//	------------------------------------------------------------------
//	Initialization
	function editorInit() {
		editor = ace.edit("editor");
		editor.setTheme("ace/theme/github");
		editor.session.setMode("ace/mode/json");
	}

//	Prepare editor content
	function editorPrepare() {
		editor.setValue(JSON.stringify(CONF, null, '\t'));
		editor.gotoLine(1, 1);
	}

//	Transfer editor content to working data (CONF)
	function useEditorContent() {
		tryConf = JSON.parse(editor.getValue());
		if (!tryConf) {return;}
		CONF = tryConf;
		showConfigFileInfo();
	}

//	------------------------------------------------------------------
//	Main simulation routine initiated with START button
//	------------------------------------------------------------------
	function simulate() {
		useEditorContent();
		initdateandtime();

//		Set up and clear canvas
		canvas = document.getElementById('drawing');
		ctx = canvas.getContext("2d");
		if (!ctx) {return false;}
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);

//		Crosshair (auxiliary)
		crosshair(ctx);

//		Projection Surface
		PRO = {xMin: CONF.area[0], xMax: CONF.area[1], yMin: CONF.area[2], yMax: CONF.area[3], z: CONF.shadowlevel};
		polyClip = {
			regions: [
				[ [PRO.xMin,PRO.yMin],[PRO.xMin,PRO.yMax],[PRO.xMax,PRO.yMax],[PRO.xMax,PRO.yMin] ]
			],
			inverted: false
		};
//		Shadow generating objects (surfaces)
		SGO = shadowGenerators();

/*		console.log('simulate - PRO:', PRO);
		console.log('simulate - polyClip:', polyClip);
		console.log('simulate - SGO:', SGO);
*/
//		Scaling
		calculateScaling(ctx);

//		Activate range sliders for date and time
		dialsetup();

		simulateworker();

		return;
	}
		
	function simulateworker() {
		if (!PRO) {return;}
		simulateerase();

//		Calculation of shadows
		var solpos = SunCalc.getPosition(currenttime, CONF['latitude'], CONF['longitude']);
		document.getElementById('azim').innerHTML = rad2deg(solpos.azimuth).toFixed(2) + '° Azimuth';
		document.getElementById('alti').innerHTML = rad2deg(solpos.altitude).toFixed(2) + '° Altitude';
		document.getElementById('cota').innerHTML = (1/Math.tan(solpos.altitude)).toFixed(2) + ' cot(Alt)';
		var azimuthDir = solpos.azimuth - Math.PI * CONF['direction'] / 180.;
//		console.log('simulateworker - azimuthDir, solpos, ... Grad;', azimuthDir, solpos, rad2deg(azimuthDir), rad2deg(solpos.azimuth), rad2deg(solpos.altitude));

//		Calculation only if sun is above horizon
		if (solpos.altitude >= CONF['lowsun'] * Math.PI / 180.) {
			var polyOld = {regions: [[]], inverted: false};
			for (let SE in SGO) {
				let polyNew = polyProject(SGO[SE].coord, azimuthDir, solpos.altitude, CONF['shadowlevel']);
//				console.log('simulateworker - SE, polyNew:', SE, polyNew);
				polyOld = polyUnion(polyOld, polyNew);
//			console.log('simulateworker - polyOld:', polyOld);
			}
			var result = polyIntersect(polyOld, polyClip);
//			console.log('simulateworker - result:', result);
			canvasPoly(ctx, result, '#666', '#700')
		}
		
//		Setup drawing on top
		drawSetup(ctx, solpos);
	}

//	Deactivate simulation (e.g. after new config data)
	function simulatestop() {
		PRO = false;
		dialclear();
	}

//	Erase canvas
	function simulateerase() {
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.restore();
	}

//	------------------------------------------------------------------
//	Date and Time handling
//	------------------------------------------------------------------
//	Format datetime object like {datestring: 'YYYY-MM-DD', timestring: 'hh:mm:ss'}
	function dt2show(date) {
		if (!date || date === "") {
			date = new Date();
		} else if (typeof('date') !== 'object') {
			date = new Date(Date.parse(date));
		}
		if (date) {
			return {datestring: date.toLocaleDateString('en-CA', {year: "numeric", month: "2-digit", day: "2-digit"}), timestring: date.toLocaleTimeString('de-DE', {hour: "2-digit", minute: "2-digit", hour12: false})};
		} else {
			return false;
		}
	}

//	Use currenttime (date object) and write to date and time input fields
	function initdateandtime() {
		if (!currenttime) {currenttime = new Date();}
		charshow();
		dialsetup();
		dialshow();
	}

//	Copy character fields to range inputs and update currenttime
	function inputChar2Range() {
		currenttime = new Date(Date.parse(document.getElementById('dateC').value + ' ' + document.getElementById('timeC').value));
		dialshow();
	}

//	Copy range to character fields inputs and update currenttime
	function inputRange2Char() {
		const curyear = parseInt(currenttime.getFullYear());
		const days = parseInt(document.getElementById('dateR').value);
		const mins = parseInt(document.getElementById('timeR').value);
		currenttime = dial2date(curyear, days, 0, mins, 0);
		charshow();
	}

//	Set input fields from currenttime
	function charshow() {
		const dt = dt2show(currenttime);
		document.getElementById('dateC').value = dt.datestring;
		document.getElementById('timeC').value = dt.timestring;
		document.getElementById('levelC').value = CONF['shadowlevel'];
	}

//	Initialize range sliders for date and time
	function dialsetup() {
		let x = document.getElementsByClassName('daytimedial');
		for (let i=0, LL=x.length; i<LL; i++) {
			x[i].style.visibility = 'visible';
		}
		const dd = document.getElementById('dateR');
		dd.min = 1;
		dd.max = isLeapYear(currenttime.getFullYear()) ? 366 : 365;
		dd.step = 1;
		const tt = document.getElementById('timeR');
		tt.min = 0;
		tt.max = 24*60 - 1;
		tt.step = 1;
		const zz = document.getElementById('levelR');
		const zrange = getCoordinateRange(['draw', 'shadow']);
		zz.min = 0;
		zz.max = zrange.zmax;
		zz.step = calculateSliderStep(zrange.zmin, zrange.zmax, 500);
	}

//	Deactivate range sliders
	function dialclear() {
		let x = document.getElementsByClassName('daytimedial');
		for (let i=0, LL=x.length; i<LL; i++) {
			x[i].style.visibility = 'hidden';
		}
	}

//	Calculate step of range slider based on possible min and max values and max allowed grids
	function calculateSliderStep(xmin, xmax, maxstep) {
		var delta = Math.abs(xmax-xmin);
		if (delta < 1e-10) {delta = Math.max(Math.abs(xmax), Math.abs(xmin));}
		var stepexpo = Math.floor(Math.log10(maxstep/delta));
		if (stepexpo == 0) {return 1;}
		var step = 1;
		if (stepexpo > 0) {
			var q = 0.1;
		} else {
			var q = 10;
			stepexpo = -stepexpo;
		}
		for (let i=0; i<stepexpo; i++) {
			step = step * q;
		}
		return step;
	}

//	Set dial values from currenttime
	function dialshow() {
		document.getElementById('dateR').value = dayOfYear(currenttime);
		document.getElementById('timeR').value = param2minute(currenttime);
		document.getElementById('levelR').value = CONF['shadowlevel'];
	}

//	Change date and time by using input fields (triggered by input field)
	function setdatetime() {
		inputChar2Range();
		simulateworker();
	}

//	Change date or time by using range sliders (triggered by range sliders)
	function dialdatetime() {
		inputRange2Char();
		simulateworker();
	}

//	Change shadowlevel by using input field (=trigger)
	function setshadowlevel() {
		CONF['shadowlevel'] = document.getElementById('levelC').value;
		document.getElementById('levelR').value = CONF['shadowlevel'];
		simulateworker();
	}

// Change shadowlevel by using range slider (=trigger)
	function dialshadowlevel() {
		CONF['shadowlevel'] = document.getElementById('levelR').value;
		document.getElementById('levelC').value = CONF['shadowlevel'];
		simulateworker();
	}

//	Operate spin buttons for input dials
	function spinbuttonclick(dialID, direction) {
		var dial = document.getElementById(dialID);
		const dmin = parseInt(dial.min);
		const dmax = parseInt(dial.max);
		const dstep = parseInt(dial.step);
		const dvalue = parseInt(dial.value);
		switch(direction) {
			case '+':
				if (dvalue + dstep <= dmax) {
					dial.value = dvalue + dstep;
				}
				break;
			case '-':
				if (dvalue - dstep >= dmin) {
					dial.value = dvalue - dstep;
				}
				break;
		}
		switch(dialID) {
			case 'dateR':
			case 'timeR':
				dialdatetime();
				break;
			case 'levelR':
				dialshadowlevel();
				break;
		}
	}

//	Get full minutes since midnight from date object
	function param2minute(datetime) {
		return datetime.getHours() * 60 + datetime.getMinutes();
	}

//	Create date object using days of the year
	function dial2date(year, dayofyear, hours, minutes, seconds) {
		var result = new Date(year,0,0);
		result.setDate(result.getDate() + dayofyear);
		return new Date(result.getTime() + ((hours*60 + minutes)*60 + seconds)*1000);
	}

//	Leap year
	function isLeapYear(year) {
		 return year % 400 === 0 || (year % 100 !== 0 && year % 4 === 0);
	}

//	Day of year
//	Source:
//	https://stackoverflow.com/questions/8619879/javascript-calculate-the-day-of-the-year-1-366

	function dayOfYear(date){
		return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 24 / 60 / 60 / 1000;
	}

//	------------------------------------------------------------------
//	Canvas operations
//	------------------------------------------------------------------
//	Scaling of canvas
	function calculateScaling(ctx) {
		var factorX, factorY;
		var XX = new minmaxTracker();
		var YY = new minmaxTracker();

		for (let i=0, LL=CONF.data.length; i<LL; i++) {
			if (CONF.data[i].draw) {
				switch (CONF.data[i].type) {
					case 'cuboid':
						XX.check(CONF.data[i].param.xmin);
						XX.check(CONF.data[i].param.xmax);
						YY.check(CONF.data[i].param.ymin);
						YY.check(CONF.data[i].param.ymax);
						break;
					case 'poly':
						for (let j=0, KK=CONF.data[i].data.length; j<KK; j++) {
							XX.check(CONF.data[i].data[j][0]);
							YY.check(CONF.data[i].data[j][1]);
						}
						break;
				}
			}
		}

		XX.forceframe(0.05, 10);
		YY.forceframe(0.05, 10);

		factorX = ctx.canvas.width /(XX.max()-XX.min());
		if (CONF.equiscale) {
			ctx.canvas.height = ctx.canvas.width * Math.abs((YY.min()-YY.max()) / (XX.max()-XX.min()));
		}
		factorY = ctx.canvas.height /(YY.min()-YY.max());

		ctx.setTransform(factorX, 0, 0, factorY, - XX.min()*factorX, -YY.max()*factorY);
//		console.log('calculateScaling2 - factorX, factorY:', factorX, factorY);
//		console.log('calculateScaling2 - transform:', ctx.getTransform());
	}

//	Crosshair
	function crosshair(ctx, posX=0.5, posY=0.5, fillStyle='#777', strokeStyle='#777', lineWidth=1, lineDash=[]) {
		posX = calculateInsidePosition(posX, ctx.canvas.width);
		posY = calculateInsidePosition(posY, ctx.canvas.height);

//		console.log('crosshair - ctx, posX, posY, fillStyle, strokeStyle, lineWidth, lineDash:', ctx, posX, posY, fillStyle, strokeStyle, lineWidth, lineDash);

		if (posX !== false && posY !== false) {
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.fillStyle = fillStyle;
			ctx.strokeStyle = strokeStyle;
			ctx.lineWidth = lineWidth;
			ctx.setLineDash(lineDash);
			ctx.beginPath();
			ctx.moveTo(0, posY);
			ctx.lineTo(ctx.canvas.width, posY);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(posX, 0);
			ctx.lineTo(posX, ctx.canvas.height);
			ctx.stroke();
			ctx.restore();
		}
	}

//	Calculate position within 0 ... max, may be fraction or absolute
	function calculateInsidePosition(part, whole) {
		if (part < 0) {return false;}
		if (part <= 1) {part  = Math.round(part * whole);}
		return part > whole ? false : Math.round(part);
	}

//	Draw elements of architecture (walls, ceiling), sunblind, compass rose, sun direction
	function drawSetup(ctx, solpos) {
		const data = CONF.data;
		for (let i=0, ll=data.length; i<ll; i++) {
			if (!data[i].draw === false) {
				switch (data[i].style) {
					case 'wall':
						drawElement(ctx, data[i], 
						Object.assign({fillStyle: '#770077'}, data[i].format));
						break;
					case 'canopy':
						drawElement(ctx, data[i], 
						Object.assign({strokeStyle: '#000077', lineWidth: 10, setLineDash: []}, data[i].format));
						break;
					case 'fabric':
						drawElement(ctx, data[i], 
						Object.assign({strokeStyle: '#007700', lineWidth: 10, setLineDash: [50, 50]}, data[i].format));
						break;
					case 'vertical':
						let lim = polyLimits(data[i]['data']);
						ctx.save();
						ctx.lineWidth = 25;
						ctx.strokeStyle = '#777700';
						ctx.beginPath();
						ctx.moveTo(lim.xmin, lim.ymin);
						ctx.lineTo(lim.xmax, lim.ymax);
						ctx.stroke();
						ctx.restore();
						break;
					case 'draw':
						drawElement(ctx, data[i], data[i].format);
						break;
				}
			}
		}
//		Compass rose
		const svgCompassrose = getSVGsource('compassrose');
		svg4canvas(ctx, svgCompassrose, {angle: normgrad(-CONF['direction'])}, 300, 200, 'CM');
//		Sun direction
		if (solpos) {
			const svgSunArrow = getSVGsource('arrow1');
			svg4canvas(ctx, svgSunArrow, {
				angle: normgrad(180.+rad2deg(solpos.azimuth)-CONF['direction']),
				color: '#e6c000df'
			}, 300, 200, 'CM', 150, 150);
		}
	}

//	Draw configuration element
	function drawElement(ctx, data, format) {
		ctx.save();
		for (var key in format) {
			if (format.hasOwnProperty(key)) {
//				console.log('drawElement - key, format:', key, format[key]);
				if (key == 'setLineDash') {ctx.setLineDash(format[key]); continue;}
				ctx[key] = format[key];
			}
		}

//		console.log('drawElement - ctx:', ctx);
		switch (data.type) {
			case 'cuboid':
				if (format.strokeStyle) {
					ctx.strokeRect(data.param.xmin, data.param.ymin, (data.param.xmax - data.param.xmin), (data.param.ymax - data.param.ymin));
				}
				if (format.fillStyle) {
					ctx.fillRect(data.param.xmin, data.param.ymin, (data.param.xmax - data.param.xmin), (data.param.ymax - data.param.ymin));
				}
				break;
			case 'poly':
				ctx.beginPath();
				for (let i=0, LL=data.data.length; i<LL; i++) {
					if (i == 0) {
						ctx.moveTo(data.data[i][0], data.data[i][1]);
					} else {
						ctx.lineTo(data.data[i][0], data.data[i][1]);
					}
				}
				ctx.closePath();
				if (format.strokeStyle) {ctx.stroke();}
				if (format.fillStyle) {ctx.fill();}
				break;
		}
		ctx.restore();
	}

//	Draw polygon(s) on canvas
	function canvasPoly(ctx, poly, fillcolor, strokecolor) {
//		console.log('canvasPoly - ctx at begin, poly, fillcolor, strokecolor:', ctx, poly, fillcolor, strokecolor);
		ctx.save();
		for (let i=0, lr=poly.regions.length; i<lr; i++) {
			let pp = poly.regions[i];
			ctx.setLineDash([]);
			if (fillcolor) {ctx.fillStyle = cycleselect(i, fillcolor);}
			if (strokecolor) {ctx.strokeStyle = cycleselect(i, strokecolor);}
			ctx.beginPath();
			for (let j=0, lp=pp.length; j<lp; j++) {
				if (j == 0) {
					ctx.moveTo(pp[j][0], pp[j][1]);
				} else {
					ctx.lineTo(pp[j][0], pp[j][1]);
				}
			}
			ctx.closePath();
			if (fillcolor) {ctx.fill();}
			if (strokecolor) {ctx.stroke();}
		}
//		console.log('canvasPoly - ctx at end:', ctx);
		ctx.restore();
	}

//	------------------------------------------------------------------
//	SVG handling
//	------------------------------------------------------------------
//	Deliver svg image sources
	function getSVGsource(name) {
		switch (name) {
			case 'compassrose':
				return `
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="100px" height="100px" viewBox="0 0 100 100" enable-background="new 0 0 100 100" xml:space="preserve">
<g transform="rotate(###angle###, 50, 50)">
<polygon fill="#FFF" points="76,24 57,50 76,76 50,57 24,76 43,50 24,24 50,43 "/>
<polygon fill="#39F" fill-opacity="0.25" stroke="#000" stroke-width="0.5" stroke-linejoin="round" stroke-miterlimit="10" points="76,24 57,50 76,76 50,57 24,76 43,50 24,24 50,43 "/>
<polygon fill="#39F" stroke="#000" stroke-width="0.25" stroke-miterlimit="10" points="24,24 76,76 57,50 43,50 "/>
<polygon fill="#39F" stroke="#000" stroke-width="0.25" stroke-miterlimit="10" points="76,24 24,76 50,57 50,43 "/>
<polygon fill="#FFF" points="50,12.5 58,42 87.5,50 58,58 50,87.5 42,58 12.5,50 42,42 "/>
<polygon fill="#03C" fill-opacity="0.1" stroke="#000" stroke-width="0.5" stroke-linejoin="round" stroke-miterlimit="10" points="50,12.5 58,42 87.5,50 58,58 50,87.5 42,58 12.5,50 42,42 "/>
<polygon fill="#03C" stroke="#000" stroke-width="0.25" stroke-linejoin="round" stroke-miterlimit="10" points="50,12.5 50,87.5 58,58 42,42 "/>
<polygon fill="#03C" stroke="#000" stroke-width="0.25" stroke-linejoin="round" stroke-miterlimit="10" points="12.5,50 87.5,50 58,42 42,58 "/>
<text transform="matrix(1 0 0 1 45 12)" style="fill: #03C; font-weight: bold; font-size: 14px;">N</text>
</g>
</svg>
				`;
			case 'arrow1':
				return `
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200" viewBox="-100 -100 200 200">
<g transform="rotate(###angle###,0,0)">
<path d="M0 0 L-20 -30 L20 -30 Z" fill="###color###" />
<line x1="0" y1="-29" x2="0" y2="-90" style="stroke: ###color###; stroke-width: 10" />
</g>
</svg>
				`;
		}
		return false;
	}

//	URL encode of svg source
//	found under: https://bl.ocks.org/jennyknuth/222825e315d45a738ed9d6e04c7a88d0
//	source: https://gist.github.com/jennyknuth/222825e315d45a738ed9d6e04c7a88d0
	function svgEncode(svgString) {
		return svgString.replace('<svg',(~svgString.indexOf('xmlns')?'<svg':'<svg xmlns="http://www.w3.org/2000/svg"'))
//
//   Encode (may need a few extra replacements)
//
		.replace(/"/g, '\'')
		.replace(/%/g, '%25')
		.replace(/#/g, '%23')       
		.replace(/{/g, '%7B')
		.replace(/}/g, '%7D')         
		.replace(/</g, '%3C')
		.replace(/>/g, '%3E')
		.replace(/\s+/g,' ');
	}

//	Build variable svg into canvas with original pixel scaling
	function svg4canvas(ctx, svgSource, svgParams, posX, posY, posMode, width=0, height=0, svgEscape='###') {
		var img = new Image();
		img.onload = function() {
			var xOff = yOff = 0;
//			console.log('svg4canvas: img:', img.width, img.height);
			if (width <= 0) {width = img.width;}
			if (height <= 0) {height = img.height;}
			posMode = posMode.toUpperCase();
			switch (posMode[0]) {
				case 'R': xOff = width; break;
				case 'C': xOff = width / 2.; break;
			}
			switch (posMode[1]) {
				case 'B': yOff = height; break;
				case 'M': yOff = height / 2.; break;
			}
//			console.log('svg4canvas: posX-xOff, posY-yOff:', posX-xOff, posY-yOff);
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.drawImage(img, posX-xOff, posY-yOff, width, height);
			ctx.restore();
		}
		for (let vari in svgParams) {
			pattern = new RegExp(svgEscape+vari+svgEscape, 'g');
			svgSource = svgSource.replace(pattern, svgParams[vari]);
		}
//		console.log('svg4canvas - svgSource:', svgSource);
		img.src = 'data:image/svg+xml;utf8,' + svgEncode(svgSource);
	}

//	------------------------------------------------------------------
//	Polynom operations (based on PolyBool)
//	------------------------------------------------------------------
//	Calculate min and max values of all coordinates
	function getCoordinateRange(select) {
		
		
		var XX = new minmaxTracker();
		var YY = new minmaxTracker();
		var ZZ = new minmaxTracker();

		for (let i=0, LL=CONF.data.length; i<LL; i++) {
			if ((select.includes('draw') && CONF.data[i].draw) || (select.includes('shadow') && CONF.data[i].shadow)) {
				switch (CONF.data[i].type) {
					case 'cuboid':
						XX.check(CONF.data[i].param.xmin);
						XX.check(CONF.data[i].param.xmax);
						YY.check(CONF.data[i].param.ymin);
						YY.check(CONF.data[i].param.ymax);
						ZZ.check(CONF.data[i].param.bottom);
						ZZ.check(CONF.data[i].param.top);
						break;
					case 'poly':
						for (let j=0, KK=CONF.data[i].data.length; j<KK; j++) {
							XX.check(CONF.data[i].data[j][0]);
							YY.check(CONF.data[i].data[j][1]);
							ZZ.check(CONF.data[i].data[j][2]);
						}
						break;
				}
			}
		}
		
		return {xmin: XX.min(), xmax: XX.max(), ymin: YY.min(), ymax: YY.max(), zmin: ZZ.min(), zmax: ZZ.max()};
	}

//	Build shadow generating objects SGO
	function shadowGenerators() {
		var out = [];
		var data = CONF.data;
		for (let i=0, ll=data.length; i<ll; i++) {
			if (!data[i].shadow === false) {
				switch (data[i].type) {
					case 'poly':
						out.push({title: data[i].title, coord: data[i].data});
						break;
					case 'cuboid':
						out.push({title: data[i].title + '-A', 
						coord: [
							[data[i].param.xmin, data[i].param.ymin, data[i].param.bottom],
							[data[i].param.xmax, data[i].param.ymin, data[i].param.bottom],
							[data[i].param.xmax, data[i].param.ymax, data[i].param.bottom],
							[data[i].param.xmin, data[i].param.ymax, data[i].param.bottom]
						]});
						out.push({title: data[i].title + '-B', 
						coord: [
							[data[i].param.xmin, data[i].param.ymax, data[i].param.top],
							[data[i].param.xmax, data[i].param.ymax, data[i].param.top],
							[data[i].param.xmax, data[i].param.ymin, data[i].param.top],
							[data[i].param.xmin, data[i].param.ymin, data[i].param.top]
						]});
						out.push({title: data[i].title + '-C', 
						coord: [
							[data[i].param.xmin, data[i].param.ymin, data[i].param.bottom],
							[data[i].param.xmin, data[i].param.ymax, data[i].param.bottom],
							[data[i].param.xmin, data[i].param.ymax, data[i].param.top],
							[data[i].param.xmin, data[i].param.ymin, data[i].param.top]
						]});
						out.push({title: data[i].title + '-D', 
						coord: [
							[data[i].param.xmax, data[i].param.ymin, data[i].param.bottom],
							[data[i].param.xmax, data[i].param.ymax, data[i].param.bottom],
							[data[i].param.xmax, data[i].param.ymax, data[i].param.top],
							[data[i].param.xmax, data[i].param.ymin, data[i].param.top]
						]});
						out.push({title: data[i].title + '-E', 
						coord: [
							[data[i].param.xmin, data[i].param.ymin, data[i].param.bottom],
							[data[i].param.xmax, data[i].param.ymin, data[i].param.bottom],
							[data[i].param.xmax, data[i].param.ymin, data[i].param.top],
							[data[i].param.xmin, data[i].param.ymin, data[i].param.top]
						]});
						out.push({title: data[i].title + '-F', 
						coord: [
							[data[i].param.xmax, data[i].param.ymax, data[i].param.bottom],
							[data[i].param.xmin, data[i].param.ymax, data[i].param.bottom],
							[data[i].param.xmin, data[i].param.ymax, data[i].param.top],
							[data[i].param.xmax, data[i].param.ymax, data[i].param.top]
						]});
						break
				}
			}
		}
//		console.log('shadowGenerators - SGO:', out);
		return out;
	}

//	Calculate min and max of coordinates of polynom
	function polyLimits(data) {
		var XX = new minmaxTracker();
		var YY = new minmaxTracker();
		var ZZ = new minmaxTracker();
		for (let i=0, LL=data.length; i<LL; i++) {
			XX.check(data[i][0]);
			YY.check(data[i][1]);
			ZZ.check(data[i][2]);
		}
		return {xmin: XX.min(), xmax: XX.max(), ymin: YY.min(), ymax: YY.max(), zmin: ZZ.min(), zmax: ZZ.max()};
	}

//	Projection of shadow at z-level (azimuth and altitude in radians)
	function polyProject(shadow, azimuth, altitude, zLevel) {
//		console.log('polyProject - shadow, azimuth, altitude, zLevel:', shadow, azimuth, altitude, zLevel);
		var out = [];
		shadow = clipUnderground(shadow, zLevel);
		for (let i=0, ls=shadow.length; i<ls; i++) {
//			console.log('polyProject - shadow[i]:', shadow[i]);
			out.push(projectZlevel(shadow[i], azimuth, altitude, zLevel));
		}
		return {regions: [out], inverted: false};
	}

//	Eliminate shadow corners below z-level
	function clipUnderground(corners, zLevel) {
		var out = [];
		var lc = corners.length;
		var oldCoord = corners[lc-1];
		var oldOver = oldCoord[2] >= zLevel 
		for (let i=0; i<lc; i++) {
			let newCoord = corners[i];
			let newOver = newCoord[2] >= zLevel;
			if (newOver) {
				if (oldOver) {
					out.push(newCoord);
				} else {
					out.push(intersectZ(oldCoord, newCoord, zLevel));
					out.push(newCoord);
				}
			} else {
				if (oldOver) {
					out.push(intersectZ(oldCoord, newCoord, zLevel));
				}
			}
			oldOver = newOver;
			oldCoord = newCoord;
		}

/*		if (corners.equals(out)) {
			console.log('clipUnderground - unchanged');
		} else {
			console.log('clipUnderground - zLevel, corners, out:', zLevel, corners, out);
		}
*/
		return out;
	}

//	Projection of a 3D point onto z-level
	function projectZlevel(point, azim, alti, zLevel) {
		let r = Math.abs((point[2] - zLevel) / Math.tan(alti));
//		console.log('projectZlevel - point, azim, alti, zLevel:', point, azim, alti, zLevel);
//		console.log('projectZlevel - r, x2, y2:', r, point[0] + r * Math.sin(azim), point[1] + r * Math.cos(azim));
		return [point[0] + r * Math.sin(azim), point[1] + r * Math.cos(azim)];
	}

//	Calculate intersection of line A-B with plane at level Z
	function intersectZ(A, B, Z) {
		return [A[0] + (Z-B[2]) * (B[0]-A[0]) / (B[2]-A[2]), 
			A[1] + (Z-B[2]) * (B[1]-A[1]) / (B[2]-A[2]), 
			Z];
	}

//	polygon union
	function polyUnion(A, B) {
//		console.log('polyUnion - A:', A);
//		console.log('polyUnion - B:', B);
		var C = PolyBool.union(A, B);
//		console.log('polyUnion - C:', C);
		return C;
	}

//	polygon intersect
	function polyIntersect(A, B) {
//		console.log('polyIntersect - A:', A);
//		console.log('polyIntersect - B:', B);
		var C = PolyBool.intersect(A, B);
//		console.log('polyIntersect - C:', C);
		return C;
	}

//	------------------------------------------------------------------
//	General functions
//	------------------------------------------------------------------
//	Convert radian to degrees
	function rad2deg(radians) {
		return 180. * radians / Math.PI;
	}

//	Normalize angle degress (0 <= angle < 360 or -180 < angle <= 180) and convert to rad (optional)
	function normgrad(angle, radian=false, symmetric=false) {
		if (symmetric) {
			while (angle > 180.) {angle -= 360.;}
			while (angle <= -180.) {angle += 360.;}
		} else {
			while (angle >= 360.) {angle -= 360.;}
			while (angle < 0.) {angle += 360.;}
		}
		if (radian) {angle = Math.PI * angle / 180.}
		return angle;
	}

//	Deliver cyclic values from array or same from skalar
	function cycleselect(i, value) {
		if (value) {
			if (value.constructor === Array) {
				return value[i % value.length];
			} else {
				return value;
			}
		} else {
			return false;
		}
	}

//	Class definition for calculating min and max of series of values
	class minmaxTracker {
		constructor() {
			this.minvalue = null;
			this.maxvalue = null;
		}
		check(currentvalue) {
			if (this.minvalue == null || currentvalue < this.minvalue) {
				this.minvalue = currentvalue;
			}
			if (this.maxvalue == null || currentvalue > this.maxvalue) {
				this.maxvalue = currentvalue;
			}
		}
		relframe(portion) {
			this.fixframe(Math.max(Math.abs(portion*this.minvalue), Math.abs(portion*this.maxvalue)));
		}
		forceframe(portion, minframe) {
			this.fixframe(Math.max(Math.abs(portion*this.minvalue), Math.abs(portion*this.maxvalue), minframe));
		}
		fixframe(border) {
			this.minvalue -= border;
			this.maxvalue += border;
		}
		min() {
			return this.minvalue;
		}
		max() {
			return this.maxvalue;
		}
	}

//	Array compare
//	Source:
//	https://stackoverflow.com/questions/7837456/how-to-compare-arrays-in-javascript
//
//	Warn if overriding existing method
	if (Array.prototype.equals) {
		console.warn("Overriding existing Array.prototype.equals. Possible causes: New API defines the method, there's a framework conflict or you've got double inclusions in your code.");
	}
//	attach the .equals method to Array's prototype to call it on any array
	Array.prototype.equals = function (array) {
//		if the other array is a falsy value, return
		if (!array) {return false;}
//		compare lengths - can save a lot of time
		if (this.length != array.length) {return false;}

		for (var i = 0, l=this.length; i < l; i++) {
//			Check if we have nested arrays
			if (this[i] instanceof Array && array[i] instanceof Array) {
//				recurse into the nested arrays
				if (!this[i].equals(array[i])) {return false;}
//				Warning - two different object instances will never be equal: {x:20} != {x:20}
			} else if (this[i] != array[i]) {return false; }
			
		}
		return true;
	}
//	Hide method from for-in loops
	Object.defineProperty(Array.prototype, "equals", {enumerable: false});
