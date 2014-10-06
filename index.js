#! /usr/bin/env node
var spawn = require('child_process').spawn;
var PUsage = require('./lib/pusage.js');
var fs = require('fs');

module.exports = PUsage;

if (require.main !== module) return;

var optimist = require('optimist')
  .usage('Usage: $0 [OPTIONS] <PID|PROCESS_NAME>...')
  .alias('h', 'help')
  .describe('h', 'Display this message.')
  .alias('i', 'interval')
  .describe('i', 'Polling interval (ms) for gathering stats.')
  .default('i', 500)
  .alias('e', 'execute')
  .describe('e', 'Execute a command and monitor its system usage.')
  .default('e', false)
  .alias('o', 'outfile')
  .describe('o', 'File to write to. Defaults to stdout.')
  .default('o', '-');

var argv = optimist.argv;
if (argv.help || (argv._.length < 1 && !argv.e)) {
  optimist.showHelp();
  process.exit();
}

var opts = {
  interval: argv.interval
};
if (argv.outfile === '-')
  opts.logStream = process.stdout;
else
  opts.logFile = argv.outfile;

var toWatch = [];
if (argv.e) {
  var args = argv.e.split(' ');
  var child = spawn(args.shift(), args);
  toWatch.push(child.pid);
  child.stdout.pipe(fs.createWriteStream('/dev/null'));
  child.on('exit', process.exit);
}

var proc;
for (var i = 0; (proc = argv._[i]); i++) {
  if (parseInt(proc, 10).toString() === proc) proc = parseInt(proc, 10);
  toWatch.push(proc);
}

var pusage = PUsage(opts);
toWatch.forEach(function(proc) {
  pusage.watch(proc);
});
