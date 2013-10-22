if (!global.fs) {
  global.fs = require("fs");
}
require('./Common.js');

Scanner = function(path, options) {
  this.options = extend({
    encoding: 'binary',
    bufferSize: 64 * 1024,
    delimiters: ' \n\r'
  }, options);

  this.updateDelimiters(options.delimiters);

  this.bufRes = new Buffer(this.options.bufferSize);
  this.bufRead = new Buffer(this.options.bufferSize);
  this.rl = this.options.bufferSize;
  this.rr = this.options.bufferSize;
  this.bl = 0;
  this.br = 0;
  
  this.fd = fs.openSync(path, 'r');
}

Scanner.prototype.seek = function() {
  while (this.rl == this.rr) {
    if (this.rr < this.options.bufferSize) {
      return false;
    }
    var numBytes = fs.readSync(this.fd, this.bufRead, 0, this.options.bufferSize, null);
    if (numBytes == 0) {
      return false;
    } else {
      this.rl = 0;
      this.rr = numBytes;
    }
  }
  return true;
}

Scanner.prototype.next = function() {
  var done = false;
  while (!done) {
    if (!this.seek()) {
      if (this.bl == this.br) {
        return null;
      } else {
        break;
      }
    }
    while (this.rl < this.rr) {
      if (this.delims.indexOf(this.bufRead[this.rl]) != -1) {
        this.rl++;
        if (this.bl == this.br) {
          continue;
        } else {
          done = true;
          break;
        }
      }
      this.bufRes[this.br++] = this.bufRead[this.rl++];
      if (this.br == this.options.bufferSize) {
        this.br = 0;
      }
      if (this.br == this.bl - 1) done = true;
    }
  }

  var ret;
  if (this.bl < this.br) {
    ret = this.bufRes.toString(this.options.encoding, this.bl, this.br);
  } else {
    ret = this.bufRes.toString(this.options.encoding, this.bl, this.options.bufferSize) + 
          this.bufRes.toString(this.options.encoding, 0, this.br);
  }
  this.bl = this.br;
  return ret;
}

Scanner.prototype.nextNumber = function() {
  return Number(this.next());
}

Scanner.prototype.updateDelimiters = function(newdel) {
  this.options.delimiters = newdel;
  this.delims = [];
  for (var i in newdel) {
    this.delims.push(newdel.charCodeAt(i));
  }
}
