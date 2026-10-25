/**
 * Lesson 5 · Water-area time series and trend
 * --------------------------------------------
 * Goal: track the open-water area of a lake every 8 days since 2000 with
 * MODIS, and fit a linear trend.
 *
 * You will learn: computing an area per image, building a time series
 * FeatureCollection, ui.Chart with a trendline, and a simple linear fit.
 *
 * Course: Earth Engine for water resources · Parisa Abbasalizadehrezaei
 * https://github.com/RisaRezaei/gee-water-resources-course · MIT License
 */

var lake = ee.Geometry.Rectangle([44.95, 37.05, 46.05, 38.30]);   // Lake Urmia
Map.centerObject(lake, 8);

// Water = MNDWI (green, SWIR) > 0 on clear pixels.
function waterArea(img) {
  var clear = img.select('StateQA').bitwiseAnd(3).eq(0);
  var water = img.normalizedDifference(['sur_refl_b04', 'sur_refl_b06']).gt(0).updateMask(clear);
  var km2 = ee.Image.pixelArea().divide(1e6);
  // Band 1: water area; band 2: all clear area (water + land).
  var sums = ee.Image.cat([km2.updateMask(water), km2.updateMask(water.mask())])
    .rename(['water', 'clear'])
    .reduceRegion({reducer: ee.Reducer.sum(), geometry: lake, scale: 500, maxPixels: 1e10});
  var boxKm2 = lake.area(100).divide(1e6);
  return ee.Feature(null, {
    't': img.get('system:time_start'),
    'water_km2': sums.get('water'),
    'clear_frac': ee.Number(sums.get('clear')).divide(boxKm2)   // drop cloudy dates later
  });
}

var series = ee.ImageCollection('MODIS/061/MOD09A1')
  .filterDate('2000-01-01', '2025-01-01')
  .filterBounds(lake)
  .map(waterArea);

var good = ee.FeatureCollection(series).filter(ee.Filter.gt('clear_frac', 0.9));

print(ui.Chart.feature.byFeature(good, 't', 'water_km2').setOptions({
  title: 'Lake Urmia open-water area (MODIS 8-day, clear dates only)',
  hAxis: {title: 'Year', format: 'yyyy'}, vAxis: {title: 'km²'},
  pointSize: 2, lineWidth: 0, colors: ['1e88e5'],
  trendlines: {0: {color: 'e53935', lineWidth: 2, showR2: true, visibleInLegend: true}}
}));

// Linear trend in km² per year.
var fit = good.map(function (f) {
  return f.set('year', ee.Number(f.get('t')).divide(365.25 * 24 * 3600 * 1000).add(1970));
}).reduceColumns(ee.Reducer.linearFit(), ['year', 'water_km2']);
print('Trend (km² per year)', fit.get('scale'));

Export.table.toDrive({
  collection: good, description: 'lesson5_water_area',
  fileFormat: 'CSV', selectors: ['t', 'water_km2', 'clear_frac']
});

// Exercise: repeat with summer dates only (ee.Filter.calendarRange on the
// image collection) to remove the seasonal cycle.
