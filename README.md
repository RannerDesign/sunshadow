
sunshadow
=========

**sunshadow** is a complete application for the calculation of the shadow of objects depending on geoposition and date and time. A potential usage could be the simulation of the effects of a sunblind for the terrace of a building.

The configuration is completely described in a json file. Elements can be defined as cuboids (xmin, xmax, ymin, ymax, bottom, top) or polygons (tupels of [x, y, z]). Each element can be selectively switched on and off for shadow generation and drawing. All parameters of the configuration file are described in the **Help** page.

The result, consisting of the drawable elements and the generated shadow, is displayed on a canvas element of the webpage.

The content of the configuration can be edited in a textarea at the bottom of the page. The is syntax highlighting and checking available for the json file.


## Installation
* Prepare a webspace in a separated folder, per default named `sunshadow`
* Copy the following files into this folder:
	- `index.html`
	- `sunshadow.css`
	- `sunshadow.js`
	- `sunshadowHelp.html`
	- `sunshadowbackend.php`
	- `polybool.min.js`
* Create a subfolder `config`
* Copy file `cfg.Example.json` into this subfolder

Now you're ready to start the first program run by opening `http(s)://mydomain-or-subdomain/sunshadow`
You can try to open the configuration file named `Example` and see how it works.


## External packages used
The program logic is contained in the file `sunshadow.js`.
Additionally the following 3 packages are used via `<script>` tags in the HTML document.

#### ACE
[Website](https://ace.c9.io/)

High performance code editor with syntax highlighting and syntax checking.
The editor is used to display and edit the content of the configuration file in json format.
Syntax checking hopefully avoids errors which lead to nothing to be displayed.

#### suncalc
[GitHub](https://github.com/mourner/suncalc)

JavaScript library for calculating the sun position at a given date and time and geo coordinates.

The functionality used from this library is
```javascript
SunCalc.getPosition(currenttime, latitude, longitude)
```
which delivers `azimuth` and `altitude`.


#### polybooljs
[GitHub](https://github.com/velipso/polybooljs)

JavaScript library for performing boolean operations on polygons.
Functionality used from this library:
```javascript
PolyBool.union(A, B)
PolyBool.intersect(A, B)
```




