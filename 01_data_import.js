/**
 * Lesson 1 · Loading, filtering and exporting satellite data
 * ----------------------------------------------------------
 * Goal: build a cloud-free Landsat composite of a river basin, display it as
 * a false-colour image and export it to Google Drive.
 *
 * You will learn: FeatureCollections, ImageCollection filters (place, date,
 * season), cloud masking, scaling Collection 2 reflectance, Map.addLayer and
 * Export.image.toDrive.
 *
 * Course: Earth Engine for water resources · Parisa Abbasalizadehrezaei
 * https://github.com/RisaRezaei/gee-water-resources-course · MIT License
 */

// 1. Study area: the HydroBASINS level-4 basin that contains Lake Urmia.
//    Replace the point to study another basin.
var basin = ee.FeatureCollection('WWF/HydroSHEDS/v1/Basins/hybas_4')
  .filterBounds(ee.Geometry.Point([45.6, 37.6]));
Map.centerObject(basin, 7);
Map.addLayer(basin.style({color: 'ffffff', fillColor: '00000000'}), {}, 'Basin');

// 2. Cloud mask + scale factors for Landsat Collection 2 Level-2.
function prepL89(img) {
  var qa = img.select('QA_PIXEL');
  var clear = qa.bitwiseAnd(1 << 3).eq(0)      // cloud
    .and(qa.bitwiseAnd(1 << 4).eq(0));          // cloud shadow
  var sr = img.select('SR_B[1-7]').multiply(0.0000275).add(-0.2);
  return sr.updateMask(clear).copyProperties(img, ['system:time_start']);
}

// 3. Filter by place, date and season (January to June), then average.
var landsat = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
  .filterBounds(basin)
  .filterDate('2021-01-01', '2025-01-01')
  .filter(ee.Filter.calendarRange(1, 6, 'month'))
  .map(prepL89);

print('Number of Landsat scenes', landsat.size());

var composite = landsat.median().clip(basin);

// 4. False colour (SWIR1, NIR, Red): vegetation is green, water is dark blue.
Map.addLayer(composite, {bands: ['SR_B6', 'SR_B5', 'SR_B4'], min: 0, max: 0.4},
  'Landsat 8/9 false colour');

// 5. Export at 100 m. No getInfo() needed: give the CRS as a string.
Export.image.toDrive({
  image: composite.toFloat(),
  description: 'lesson1_landsat_composite',
  region: basin.geometry(),
  scale: 100,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

// Exercise: change the season to July-September. How does the lake look?
