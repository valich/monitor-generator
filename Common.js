global.extend = function(to, from, rec) {
  if (rec === undefined) {
    rec = false;
  }
  for (var i in from) {
    if (rec && (i in to) && (typeof to[i] == 'object')) {
      extend(to[i], from[i], rec);
    } else {
      to[i] = from[i];
    }
  }
  return to;
}
