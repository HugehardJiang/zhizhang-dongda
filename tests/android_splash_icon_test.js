const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const res = path.resolve(__dirname, '../android/app/src/main/res');
const read = file => fs.readFileSync(path.join(res, file), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const attribute = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
const dimension = value => {assert.match(value, /^\d+(?:\.\d+)?dp$/); return parseFloat(value);};
const layer = read('drawable/ic_splash.xml');
assert.match(layer, /<layer-list\b/, 'splash must use its own non-adaptive drawable');
const canvas = layer.match(/<size\b[^>]*>/)?.[0];
const canvasWidth = dimension(attribute(canvas, 'android:width'));
const canvasHeight = dimension(attribute(canvas, 'android:height'));
assert.equal(canvasWidth, 288); assert.equal(canvasHeight, 288);
assert.match(layer, /<solid\s+android:color="@android:color\/transparent"/, 'outer canvas remains transparent');
const bitmapTag = layer.match(/<bitmap\b[^>]*>/)?.[0];
assert.equal(attribute(bitmapTag, 'android:src'), '@drawable/ic_app_foreground', 'preserve the original PNG artwork');
assert.equal(attribute(bitmapTag, 'android:gravity'), 'fill');
assert.equal(attribute(bitmapTag, 'android:filter'), 'true');
assert.equal(attribute(bitmapTag, 'android:tint'), undefined, 'artwork retains its original colors');
const bitmapItem = layer.slice(0, layer.indexOf('<bitmap')).match(/<item\b[^>]*>/g).at(-1);
const maskItem = layer.match(/<item\b[^>]*android:drawable="@drawable\/ic_splash_corner_mask"[^>]*>/)?.[0];
for (const item of [bitmapItem, maskItem]) {
  assert.equal(attribute(item, 'android:gravity'), 'center');
  assert.equal(dimension(attribute(item, 'android:width')), 156);
  assert.equal(dimension(attribute(item, 'android:height')), 156);
}
const vector = read('drawable/ic_splash_corner_mask.xml');
const vectorTag = vector.match(/<vector\b[^>]*>/)?.[0];
const width = Number(attribute(vectorTag, 'android:viewportWidth'));
const height = Number(attribute(vectorTag, 'android:viewportHeight'));
assert.equal(dimension(attribute(vectorTag, 'android:width')), width);
assert.equal(dimension(attribute(vectorTag, 'android:height')), height);
assert.equal(width, 156); assert.equal(height, 156);
const mask = vector.match(/<path\b[^>]*>/)?.[0];
assert.equal(attribute(mask, 'android:fillType'), 'evenOdd', 'rounded center is a hole in the corner cover');
assert.equal(attribute(mask, 'android:fillColor'), '@color/native_background');

// Parse the actual vector's absolute path and sample each circular arc. This
// tests the visible hole's safe area independently of an asserted path string.
const tokens = attribute(mask, 'android:pathData').match(/[A-Za-z]|[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g);
let cursor = 0, point = [0, 0], start, contour;
const contours = [], arcs = [];
const number = () => {const n = Number(tokens[cursor++]); assert(Number.isFinite(n)); return n;};
while (cursor < tokens.length) {
  const command = tokens[cursor++];
  if (command === 'M') {
    point = [number(), number()]; start = [...point]; contour = [[...point]]; contours.push(contour);
  } else if (command === 'H' || command === 'V') {
    point = command === 'H' ? [number(), point[1]] : [point[0], number()]; contour.push([...point]);
  } else if (command === 'A') {
    const rx = number(), ry = number(), rotation = number(), large = number(), sweep = number();
    const end = [number(), number()];
    assert.equal(rx, ry, 'corner arcs must be circular'); assert.equal(rotation, 0);
    assert.equal(large, 0); assert.equal(sweep, 1);
    const dx = (point[0] - end[0]) / 2, dy = (point[1] - end[1]) / 2;
    const q = Math.sqrt(Math.max(0, (rx * rx - dx * dx - dy * dy) / (dx * dx + dy * dy)));
    const center = [(point[0] + end[0]) / 2 + q * dy, (point[1] + end[1]) / 2 - q * dx];
    const from = Math.atan2(point[1] - center[1], point[0] - center[0]);
    let angle = Math.atan2(end[1] - center[1], end[0] - center[0]) - from;
    if (angle < 0) angle += 2 * Math.PI;
    assert(Math.abs(angle - Math.PI / 2) < 1e-10, 'each rounded corner is a true quarter circle');
    arcs.push({radius: rx, center});
    for (let step = 1; step <= 1024; step++) {
      const theta = from + angle * step / 1024;
      contour.push([center[0] + rx * Math.cos(theta), center[1] + rx * Math.sin(theta)]);
    }
    point = end;
  } else if (command === 'Z') {contour.push([...start]); point = [...start];}
  else assert.fail(`unsupported vector command ${command}`);
}
assert.equal(contours.length, 2); assert.equal(arcs.length, 4);
assert(arcs.every(arc => arc.radius === 36));
const visibleBoundary = contours[1];
const safeRadius = canvasWidth / 3; // Android's documented 192 dp safe circle.
const maximumRadius = Math.max(...visibleBoundary.map(([x, y]) => Math.hypot(x - width / 2, y - height / 2)));
assert(maximumRadius + .5 < safeRadius, 'rounded artwork plus a half-dp antialias fringe stays inside the safe circle');
assert(maximumRadius > 95, 'safe-area check must measure the curved corners, not just straight-edge midpoints');
function inside(points, x, y) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [a, b] = points[i], [c, d] = points[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) result = !result;
  }
  return result;
}
const covered = (x, y) => contours.reduce((value, polygon) => value !== inside(polygon, x, y), false);
assert(!covered(width / 2, height / 2), 'central logo is untouched');
assert(!covered(width / 2, .5), 'straight top edge remains visible');
for (const [x, y] of [[.5, .5], [width - .5, .5], [.5, height - .5], [width - .5, height - .5]]) {
  assert(covered(x, y), 'all four sharp bitmap corners blend into the window');
}

function styles(xml) {
  return [...xml.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/g)].map(match => ({
    name: attribute(match[1], 'name'), parent: attribute(match[1], 'parent'),
    items: Object.fromEntries([...match[2].matchAll(/<item\s+name="([^"]+)">([^<]+)<\/item>/g)].map(item => [item[1], item[2].trim()]))
  }));
}
const day = styles(read('values-v31/themes.xml')).find(style => style.name === 'AppTheme');
const night = styles(read('values-night-v31/themes.xml')).find(style => style.name === 'AppTheme');
assert.deepEqual(day, night, 'API 31 splash resolves identically in day/night, with colors qualified separately');
assert.equal(day.parent, 'AppThemeBase');
assert.equal(day.items['android:windowSplashScreenBackground'], '@color/native_background');
assert.equal(day.items['android:windowSplashScreenAnimatedIcon'], '@drawable/ic_splash');
assert.equal(day.items['android:windowSplashScreenIconBackgroundColor'], '@android:color/transparent');
for (const [qualifier, parent, lightBars] of [['values', 'android:style/Theme.Material.Light.NoActionBar', 'true'], ['values-night', 'android:style/Theme.Material.NoActionBar', 'false']]) {
  const base = styles(read(`${qualifier}/themes.xml`)).find(style => style.name === 'AppThemeBase');
  assert.equal(base.parent, parent);
  assert.equal(base.items['android:windowLightStatusBar'], lightBars);
  assert.equal(base.items['android:windowLightNavigationBar'], lightBars);
  const background = read(`${qualifier}/colors.xml`).match(/<color name="native_background">([^<]+)<\/color>/)?.[1];
  assert.match(background, /^#[0-9a-f]{6}$/i, 'window and corner cover resolve one opaque background color');
}
assert.match(read('drawable-v26/ic_app.xml'), /<adaptive-icon\b/, 'launcher icon retains OEM adaptive shape support');
console.log(`android splash icon tests: PASS (visible radius ${maximumRadius.toFixed(2)} dp < ${safeRadius} dp)`);
