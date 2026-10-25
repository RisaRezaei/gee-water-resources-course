/**
 * Lesson 2 · How often is a pixel covered by water?
 * --------------------------------------------------
 * Goal: map surface-water frequency (% of clear observations classified as
 * water) for a coastal lagoon from 25 years of MODIS 8-day reflectance.
 *
 * You will learn: mapping a function over a collection, spectral indices
 * (NDWI), thresholds, and turning a stack of binary maps into a frequency map.
 *
 * Course: Earth Engine for water resources · Parisa Abbasalizadehrezaei
 * https://github.com/RisaRezaei/gee-water-resources-course · MIT License
 */

// Study area: Gorgan Bay and the Miankaleh peninsula (south-east Caspian Sea).
var aoi = ee.Geometry.Rectangle([53.26, 36.74, 54.11, 37.02]);
Map.centerObject(aoi, 10);

// NDWI (McFeeters) = (Green - NIR) / (Green + NIR); MODIS band 4 = green, band 2 = NIR.
function ndwi(img) {
  var good = img.select('StateQA').bitwiseAnd(3).eq(0);        // bits 0-1: clear
  return img.normalizedDifference(['sur_refl_b04', 'sur_refl_b02']).rename('ndwi')
    .updateMask(good).copyProperties(img, ['system:time_start']);
}

var modis = ee.ImageCollection('MODIS/061/MOD09A1')
  .filterDate('2000-01-01', '2025-01-01')
  .filterBounds(aoi)
  .map(ndwi);
print('MODIS 8-day images', modis.size());

// Water where NDWI > 0.1 (try other thresholds!).
var water = modis.map(function (img) {
  return img.gt(0.1).copyProperties(img, ['system:time_start']);
});

// Frequency = water observations / clear observations x 100.
var waterCount = water.sum();
var clearCount = water.count();
var frequency = waterCount.divide(clearCount).multiply(100).rename('water_pct').clip(aoi);

var VIS = {min: 0, max: 100, palette: ['ffffff', 'fff59d', '81c784', '29b6f6', '0d47a1']};
Map.addLayer(modis.mean().clip(aoi), {min: -0.5, max: 0.5}, 'Mean NDWI', false);
Map.addLayer(frequency, VIS, 'Water frequency (%)');

Export.image.toDrive({
  image: frequency.toFloat(),
  description: 'lesson2_water_frequency',
  region: aoi, scale: 500, crs: 'EPSG:4326', maxPixels: 1e13
});

// Exercise: compute the frequency for 2000-2010 and 2015-2025 separately and
// subtract them. Where has the lagoon lost water?
