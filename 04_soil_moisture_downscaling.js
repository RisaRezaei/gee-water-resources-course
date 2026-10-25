/**
 * Lesson 4 · Downscaling SMAP soil moisture with Random Forest
 * ------------------------------------------------------------
 * Goal: predict 1 km soil moisture from coarse SMAP (9 km) data using fine-
 * resolution predictors: MODIS vegetation, temperature and water indices,
 * terrain and Sentinel-1 radar backscatter.
 *
 * Idea: train a regression model where both sides are coarse (predictors
 * averaged to the SMAP grid), then apply it to the 1 km predictors.
 *
 * You will learn: stacking predictors from many sensors, sampling, Random
 * Forest regression, a hold-out check (R², RMSE), and prediction.
 *
 * Course: Earth Engine for water resources · Parisa Abbasalizadehrezaei
 * https://github.com/RisaRezaei/gee-water-resources-course · MIT License
 */

var basin = ee.FeatureCollection('WWF/HydroSHEDS/v1/Basins/hybas_4')
  .filterBounds(ee.Geometry.Point([45.6, 37.6]));            // Lake Urmia basin
var region = basin.geometry();
Map.centerObject(basin, 7);

var START = '2023-04-01', END = '2023-07-01';                  // spring 2023

// ---- Target: SMAP enhanced L3 (9 km), morning overpass ------------------
var smap = ee.ImageCollection('NASA/SMAP/SPL3SMP_E/006')
  .filterDate(START, END).select('soil_moisture_am').mean().rename('sm').clip(region);

// ---- Predictors (1 km or finer) -----------------------------------------
var ndvi = ee.ImageCollection('MODIS/061/MOD13A2').filterDate(START, END)
  .select(['NDVI', 'EVI']).mean().multiply(0.0001);
var lst = ee.ImageCollection('MODIS/061/MOD11A2').filterDate(START, END)
  .select(['LST_Day_1km', 'LST_Night_1km']).mean().multiply(0.02).subtract(273.15)
  .rename(['lst_day', 'lst_night']);
var ndwi = ee.ImageCollection('MODIS/061/MOD09A1').filterDate(START, END).mean()
  .normalizedDifference(['sur_refl_b02', 'sur_refl_b06']).rename('ndwi');   // Gao NDWI (NIR, SWIR)
var dem = ee.Image('USGS/SRTMGL1_003').rename('elev');
var slope = ee.Terrain.slope(dem).rename('slope');
var vv = ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(region).filterDate(START, END)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .select('VV').mean().rename('vv_db');

var predictors = ee.Image.cat([ndvi, lst, ndwi, dem, slope, vv]).clip(region);
var bands = predictors.bandNames();

// ---- Training at the SMAP scale -----------------------------------------
// Sampling at 9 km makes Earth Engine average the 1 km predictors to that
// scale, so inputs and target describe the same footprint.
var samples = predictors.addBands(smap).sample({
  region: region, scale: 9000, numPixels: 3000, seed: 1, geometries: true, tileScale: 4
}).randomColumn('r', 1);
var train = samples.filter(ee.Filter.lt('r', 0.7));
var test = samples.filter(ee.Filter.gte('r', 0.7));

var rf = ee.Classifier.smileRandomForest({numberOfTrees: 100, seed: 1})
  .setOutputMode('REGRESSION')
  .train({features: train, classProperty: 'sm', inputProperties: bands});

// ---- Hold-out check -----------------------------------------------------
var pred = test.classify(rf, 'pred');
var stats = pred.reduceColumns(ee.Reducer.pearsonsCorrelation(), ['sm', 'pred']);
var rmse = ee.Number(pred.map(function (f) {
  return f.set('se', ee.Number(f.get('sm')).subtract(f.get('pred')).pow(2));
}).aggregate_mean('se')).sqrt();
print('Training / test samples', train.size(), test.size());
print('R² (test)', ee.Number(stats.get('correlation')).pow(2));
print('RMSE (m³/m³)', rmse);
print(ui.Chart.feature.byFeature(pred, 'sm', 'pred').setChartType('ScatterChart')
  .setOptions({title: 'SMAP vs predicted (test set)', hAxis: {title: 'SMAP'},
               vAxis: {title: 'Predicted'}, pointSize: 3, legend: {position: 'none'}}));

// ---- Prediction at 1 km --------------------------------------------------
var sm1km = predictors.classify(rf).rename('sm_1km')
  .reproject({crs: 'EPSG:4326', scale: 1000});
var VIS = {min: 0.05, max: 0.40, palette: ['8c510a', 'd8b365', 'f6e8c3', 'c7eae5', '5ab4ac', '01665e']};
Map.addLayer(smap, VIS, 'SMAP 9 km', false);
Map.addLayer(sm1km, VIS, 'Downscaled 1 km');

var importance = ee.Dictionary(ee.Dictionary(rf.explain()).get('importance'));
print('Variable importance', importance);

Export.image.toDrive({
  image: sm1km.toFloat(), description: 'lesson4_soil_moisture_1km',
  region: region, scale: 1000, crs: 'EPSG:4326', maxPixels: 1e13
});

// Exercise: drop the radar band. How much do R² and the map change?
