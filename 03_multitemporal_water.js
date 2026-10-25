/**
 * Lesson 3 · A multi-temporal water map
 * --------------------------------------
 * Goal: combine three Landsat epochs into one map that shows when each
 * pixel was last covered by water: 1985-1999, 2000-2012 or 2013-2024.
 *
 * You will learn: harmonising Landsat 5/7/8/9 band names, epoch composites,
 * and building a class map with where().
 *
 * Course: Earth Engine for water resources · Parisa Abbasalizadehrezaei
 * https://github.com/RisaRezaei/gee-water-resources-course · MIT License
 */

var aoi = ee.Geometry.Rectangle([44.95, 37.05, 46.05, 38.30]);   // Lake Urmia
Map.centerObject(aoi, 9);

// Same band names for every Landsat sensor.
var NAMES = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'];
function prep(bands) {
  return function (img) {
    var qa = img.select('QA_PIXEL');
    var clear = qa.bitwiseAnd(1 << 3).eq(0).and(qa.bitwiseAnd(1 << 4).eq(0));
    return img.select(bands, NAMES).multiply(0.0000275).add(-0.2).updateMask(clear)
      .copyProperties(img, ['system:time_start']);      // keep the date for filtering
  };
}
var L57 = ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7'];
var L89 = ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'];

// Filter first (fast), then apply the cloud mask to what is left.
function get(id, bands) {
  return ee.ImageCollection(id).filterBounds(aoi)
    .filter(ee.Filter.calendarRange(7, 9, 'month'))     // late summer only
    .map(prep(bands));
}
var landsat = get('LANDSAT/LT05/C02/T1_L2', L57)
  .merge(get('LANDSAT/LE07/C02/T1_L2', L57))
  .merge(get('LANDSAT/LC08/C02/T1_L2', L89))
  .merge(get('LANDSAT/LC09/C02/T1_L2', L89));

// Water in an epoch: median MNDWI > 0.
function epochWater(start, end) {
  return landsat.filterDate(start, end).median()
    .normalizedDifference(['green', 'swir1']).gt(0).clip(aoi);
}
var w1 = epochWater('1985-01-01', '2000-01-01');
var w2 = epochWater('2000-01-01', '2013-01-01');
var w3 = epochWater('2013-01-01', '2025-01-01');

// 0 = never water, 1 = last water in 1985-1999, 2 = in 2000-2012, 3 = in 2013-2024
var lastWater = ee.Image(0).clip(aoi)
  .where(w1, 1).where(w2, 2).where(w3, 3).rename('last_water');

Map.addLayer(lastWater.selfMask(),
  {min: 1, max: 3, palette: ['e53935', 'ffb300', '1e88e5']}, 'Last epoch with water');

// Area of each class in km2.
var areas = ee.Image.pixelArea().divide(1e6).addBands(lastWater).reduceRegion({
  reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'class'}),
  geometry: aoi, scale: 90, maxPixels: 1e13, tileScale: 4
});
print('Area per class (km²): 0 never, 1 lost after 1999, 2 lost after 2012, 3 water now', areas);

Export.image.toDrive({
  image: lastWater.toByte(), description: 'lesson3_last_water_epoch',
  region: aoi, scale: 30, crs: 'EPSG:4326', maxPixels: 1e13
});

// Exercise: add a fourth epoch (2020-2025). What happens to class 3?
