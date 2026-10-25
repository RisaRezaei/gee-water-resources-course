/**
 * Lesson 6 · Where is rainfall changing? Pixel-wise trends
 * ---------------------------------------------------------
 * Goal: map the trend in annual precipitation over a country from CHIRPS
 * (1981 onward) with Sen's slope, and test it with the Mann-Kendall statistic.
 *
 * You will learn: building annual totals from a daily collection, per-pixel
 * reducers (sensSlope, kendallsCorrelation), and zonal summaries.
 *
 * Course: Earth Engine for water resources · Parisa Abbasalizadehrezaei
 * https://github.com/RisaRezaei/gee-water-resources-course · MIT License
 */

var country = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
  .filter(ee.Filter.eq('country_na', 'Iran'));
Map.centerObject(country, 5);

var FIRST = 1981, LAST = 2024;
var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/PENTAD');   // 5-day totals, mm

// One image per year: annual total precipitation plus a "year" band.
var years = ee.List.sequence(FIRST, LAST);
var annual = ee.ImageCollection(years.map(function (y) {
  var total = chirps.filter(ee.Filter.calendarRange(y, y, 'year')).sum().rename('precip');
  return ee.Image.constant(y).toFloat().rename('year').addBands(total)
    .set('year', y).set('system:time_start', ee.Date.fromYMD(y, 7, 1).millis());
}));

// Sen's slope (mm per year): median of all pairwise slopes, robust to outliers.
var sen = annual.select(['year', 'precip']).reduce(ee.Reducer.sensSlope())
  .select('slope').clip(country);

// Mann-Kendall test: Kendall's tau between time and precipitation, per pixel.
var tau = annual.select(['year', 'precip']).reduce(ee.Reducer.kendallsCorrelation(2))
  .select('tau').clip(country);
// Normal approximation (no ties): z = 3 tau sqrt(n(n-1)) / sqrt(2(2n+5)).
// |z| > 1.96 means the trend is significant at the 5 % level.
var n = LAST - FIRST + 1;
var z = tau.multiply(3 * Math.sqrt(n * (n - 1)) / Math.sqrt(2 * (2 * n + 5)));
var significant = z.abs().gt(1.96);

var mean = annual.select('precip').mean().clip(country);

Map.addLayer(mean, {min: 0, max: 800, palette: ['fff7bc', 'fec44f', '41b6c4', '225ea8', '081d58']},
  'Mean annual precipitation (mm)', false);
Map.addLayer(sen, {min: -5, max: 5, palette: ['8c510a', 'd8b365', 'f5f5f5', '5ab4ac', '01665e']},
  "Sen's slope (mm/yr)");
Map.addLayer(significant.selfMask(), {palette: ['000000'], opacity: 0.4}, 'Significant trend (p < 0.05)', false);

// Country-wide annual series.
var series = annual.map(function (img) {
  return ee.Feature(null, img.select('precip').reduceRegion({
    reducer: ee.Reducer.mean(), geometry: country.geometry(), scale: 10000, maxPixels: 1e10
  })).set('year', img.get('year'));
});
print(ui.Chart.feature.byFeature(series, 'year', 'precip').setChartType('ColumnChart')
  .setOptions({title: 'Annual precipitation, country mean (CHIRPS)', legend: {position: 'none'},
               hAxis: {format: '####'}, vAxis: {title: 'mm'}, colors: ['1e88e5'],
               trendlines: {0: {color: 'e53935'}}}));

Export.image.toDrive({
  image: sen.toFloat(), description: 'lesson6_precip_sens_slope',
  region: country.geometry().bounds(), scale: 5566, crs: 'EPSG:4326', maxPixels: 1e13
});

// Exercise: repeat for the wet season only (October-April). Is the trend stronger?
