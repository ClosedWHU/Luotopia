// Parses the study-status index page HTML into ids, names, modes, credits,
// and a credit-requirement tree.
//
// The page embeds credit requirements via HTML attributes using Pinyin
// abbreviations: xfyqjd_id = 学分要求节点_id (requirement node id),
// fxfyqjd_id = 父学分要求节点_id (parent node id),
// jdkcsx = 节点课程属性 (requirement type),
// yxxf = 已修学分 (earned credits), yqzdxf = 要求最低学分 (min required credits).
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

// Collects all requirement ids (plus two synthetic fixed ids) from the page.
function discoverIds(html) {
  var pattern = /xfyqjd_id='([A-F0-9]{32})'/g;
  var ids = {};
  var m;
  while ((m = pattern.exec(html)) !== null) {
    ids[m[1]] = true;
  }
  var result = Object.keys(ids);
  // qtkcxfyq = 其他课程学分要求 / cxcyqkxfyq = 创新创业区学分要求 (scope ids).
  result.push('qtkcxfyq', 'cxcyqkxfyq');
  return result;
}

// Maps requirement ids to their display names by reading <p class='title1'>.
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

// Maps requirement ids to their requirement type code (jdkcsx = 节点课程属性).
function discoverModes(html) {
  var result = {};
  var pattern = /xfyqjd_id='([A-F0-9]{32})' jdkcsx='([0-9]+)'/g;
  var m;
  while ((m = pattern.exec(html)) !== null) {
    if (!result[m[1]]) result[m[1]] = m[2];
  }
  return result;
}

// Maps requirement ids to earned/required credit pairs (yxxf / yqzdxf).
// yxxf = 已修学分, yqzdxf = 要求最低学分.
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

// Reconstructs the parent/child relationships between credit requirements.
// Relationships can be encoded either as li attributes or .appendTo calls.
// fxfyqjd_id = 父学分要求节点_id (parent node id).
function buildTree(html, idToName, idToCredits) {
  var childToParent = {};
  var discoveredIds = {};

  var liPattern = /<li\b[^>]*>/g;
  // liIdPattern = id='li...' form; childAttrPattern = xfyqjd_id form.
  var liIdPattern = /\bid='li([A-F0-9]{32})'/;
  var childAttrPattern = /\bxfyqjd_id='([A-F0-9]{32})'/;
  var parentAttrPattern = /\bfxfyqjd_id='([A-F0-9]{32})'/;

  var m;
  // Strategy 1: derive parent-child from li attributes on the same element.
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

  // Strategy 2: derive parent-child from .appendTo(#ul...) calls; the child
  // name is the last title preceding the appendTo call.
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

  // Build a parent -> children mapping for every known id.
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

  // Roots are named nodes that are never a child.
  var childSet = {};
  for (var c in childToParent) childSet[c] = true;

  var rootIds = [];
  for (var id in parentToChildren) {
    if (idToName[id] && !childSet[id]) rootIds.push(id);
  }

  // Depth-first build with cycle detection via the visiting set.
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
