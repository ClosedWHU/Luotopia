// Parses campus bus data, supporting "line" (route) and "vehicles" payloads.
function parse(rawJson) {
  var input = JSON.parse(rawJson);
  if (input.kind === 'line') return parseLine(input);
  if (input.kind === 'vehicles') return parseVehicles(input);
  throw new Error('Unsupported campus bus payload');
}

// Parses a bus route: stops with coordinates and basic line metadata.
function parseLine(input) {
  var data = input.data || {};
  var rawStops = Array.isArray(data.stops) ? data.stops : [];
  var stops = [];
  for (var i = 0; i < rawStops.length; i++) {
    var stop = rawStops[i] || {};
    var id = text(stop.stopId);
    var name = text(stop.stopName);
    // stopOrder = the stop's sequence index along the route.
    var index = integer(stop.stopOrder);
    // lng / lat = longitude / latitude of the stop.
    var lng = number(stop.lng);
    var lat = number(stop.lat);
    if (!id || !name || index === null || lng === null || lat === null) continue;
    stops.push({ id: id, name: name, index: index, lng: lng, lat: lat });
  }
  return JSON.stringify({
    schemaVersion: 1,
    kind: 'line',
    line: {
      lineId: text(data.lineId),
      // line2Id = the reverse-direction line id of the same route.
      oppositeLineId: text(data.line2Id),
      // lineNo = the human-readable line number (e.g. "校车1号线").
      lineNo: text(data.lineNo),
      // direction "0" means the default/forward direction.
      direction: text(data.direction) === '0',
      firstTime: text(data.firstTime),
      lastTime: text(data.lastTime),
      priceRange: text(data.price),
      stops: stops
    }
  });
}

// Parses a pipe-delimited vehicle list ("num|x|stationIndex|arrive|lon|lat").
function parseVehicles(input) {
  var raw = Array.isArray(input.vehicles) ? input.vehicles : [];
  var vehicles = [];
  for (var i = 0; i < raw.length; i++) {
    var parts = text(raw[i]).split('|');
    if (parts.length !== 6) continue;
    // parts[1] is unused (a placeholder "x" in the source payload).
    var stationIndex = integer(parts[2]);
    // arrive = "1" if the bus has arrived at the station, otherwise "0".
    var arrive = integer(parts[3]);
    var lon = number(parts[4]);
    var lat = number(parts[5]);
    if (stationIndex === null || arrive === null || lon === null || lat === null) continue;
    vehicles.push({
      // num = the vehicle identifier (e.g. bus plate number or code).
      num: text(parts[0]), stationIndex: stationIndex, arrive: arrive === 1,
      lon: lon, lat: lat
    });
  }
  vehicles.sort(function(a, b) { return a.stationIndex - b.stationIndex; });
  return JSON.stringify({ schemaVersion: 1, kind: 'vehicles', vehicles: vehicles });
}

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}
function integer(value) {
  var valueText = text(value);
  if (!/^-?\d+$/.test(valueText)) return null;
  var parsed = Number(valueText);
  return isFinite(parsed) ? parsed : null;
}
function number(value) {
  var valueText = text(value);
  if (!valueText) return null;
  var parsed = Number(valueText);
  return isFinite(parsed) ? parsed : null;
}
