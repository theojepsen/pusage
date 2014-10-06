var spawn = require('child_process').spawn;
var fs = require('fs');
var expect = require('expect.js');
var PUsage = require('../lib/pusage.js');

var top = spawn('top', ['-b', '-d', '.1']);
top.stdout.pipe(fs.createWriteStream('/dev/null'));

var usage = PUsage({interval: 500});
usage.watch(top.pid);

var lastTime = 0;
usage.on('log', function (s, line) {
  if (s.time < 1) return;
  expect(s).to.be.an('object');
  expect(line).to.be.a('string');
  expect(s.pid).to.be(top.pid);
  expect(s.name).to.be('top');
  expect(s.cpu).to.be(s.user_cpu + s.sys_cpu);
  expect(s.syscr).to.be.greaterThan(10);
  expect(s.syscw).to.be.greaterThan(10);
  expect(s.VmRSS).to.be.greaterThan(500);
  expect(s.VmSize).to.be.greaterThan(1000);
  expect(s.syscrPerSecond).to.be.greaterThan(10);
  expect(s.syscwPerSecond).to.be.greaterThan(10);
  expect(s.rcharPerSecond).to.be.greaterThan(100);
  expect(s.wcharPerSecond).to.be.greaterThan(100);
  expect(s.time).to.be.greaterThan(lastTime);
  if (lastTime > 10) {
    usage.unwatch(top.pid);
    top.kill();
    setTimeout(function () {
      // run for a little longer -- should not crash!
      process.exit(0); 
    }, 1000);
  }
  lastTime = s.time;
});
