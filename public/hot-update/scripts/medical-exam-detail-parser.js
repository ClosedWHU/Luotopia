function parse(rawJson) {
  var html = text(JSON.parse(rawJson).html), title = first(html, /<p[^>]*class=["'][^"']*font6[^"']*f18[^"']*["'][^>]*>([\s\S]*?)<\/p>/i), fields = {}, sections = [];
  var header = /<div[^>]*class=["'][^"']*p10[^"']*bgw[^"']*borderBottom[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (header) { var ps = texts(header[1]); if (ps.length) fields['检查科室'] = ps[0]; for (var i=0;i<ps.length;i++) if (ps[i].indexOf('发布时间') === 0) fields['发布时间'] = ps[i].replace(/^发布时间\s*[:：]?\s*/, ''); }
  var labels = /<p[^>]*class=["'][^"']*font333[^"']*opacity90[^"']*["'][^>]*>\s*(检查描述|检查所见|检查结果)\s*[:：]?\s*<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/gi, m;
  while ((m = labels.exec(html)) !== null) sections.push({ title: m[1], content: clean(m[2]) });
  var notice = /温馨提示[\s\S]*?<\/p>/i.exec(html); if (notice) fields['温馨提示'] = clean(notice[0]);
  return JSON.stringify({ schemaVersion: 1, title: title, fields: fields, sections: sections });
}
function first(html, re) { var m = re.exec(html); return m ? clean(m[1]) : ''; }
function texts(html) { var out=[], re=/<p\b[^>]*>([\s\S]*?)<\/p>/gi, m; while((m=re.exec(html))!==null){var t=clean(m[1]);if(t)out.push(t);}return out; }
function clean(value) { return text(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim(); }
function text(value) { return value === undefined || value === null ? '' : String(value); }
