function parse(rawJson) {
  var input = JSON.parse(rawJson);
  var html = typeof input.html === 'string' ? input.html : '';

  var ids = discoverIds(html);
  var names = input.names || discoverNames(html);
  var modes = discoverModes(html);
  var credits = input.credits || discoverCredits(html);
  var tree = buildTree(html, names, credits);

  return JSON.stringify({
    ids: ids,
    names: names,
    modes: modes,
    credits: credits,
    tree: tree
  });
}

function discoverIds(html) {
  var pattern = /xfyqjd_id='([A-F0-9]{32})'/g;
  var ids = {};
  var m;
  while ((m = pattern.exec(html)) !== null) {
    ids[m[1]] = true;
  }
  var result = Object.keys(ids);
  result.push('qtkcxfyq', 'cxcyqkxfyq');
  return result;
}

function discoverNames(html) {
  var result = {};
  var pattern = /<p class='title1' id='p([A-F0-9]{32})'/g;
  var m;
  while ((m = pattern.exec(html)) !== null) {
    var id = m[1];
    var closeIdx = html.indexOf('>', m.index + m[0].length);
    if (closeIdx === -1) continue;
    var nbspIdx = html.indexOf('&nbsp;', closeIdx);
    if (nbspIdx === -1) continue;
    var raw = html.substring(closeIdx + 1, nbspIdx);
    var lastQuote = raw.lastIndexOf('"');
    if (lastQuote !== -1) raw = raw.substring(lastQuote + 1);
    var name = raw.trim();
    if (name.length > 0 && name.indexOf('get(') === -1) {
      result[id] = name;
    }
  }
  return result;
}

function discoverModes(html) {
  var result = {};
  var pattern = /xfyqjd_id='([A-F0-9]{32})' jdkcsx='([0-9]+)'/g;
  var m;
  while ((m = pattern.exec(html)) !== null) {
    if (!result[m[1]]) result[m[1]] = m[2];
  }
  return result;
}

function discoverCredits(html) {
  var result = {};
  var pattern = /id='p([A-F0-9]{32})' yxxf='([0-9.]+)' yqzdxf='([0-9.]+)'/g;
  var m;
  while ((m = pattern.exec(html)) !== null) {
    if (!result[m[1]]) {
      result[m[1]] = {
        earnedCredits: parseFloat(m[2]) || 0,
        requiredCredits: parseFloat(m[3]) || 0
      };
    }
  }
  return result;
}

function buildTree(html, idToName, idToCredits) {
  var childToParent = {};
  var discoveredIds = {};

  var liPattern = /<li\b[^>]*>/g;
  var liIdPattern = /\bid='li([A-F0-9]{32})'/;
  var childAttrPattern = /\bxfyqjd_id='([A-F0-9]{32})'/;
  var parentAttrPattern = /\bfxfyqjd_id='([A-F0-9]{32})'/;

  var m;
  while ((m = liPattern.exec(html)) !== null) {
    var li = m[0];
    var childIdMatch = liIdPattern.exec(li) || childAttrPattern.exec(li);
    if (!childIdMatch) continue;
    var childId = childIdMatch[1];
    discoveredIds[childId] = true;

    var parentMatch = parentAttrPattern.exec(li);
    if (parentMatch && parentMatch[1] !== childId) {
      if (!childToParent[childId]) childToParent[childId] = parentMatch[1];
      discoveredIds[parentMatch[1]] = true;
    }
  }

  var appendToPattern = /\.appendTo\(\$\((['\"])#ul([A-F0-9]{32})\1\)\)/g;
  var pIdPattern = /<p class='title1' id='p([A-F0-9]{32})'/g;

  while ((m = appendToPattern.exec(html)) !== null) {
    var parentId = m[2];
    var previousHtml = html.substring(0, m.index);
    var pMatches = [];
    var pm;
    pIdPattern.lastIndex = 0;
    while ((pm = pIdPattern.exec(previousHtml)) !== null) {
      pMatches.push(pm);
    }
    if (pMatches.length === 0) continue;
    var childId2 = pMatches[pMatches.length - 1][1];
    discoveredIds[childId2] = true;
    discoveredIds[parentId] = true;
    if (childId2 !== parentId && !childToParent[childId2]) {
      childToParent[childId2] = parentId;
    }
  }

  var parentToChildren = {};
  var allIds = {};
  var k;
  for (k in idToName) allIds[k] = true;
  for (k in discoveredIds) allIds[k] = true;
  for (k in allIds) parentToChildren[k] = [];

  for (var child in childToParent) {
    var parent = childToParent[child];
    if (!parentToChildren[parent]) parentToChildren[parent] = [];
    if (parentToChildren[parent].indexOf(child) === -1) {
      parentToChildren[parent].push(child);
    }
    if (!parentToChildren[child]) parentToChildren[child] = [];
  }

  var childSet = {};
  for (var c in childToParent) childSet[c] = true;

  var rootIds = [];
  for (var id in parentToChildren) {
    if (idToName[id] && !childSet[id]) rootIds.push(id);
  }

  var visiting = {};
  function buildNode(id) {
    if (visiting[id]) {
      return { name: idToName[id] || id, requiredCredits: 0, earnedCredits: 0, children: [] };
    }
    visiting[id] = true;
    var children = (parentToChildren[id] || [])
      .filter(function(cid) { return idToName[cid]; })
      .map(buildNode);
    delete visiting[id];
    var credits = idToCredits[id] || {};
    return {
      name: idToName[id] || id,
      requiredCredits: credits.requiredCredits || 0,
      earnedCredits: credits.earnedCredits || 0,
      children: children
    };
  }

  return rootIds.map(buildNode);
}
