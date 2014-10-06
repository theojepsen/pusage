var spawn = require('child_process').spawn;
var fs = require('fs');
var async = require('async');

function shouldRun (f) {
  if (f === __filename.replace(__dirname + '/', '')) return false; // not this file
  return f.match(/\.js$/);
}

function runIt (f) {
  f = __dirname + '/' + f;
  return function (cb) {
    var p = spawn('node', [f]);
    p.stdout.pipe(process.stdout);
    p.stderr.pipe(process.stderr);
    p.on('exit', function (code) {
      if (code !== 0) process.exit(1);
      cb();
    });
  };
}

async.parallel(
  fs.readdirSync(__dirname).filter(shouldRun).map(runIt),
  function (error) {
    if (error) console.warn(error);
    process.exit(error ? 1 : 0);
  }
);
