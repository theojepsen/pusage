var spawn = require('child_process').spawn;
var fs = require('fs');
var rimraf = require('rimraf');
var expect = require('expect.js');
var PUsage = require('../lib/pusage.js');

var tmpdir = __dirname + '/tmp';
if (fs.existsSync(tmpdir))
  rimraf.sync(tmpdir);
fs.mkdirSync(tmpdir);
var allFile = tmpdir + '/all.log';

var top = spawn('top', ['-b', '-d', '.1']);
top.stdout.pipe(fs.createWriteStream('/dev/null'));
var topFile = tmpdir + '/top.log';

var vmstat = spawn('vmstat', ['1', '10']);
vmstat.stdout.pipe(fs.createWriteStream('/dev/null'));
var vmstatFile = tmpdir + '/vmstat.log';

var usage = PUsage({interval: 100, logFile: tmpdir + '/all.log'});

usage.watch(top.pid, fs.createWriteStream(topFile));

setTimeout(function () {
  usage.watch(vmstat.pid, vmstatFile);
  expect(fs.existsSync(allFile)).to.be(true);
  expect(fs.existsSync(topFile)).to.be(true);
  setTimeout(function () {
    usage.stop();
    top.kill();
    vmstat.kill();

    expect(fs.existsSync(vmstatFile)).to.be(true);

    var topLogData = fs.readFileSync(topFile).toString();
    var vmstatLogData = fs.readFileSync(vmstatFile).toString();
    var allLogData = fs.readFileSync(allFile).toString();

    expect(topLogData).to.contain('Time,'); // contains column titles
    expect(topLogData).to.contain('top');
    expect(topLogData).to.not.contain('vmstat');

    expect(vmstatLogData).to.contain('Time,'); // contains column titles
    expect(vmstatLogData).to.contain('vmstat');
    expect(vmstatLogData).to.not.contain('top');

    expect(allLogData).to.contain('Time,');
    expect(allLogData).to.contain('vmstat');
    expect(allLogData).to.contain('top');

    rimraf.sync(tmpdir);
  
  }, 900);
}, 900);
